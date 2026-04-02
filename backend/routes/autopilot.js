import { Router } from 'express';

/**
 * Autopilot — fully automated score → recommend → apply → render loop.
 *
 * Sessions are persisted to SQLite so they survive server restarts.
 * On startup, any session marked as running is automatically resumed.
 *
 * Runs on a branch, iterating unattended until a termination condition:
 * - Target score reached (default 65/75)
 * - Max iterations reached (default 20)
 * - N consecutive regressions (default 3)
 *
 * Each cycle:
 * 1. Find latest iteration on the branch
 * 2. If not scored → score via Vision API
 * 3. Check termination conditions
 * 4. Generate next iteration (apply Vision recommendation)
 * 5. Queue render
 * 6. Wait for render completion
 * 7. Extract frames
 * 8. Loop back to step 1
 */
export function createAutopilotRoutes(store, config) {
  const router = Router();
  const COLLECTION = 'autopilot_sessions';

  // In-memory handle to running loops (branchId → { abortController })
  // The session DATA lives in SQLite; this just tracks the active async loop.
  const activeLoops = new Map();

  // --- Persistence helpers ---

  async function loadSession(branchId) {
    try {
      const sessions = await store.list(COLLECTION, s => s.branch_id === branchId);
      return sessions.length > 0 ? sessions[0] : null;
    } catch { return null; }
  }

  async function saveSession(session) {
    try {
      const existing = await loadSession(session.branch_id);
      if (existing) {
        await store.update(COLLECTION, existing.id, session);
      } else {
        await store.create(COLLECTION, session);
      }
    } catch (err) {
      console.error(`[Autopilot] Failed to persist session ${session.branch_name}:`, err.message);
    }
  }

  async function persistPhase(session, phase, extras = {}) {
    session.phase = phase;
    Object.assign(session, extras);
    await saveSession(session);
  }

  // --- Routes ---

  /**
   * POST /api/autopilot/start
   * Body: { branch_id, target_score?, max_iterations?, regression_limit? }
   */
  router.post('/start', async (req, res) => {
    try {
      const { branch_id, target_score = 65, max_iterations = 20, regression_limit = 3 } = req.body;
      if (!branch_id) return res.status(400).json({ error: 'branch_id required' });

      if (activeLoops.has(branch_id)) {
        return res.status(409).json({ error: 'Autopilot already running on this branch' });
      }

      const branch = await store.get('branches', branch_id);
      const session = {
        running: true,
        branch_id,
        branch_name: branch.name || `seed-${branch.seed}`,
        clip_id: branch.clip_id,
        config: { target_score, max_iterations, regression_limit },
        started_at: new Date().toISOString(),
        current_iteration: 0,
        current_score: null,
        phase: 'starting',
        scores: [],
        log: [],
        error: null,
        completed_at: null,
        verdict: null
      };

      await saveSession(session);
      startLoop(session);

      res.json({ message: 'Autopilot started', branch_id, config: session.config });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/autopilot/status/:branchId
   */
  router.get('/status/:branchId', async (req, res) => {
    const session = await loadSession(req.params.branchId);
    if (!session) return res.json({ running: false });
    // Reflect actual loop state — session may say running but loop may not be active
    const loopActive = activeLoops.has(req.params.branchId);
    res.json({
      running: session.running && loopActive,
      branch_name: session.branch_name,
      phase: session.phase,
      current_iteration: session.current_iteration,
      current_score: session.current_score,
      config: session.config,
      scores: session.scores,
      log: (session.log || []).slice(-20),
      error: session.error,
      started_at: session.started_at,
      completed_at: session.completed_at,
      verdict: session.verdict
    });
  });

  /**
   * POST /api/autopilot/stop/:branchId
   */
  router.post('/stop/:branchId', async (req, res) => {
    const session = await loadSession(req.params.branchId);
    if (!session || !session.running) {
      return res.json({ message: 'No active autopilot on this branch' });
    }
    session.running = false;
    session.phase = 'stopped';
    session.completed_at = new Date().toISOString();
    session.verdict = 'Stopped manually';
    addLog(session, 'Autopilot stopped by user');
    await saveSession(session);
    // The loop checks session.running from DB each cycle and will stop
    activeLoops.delete(req.params.branchId);
    res.json({ message: 'Autopilot stopping after current step completes' });
  });

  /**
   * GET /api/autopilot/sessions — list all sessions (active and completed)
   */
  router.get('/sessions', async (req, res) => {
    const all = await store.list(COLLECTION);
    res.json(all.map(session => ({
      branch_id: session.branch_id,
      branch_name: session.branch_name,
      running: session.running && activeLoops.has(session.branch_id),
      phase: session.phase,
      current_iteration: session.current_iteration,
      current_score: session.current_score,
      scores: session.scores,
      started_at: session.started_at,
      completed_at: session.completed_at,
      verdict: session.verdict,
      error: session.error
    })));
  });

  // --- Recovery on startup ---

  async function recoverSessions() {
    try {
      const sessions = await store.list(COLLECTION, s => s.running === true);
      for (const session of sessions) {
        if (activeLoops.has(session.branch_id)) continue;
        console.log(`[Autopilot] Recovering session: ${session.branch_name} (iter ${session.current_iteration})`);
        addLog(session, 'Recovered after server restart');
        await saveSession(session);
        startLoop(session);
      }
      if (sessions.length > 0) {
        console.log(`[Autopilot] Recovered ${sessions.length} session(s)`);
      }
    } catch (err) {
      console.error('[Autopilot] Recovery failed:', err.message);
    }
  }

  // Recover after a short delay to let the server finish booting
  setTimeout(() => recoverSessions(), 3000);

  // --- Loop management ---

  function startLoop(session) {
    activeLoops.set(session.branch_id, true);
    runAutopilot(session).catch(err => {
      session.running = false;
      session.phase = 'error';
      session.error = err.message;
      session.completed_at = new Date().toISOString();
      saveSession(session);
      console.error(`[Autopilot] Fatal error on ${session.branch_name}:`, err.message);
    }).finally(() => {
      activeLoops.delete(session.branch_id);
    });
  }

  // --- Autopilot engine ---

  function addLog(session, message) {
    const entry = { time: new Date().toISOString(), message };
    if (!session.log) session.log = [];
    session.log.push(entry);
    // Keep log bounded to prevent unbounded DB growth
    if (session.log.length > 100) session.log = session.log.slice(-50);
    console.log(`[Autopilot] ${session.branch_name}: ${message}`);
  }

  async function isSessionStillRunning(session) {
    // Re-read from DB to check if someone stopped it while we were working
    const fresh = await loadSession(session.branch_id);
    return fresh && fresh.running;
  }

  async function runAutopilot(session) {
    const { branch_id, config: { target_score, max_iterations, regression_limit } } = session;
    let consecutiveRegressions = 0;
    let previousScore = null;
    const port = config.port || 3847;
    const baseUrl = `http://localhost:${port}`;

    // Rebuild regression tracking from existing scores
    if (session.scores && session.scores.length > 0) {
      previousScore = session.scores[session.scores.length - 1].grand_total;
      // Count trailing regressions
      for (let i = session.scores.length - 1; i > 0; i--) {
        if (session.scores[i].grand_total < session.scores[i - 1].grand_total) {
          consecutiveRegressions++;
        } else {
          break;
        }
      }
    }

    addLog(session, `Starting autopilot — target ${target_score}/75, max ${max_iterations} iterations`);
    await saveSession(session);

    while (true) {
      // Check if still running (from DB — survives stop requests across restarts)
      if (!await isSessionStillRunning(session)) {
        session.running = false;
        break;
      }

      try {
        // 1. Find latest iteration on this branch
        await persistPhase(session, 'finding_iteration');
        const iterations = await store.list('iterations', i => i.branch_id === branch_id);
        iterations.sort((a, b) => (a.iteration_number || 0) - (b.iteration_number || 0));
        const latest = iterations[iterations.length - 1];

        if (!latest) {
          session.error = 'No iterations found on this branch';
          break;
        }

        session.current_iteration = latest.iteration_number;
        addLog(session, `Iteration ${latest.iteration_number} (${latest.json_filename || latest.id.substring(0, 8)})`);

        // 2. Wait for render if pending/queued
        if (latest.status === 'pending' || latest.status === 'queued') {
          await persistPhase(session, 'waiting_for_render');
          addLog(session, 'Waiting for render to complete...');
          await waitForRender(session, latest, baseUrl);
          if (!await isSessionStillRunning(session)) { session.running = false; break; }
          continue;
        }

        // 3. If failed, abort
        if (latest.status === 'failed') {
          session.error = `Iteration ${latest.iteration_number} failed to render`;
          session.verdict = `Stopped: render failure at iteration ${latest.iteration_number}`;
          break;
        }

        // 4. Score if not yet evaluated
        if (!latest.evaluation) {
          await persistPhase(session, 'scoring');
          addLog(session, 'Scoring via Vision API...');

          await waitForFrames(session, latest.id, baseUrl);
          if (!await isSessionStillRunning(session)) { session.running = false; break; }

          const scoreRes = await fetch(`${baseUrl}/api/vision/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iteration_id: latest.id, force: true })
          });
          if (!scoreRes.ok) {
            const err = await scoreRes.json();
            throw new Error(`Vision scoring failed: ${err.error}`);
          }
          const scoreResult = await scoreRes.json();

          const evalRes = await fetch(`${baseUrl}/api/iterations/${latest.id}/evaluate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scores: scoreResult.scores,
              attribution: scoreResult.attribution,
              qualitative_notes: scoreResult.qualitative_notes || '',
              scoring_source: 'vision_api_autopilot'
            })
          });
          if (!evalRes.ok) {
            const err = await evalRes.json();
            throw new Error(`Evaluation save failed: ${err.error}`);
          }

          const grandTotal = scoreResult.grand_total;
          session.current_score = grandTotal;
          session.scores.push({
            iteration: latest.iteration_number,
            iteration_id: latest.id,
            grand_total: grandTotal,
            scores: scoreResult.scores,
            attribution: scoreResult.attribution,
            notes: scoreResult.qualitative_notes
          });

          addLog(session, `Scored: ${grandTotal}/75 | ${scoreResult.attribution?.rope || 'no rope'} → ${scoreResult.attribution?.next_change_description || 'no recommendation'}`);
          await saveSession(session);

          // 5. Check termination conditions
          if (grandTotal >= target_score) {
            session.verdict = `SUCCESS — reached ${grandTotal}/75 (target ${target_score}) in ${latest.iteration_number} iterations`;
            addLog(session, session.verdict);
            break;
          }

          if (latest.iteration_number >= max_iterations) {
            session.verdict = `PLATEAU — reached ${grandTotal}/75 after ${max_iterations} iterations (target was ${target_score})`;
            addLog(session, session.verdict);
            break;
          }

          if (previousScore !== null) {
            if (grandTotal < previousScore) {
              consecutiveRegressions++;
              addLog(session, `Regression: ${grandTotal} < ${previousScore} (${consecutiveRegressions}/${regression_limit} consecutive)`);
              if (consecutiveRegressions >= regression_limit) {
                session.verdict = `DIVERGENCE — ${consecutiveRegressions} consecutive regressions (${previousScore} → ${grandTotal}), best was ${Math.max(...session.scores.map(s => s.grand_total))}/75`;
                addLog(session, session.verdict);
                break;
              }
            } else {
              consecutiveRegressions = 0;
            }
          }
          previousScore = grandTotal;

          // 6. Generate next iteration
          await persistPhase(session, 'generating_next');
          addLog(session, 'Generating next iteration...');

          const nextRes = await fetch(`${baseUrl}/api/iterations/${latest.id}/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (!nextRes.ok) {
            const err = await nextRes.json();
            throw new Error(`Next iteration generation failed: ${err.error}`);
          }
          const nextIter = await nextRes.json();
          addLog(session, `Created iteration ${nextIter.iteration_number}: ${nextIter.json_filename}`);

          // 7. Queue render
          await persistPhase(session, 'queuing_render');
          const queueRes = await fetch(`${baseUrl}/api/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              json_path: nextIter.json_path,
              clip_name: nextIter.json_filename,
              iteration_id: nextIter.id,
              seed: nextIter.seed,
              source: 'autopilot',
              priority: 0
            })
          });
          if (!queueRes.ok) {
            const err = await queueRes.json();
            throw new Error(`Queue failed: ${err.error}`);
          }
          addLog(session, `Queued render for iteration ${nextIter.iteration_number}`);
          await fetch(`${baseUrl}/api/queue/start`, { method: 'POST' }).catch(() => {});
          await saveSession(session);

        } else {
          // Already evaluated — check if we need to generate next or if we're at the end
          const grandTotal = latest.evaluation?.scores ?
            Object.values(latest.evaluation.scores).reduce((sum, group) =>
              sum + Object.values(group).reduce((s, v) => s + v, 0), 0) : 0;

          session.current_score = grandTotal;

          const children = await store.list('iterations', i => i.parent_iteration_id === latest.id);
          if (children.length > 0) {
            addLog(session, `Iteration ${latest.iteration_number} already evaluated (${grandTotal}/75) with child — advancing`);
            await saveSession(session);
            await sleep(1000);
            continue;
          }

          if (grandTotal >= target_score) {
            session.scores.push({ iteration: latest.iteration_number, iteration_id: latest.id, grand_total: grandTotal });
            session.verdict = `SUCCESS — already at ${grandTotal}/75 (target ${target_score})`;
            addLog(session, session.verdict);
            break;
          }

          session.scores.push({ iteration: latest.iteration_number, iteration_id: latest.id, grand_total: grandTotal });
          previousScore = grandTotal;

          addLog(session, `Iteration ${latest.iteration_number} already evaluated (${grandTotal}/75) — generating next`);
          await persistPhase(session, 'generating_next');

          const nextRes = await fetch(`${baseUrl}/api/iterations/${latest.id}/next`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (!nextRes.ok) {
            const err = await nextRes.json();
            throw new Error(`Next iteration generation failed: ${err.error}`);
          }
          const nextIter = await nextRes.json();
          addLog(session, `Created iteration ${nextIter.iteration_number}: ${nextIter.json_filename}`);

          await persistPhase(session, 'queuing_render');
          const queueRes = await fetch(`${baseUrl}/api/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              json_path: nextIter.json_path,
              clip_name: nextIter.json_filename,
              iteration_id: nextIter.id,
              seed: nextIter.seed,
              source: 'autopilot',
              priority: 0
            })
          });
          if (!queueRes.ok) {
            const err = await queueRes.json();
            throw new Error(`Queue failed: ${err.error}`);
          }
          await fetch(`${baseUrl}/api/queue/start`, { method: 'POST' }).catch(() => {});
          addLog(session, `Queued render for iteration ${nextIter.iteration_number}`);
          await saveSession(session);
        }

      } catch (err) {
        addLog(session, `Error: ${err.message}`);
        session.error = err.message;
        if (err.message.includes('rate limit') || err.message.includes('temporarily unavailable')) {
          addLog(session, 'Transient error — retrying in 30s...');
          await saveSession(session);
          await sleep(30000);
          if (!await isSessionStillRunning(session)) { session.running = false; break; }
          continue;
        }
        session.verdict = `ERROR — ${err.message}`;
        break;
      }
    }

    session.running = false;
    session.phase = session.verdict ? 'complete' : 'stopped';
    session.completed_at = new Date().toISOString();
    addLog(session, `Autopilot finished: ${session.verdict || 'stopped'}`);
    await saveSession(session);
  }

  async function waitForRender(session, iteration, baseUrl) {
    const maxWait = 45 * 60 * 1000;
    const pollInterval = 15000;
    const start = Date.now();

    while ((Date.now() - start) < maxWait) {
      if (!await isSessionStillRunning(session)) return;

      try {
        const iter = await store.get('iterations', iteration.id);
        if (iter.status === 'rendered') {
          addLog(session, 'Render complete');
          return;
        }
        if (iter.status === 'failed') throw new Error('Render failed');
      } catch (err) {
        if (err.message === 'Render failed') throw err;
      }

      try {
        const qRes = await fetch(`${baseUrl}/api/queue/iteration/${iteration.id}`);
        const qs = await qRes.json();
        if (qs.status === 'complete') {
          addLog(session, 'Render complete (queue)');
          return;
        }
        if (qs.status === 'failed') throw new Error(`Render failed: ${qs.error || 'unknown'}`);
        if (qs.progress?.percent) {
          session.phase = `rendering (${qs.progress.percent}%)`;
          await saveSession(session);
        }
      } catch (err) {
        if (err.message.startsWith('Render failed')) throw err;
      }

      await sleep(pollInterval);
    }

    throw new Error('Render timed out after 45 minutes');
  }

  async function waitForFrames(session, iterationId, baseUrl) {
    const maxWait = 120000;
    const pollInterval = 5000;
    const start = Date.now();

    while ((Date.now() - start) < maxWait) {
      if (!await isSessionStillRunning(session)) return;
      try {
        const res = await fetch(`${baseUrl}/api/frames/${iterationId}`);
        const data = await res.json();
        if (data.frames?.length > 0) return;
      } catch {}
      await sleep(pollInterval);
    }
    addLog(session, 'Warning: frames not found after 2 min, attempting score anyway');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return router;
}

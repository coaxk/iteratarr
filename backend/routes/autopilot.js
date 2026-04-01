import { Router } from 'express';

/**
 * Autopilot — fully automated score → recommend → apply → render loop.
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

  // Active autopilot sessions: branchId → { running, config, log, ... }
  const sessions = new Map();

  /**
   * POST /api/autopilot/start
   * Body: { branch_id, target_score?, max_iterations?, regression_limit? }
   */
  router.post('/start', async (req, res) => {
    try {
      const { branch_id, target_score = 65, max_iterations = 20, regression_limit = 3 } = req.body;
      if (!branch_id) return res.status(400).json({ error: 'branch_id required' });

      if (sessions.has(branch_id) && sessions.get(branch_id).running) {
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
      sessions.set(branch_id, session);

      // Start the loop (don't await — run in background)
      runAutopilot(session).catch(err => {
        session.running = false;
        session.phase = 'error';
        session.error = err.message;
        session.completed_at = new Date().toISOString();
        console.error(`[Autopilot] Fatal error on ${session.branch_name}:`, err.message);
      });

      res.json({ message: 'Autopilot started', branch_id, config: session.config });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/autopilot/status/:branchId
   */
  router.get('/status/:branchId', (req, res) => {
    const session = sessions.get(req.params.branchId);
    if (!session) return res.json({ running: false });
    res.json({
      running: session.running,
      branch_name: session.branch_name,
      phase: session.phase,
      current_iteration: session.current_iteration,
      current_score: session.current_score,
      config: session.config,
      scores: session.scores,
      log: session.log.slice(-20), // last 20 log entries
      error: session.error,
      started_at: session.started_at,
      completed_at: session.completed_at,
      verdict: session.verdict
    });
  });

  /**
   * POST /api/autopilot/stop/:branchId
   */
  router.post('/stop/:branchId', (req, res) => {
    const session = sessions.get(req.params.branchId);
    if (!session || !session.running) {
      return res.json({ message: 'No active autopilot on this branch' });
    }
    session.running = false;
    session.phase = 'stopped';
    session.completed_at = new Date().toISOString();
    session.verdict = 'Stopped manually';
    addLog(session, 'Autopilot stopped by user');
    res.json({ message: 'Autopilot stopping after current step completes' });
  });

  /**
   * GET /api/autopilot/sessions — list all sessions (active and completed)
   */
  router.get('/sessions', (req, res) => {
    const all = [];
    for (const [branchId, session] of sessions) {
      all.push({
        branch_id: branchId,
        branch_name: session.branch_name,
        running: session.running,
        phase: session.phase,
        current_iteration: session.current_iteration,
        current_score: session.current_score,
        scores: session.scores,
        started_at: session.started_at,
        completed_at: session.completed_at,
        verdict: session.verdict,
        error: session.error
      });
    }
    res.json(all);
  });

  // --- Autopilot engine ---

  function addLog(session, message) {
    const entry = { time: new Date().toISOString(), message };
    session.log.push(entry);
    console.log(`[Autopilot] ${session.branch_name}: ${message}`);
  }

  async function runAutopilot(session) {
    const { branch_id, config: { target_score, max_iterations, regression_limit } } = session;
    let consecutiveRegressions = 0;
    let previousScore = null;
    const port = config.port || 3847;
    const baseUrl = `http://localhost:${port}`;

    addLog(session, `Starting autopilot — target ${target_score}/75, max ${max_iterations} iterations`);

    while (session.running) {
      try {
        // 1. Find latest iteration on this branch
        session.phase = 'finding_iteration';
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
          session.phase = 'waiting_for_render';
          addLog(session, 'Waiting for render to complete...');
          await waitForRender(session, latest, baseUrl);
          if (!session.running) break;
          // Refetch iteration to get updated status
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
          session.phase = 'scoring';
          addLog(session, 'Scoring via Vision API...');

          // Wait for frames to be available (queue extracts them post-render)
          await waitForFrames(session, latest.id, baseUrl);
          if (!session.running) break;

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

          // Save evaluation
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

          // Check consecutive regressions
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
          session.phase = 'generating_next';
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
          session.phase = 'queuing_render';
          const queueRes = await fetch(`${baseUrl}/api/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              json_path: nextIter.json_path,
              clip_name: nextIter.json_filename,
              iteration_id: nextIter.id,
              seed: nextIter.seed,
              source: 'autopilot',
              priority: 0 // top priority
            })
          });
          if (!queueRes.ok) {
            const err = await queueRes.json();
            throw new Error(`Queue failed: ${err.error}`);
          }
          addLog(session, `Queued render for iteration ${nextIter.iteration_number}`);

          // Auto-start queue if not running
          await fetch(`${baseUrl}/api/queue/start`, { method: 'POST' }).catch(() => {});

          // Loop continues — will wait for render on next cycle
        } else {
          // Already evaluated — check if we need to generate next or if we're at the end
          const grandTotal = latest.evaluation?.scores ?
            Object.values(latest.evaluation.scores).reduce((sum, group) =>
              sum + Object.values(group).reduce((s, v) => s + v, 0), 0) : 0;

          session.current_score = grandTotal;

          // Check if there's already a child iteration
          const children = await store.list('iterations', i => i.parent_iteration_id === latest.id);
          if (children.length > 0) {
            // Already has a child — continue to that iteration
            addLog(session, `Iteration ${latest.iteration_number} already evaluated (${grandTotal}/75) with child — advancing`);
            await sleep(1000);
            continue;
          }

          // No child but evaluated — check termination then generate next
          if (grandTotal >= target_score) {
            session.scores.push({ iteration: latest.iteration_number, iteration_id: latest.id, grand_total: grandTotal });
            session.verdict = `SUCCESS — already at ${grandTotal}/75 (target ${target_score})`;
            addLog(session, session.verdict);
            break;
          }

          session.scores.push({ iteration: latest.iteration_number, iteration_id: latest.id, grand_total: grandTotal });
          previousScore = grandTotal;

          addLog(session, `Iteration ${latest.iteration_number} already evaluated (${grandTotal}/75) — generating next`);
          session.phase = 'generating_next';

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

          session.phase = 'queuing_render';
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
        }

      } catch (err) {
        addLog(session, `Error: ${err.message}`);
        session.error = err.message;
        // Don't break on transient errors — retry after delay
        if (err.message.includes('rate limit') || err.message.includes('temporarily unavailable')) {
          addLog(session, 'Transient error — retrying in 30s...');
          await sleep(30000);
          if (!session.running) break;
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
  }

  /** Wait for an iteration's render to complete by polling queue status */
  async function waitForRender(session, iteration, baseUrl) {
    const maxWait = 45 * 60 * 1000; // 45 min max
    const pollInterval = 15000; // 15s
    const start = Date.now();

    while (session.running && (Date.now() - start) < maxWait) {
      // Check iteration status directly
      try {
        const iter = await store.get('iterations', iteration.id);
        if (iter.status === 'rendered') {
          addLog(session, 'Render complete');
          return;
        }
        if (iter.status === 'failed') {
          throw new Error('Render failed');
        }
      } catch (err) {
        if (err.message === 'Render failed') throw err;
      }

      // Check queue status
      try {
        const qRes = await fetch(`${baseUrl}/api/queue/iteration/${iteration.id}`);
        const qs = await qRes.json();
        if (qs.status === 'complete') {
          addLog(session, 'Render complete (queue)');
          return;
        }
        if (qs.status === 'failed') {
          throw new Error(`Render failed: ${qs.error || 'unknown'}`);
        }
        if (qs.progress?.percent) {
          session.phase = `rendering (${qs.progress.percent}%)`;
        }
      } catch (err) {
        if (err.message.startsWith('Render failed')) throw err;
      }

      await sleep(pollInterval);
    }

    if (session.running) throw new Error('Render timed out after 45 minutes');
  }

  /** Wait for frames to be extracted (post-render) */
  async function waitForFrames(session, iterationId, baseUrl) {
    const maxWait = 120000; // 2 min max
    const pollInterval = 5000;
    const start = Date.now();

    while (session.running && (Date.now() - start) < maxWait) {
      try {
        const res = await fetch(`${baseUrl}/api/frames/${iterationId}`);
        const data = await res.json();
        if (data.frames?.length > 0) return;
      } catch {}
      await sleep(pollInterval);
    }
    // Don't throw — scoring might still work if contact sheet exists
    addLog(session, 'Warning: frames not found after 2 min, attempting score anyway');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return router;
}

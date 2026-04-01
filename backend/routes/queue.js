import { Router } from 'express';
import { renderSingle, onProgress, offProgress } from '../wan2gp-bridge.js';
import { existsSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';

/**
 * Queue Manager routes — manages the render queue for batch overnight processing.
 *
 * Queue items track: json_path, clip_name, iteration_id, seed, source, priority,
 * status (queued/rendering/complete/failed), started_at, completed_at, error, progress.
 *
 * The queue processes items sequentially (one GPU render at a time).
 * State is persisted in the 'render_queue' collection in SQLite.
 */
export function createQueueRoutes(store, config) {
  const router = Router();

  // In-memory queue processing state
  let queueRunning = false;
  let queuePaused = false;
  let activeItem = null;
  let activeProgress = null;
  let activeRenderId = 0;

  // On startup: recover any items stuck in 'rendering' from a crash
  (async () => {
    try {
      const items = await store.list('render_queue');
      const stuck = items.filter(i => i.status === 'rendering');
      for (const item of stuck) {
        console.log(`[Queue] Recovering stuck item ${item.id.substring(0, 8)} — resetting to queued`);
        await store.update('render_queue', item.id, { status: 'queued', started_at: null, progress: null });
      }
      if (stuck.length > 0) console.log(`[Queue] Recovered ${stuck.length} stuck item(s)`);
    } catch (err) {
      console.error('[Queue] Recovery check failed:', err.message);
    }
  })();

  /**
   * GET / — List all queue items, ordered by priority then queued_at
   */
  router.get('/', async (req, res) => {
    try {
      const items = await store.list('render_queue');

      // Auto-purge completed/failed items older than 7 days — no reason to keep them
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const stale = items.filter(i =>
        (i.status === 'complete' || i.status === 'failed') &&
        (i.completed_at || i.updated_at) < cutoff
      );
      await Promise.all(stale.map(i => store.delete('render_queue', i.id)));
      const active = stale.length > 0 ? items.filter(i => !stale.find(s => s.id === i.id)) : items;

      active.sort((a, b) => {
        // rendering first, then queued, then complete/failed
        const statusOrder = { rendering: 0, queued: 1, failed: 1, complete: 3 };
        const sa = statusOrder[a.status] ?? 4;
        const sb = statusOrder[b.status] ?? 4;
        if (sa !== sb) return sa - sb;
        // Within queued: by priority then queued_at (oldest first)
        if (a.status === 'queued') {
          if ((a.priority || 0) !== (b.priority || 0)) return (a.priority || 0) - (b.priority || 0);
          return new Date(a.queued_at) - new Date(b.queued_at);
        }
        // Within complete/failed: newest completed first
        if (a.status === 'complete' || a.status === 'failed') {
          return new Date(b.completed_at || b.queued_at) - new Date(a.completed_at || a.queued_at);
        }
        return new Date(a.queued_at) - new Date(b.queued_at);
      });
      res.json(active);
    } catch {
      res.json([]);
    }
  });

  /**
   * POST / — Add a render job to the queue
   * Body: { json_path, clip_name, iteration_id, seed, source, priority? }
   */
  router.post('/', async (req, res) => {
    const { json_path, clip_name, iteration_id, seed, source, priority } = req.body;
    if (!json_path) return res.status(400).json({ error: 'json_path required' });

    try {
      // Prevent duplicate queue entries for the same iteration
      if (iteration_id) {
        const existing = await store.list('render_queue');
        const dupe = existing.find(i => i.iteration_id === iteration_id && (i.status === 'queued' || i.status === 'rendering'));
        if (dupe) return res.status(409).json({ error: 'This iteration is already in the queue' });
      }

      const item = await store.create('render_queue', {
        json_path,
        clip_name: clip_name || json_path.split(/[/\\]/).pop().replace('.json', ''),
        iteration_id: iteration_id || null,
        seed: seed || null,
        source: source || 'manual',
        priority: priority ?? 10,
        status: 'queued',
        queued_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        error: null,
        progress: null
      });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * DELETE /:id — Remove item from queue
   */
  router.delete('/:id', async (req, res) => {
    try {
      // Don't allow deleting actively rendering items
      if (activeItem && activeItem.id === req.params.id) {
        return res.status(409).json({ error: 'Cannot remove actively rendering item' });
      }
      await store.delete('render_queue', req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  /**
   * PATCH /:id — Update priority/order or other fields
   */
  router.patch('/:id', async (req, res) => {
    try {
      const allowed = ['priority', 'clip_name', 'status', 'error'];
      const patch = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      }
      const updated = await store.update('render_queue', req.params.id, patch);
      res.json(updated);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  /**
   * POST /reorder — Reorder queue items by setting priority based on position
   * Body: { order: [id1, id2, ...] }
   */
  router.post('/reorder', async (req, res) => {
    const { order } = req.body;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'order array required' });
    }

    try {
      for (let i = 0; i < order.length; i++) {
        await store.update('render_queue', order[i], { priority: i });
      }
      res.json({ reordered: true, count: order.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /start — Start processing the queue sequentially
   */
  router.post('/start', async (req, res) => {
    if (queueRunning && !queuePaused) {
      return res.json({ message: 'Queue already running' });
    }

    queuePaused = false;

    if (!queueRunning) {
      queueRunning = true;
      processQueue();
    }

    res.json({ message: 'Queue started' });
  });

  /**
   * POST /pause — Pause queue (finish current render, don't start next)
   */
  router.post('/pause', async (req, res) => {
    queuePaused = true;
    res.json({ message: 'Queue paused — current render will finish' });
  });

  /**
   * GET /status — Queue status overview
   */
  router.get('/status', async (req, res) => {
    try {
      const items = await store.list('render_queue');
      const queued = items.filter(i => i.status === 'queued').length;
      const rendering = items.filter(i => i.status === 'rendering').length;
      const complete = items.filter(i => i.status === 'complete').length;
      const failed = items.filter(i => i.status === 'failed').length;

      // Estimate remaining time: ~10 min per render (configurable based on history)
      const avgRenderTime = calculateAvgRenderTime(items);
      const estimatedRemaining = queued * avgRenderTime;

      res.json({
        running: queueRunning && !queuePaused,
        paused: queuePaused,
        active_item: activeItem ? {
          id: activeItem.id,
          clip_name: activeItem.clip_name,
          json_path: activeItem.json_path,
          progress: activeProgress
        } : null,
        counts: { queued, rendering, complete, failed, total: items.length },
        estimated_remaining_seconds: estimatedRemaining
      });
    } catch {
      res.json({
        running: false,
        paused: false,
        active_item: null,
        counts: { queued: 0, rendering: 0, complete: 0, failed: 0, total: 0 },
        estimated_remaining_seconds: 0
      });
    }
  });

  /**
   * GET /iteration/:iterationId — Check queue status for a specific iteration
   */
  router.get('/iteration/:iterationId', async (req, res) => {
    try {
      const items = await store.list('render_queue');
      const match = items.find(i => i.iteration_id === req.params.iterationId && (i.status === 'queued' || i.status === 'rendering'));
      const completed = items.find(i => i.iteration_id === req.params.iterationId && i.status === 'complete');
      const failed = items.find(i => i.iteration_id === req.params.iterationId && i.status === 'failed');
      const result = match || completed || failed;
      if (result) {
        const queuedItems = items.filter(i => i.status === 'queued').sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const position = match?.status === 'queued' ? queuedItems.findIndex(i => i.id === match.id) + 1 : null;
        res.json({ in_queue: true, ...result, position, progress: match?.id === activeItem?.id ? activeProgress : null });
      } else {
        res.json({ in_queue: false });
      }
    } catch {
      res.json({ in_queue: false });
    }
  });

  /**
   * POST /retry/:id — Retry a failed queue item (removes old, creates new, auto-starts)
   */
  router.post('/retry/:id', async (req, res) => {
    try {
      const item = await store.get('render_queue', req.params.id);
      if (item.status !== 'failed') {
        return res.status(400).json({ error: 'Can only retry failed items' });
      }

      // Reset iteration status if linked
      if (item.iteration_id) {
        try { await store.update('iterations', item.iteration_id, { status: 'pending' }); } catch {}
      }

      // Remove the failed item
      await store.delete('render_queue', req.params.id);

      // Create a new queue item with same data
      const newItem = await store.create('render_queue', {
        json_path: item.json_path,
        clip_name: item.clip_name,
        iteration_id: item.iteration_id,
        seed: item.seed,
        source: item.source,
        priority: 0,
        status: 'queued',
        queued_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        error: null,
        progress: null
      });

      // Auto-start queue
      if (!queueRunning) processQueue();

      res.json({ retried: true, old_id: req.params.id, new_id: newItem.id });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  });

  /**
   * POST /clear-completed — Remove all completed/failed items from queue
   */
  router.post('/clear-completed', async (req, res) => {
    try {
      const items = await store.list('render_queue');
      const toDelete = items.filter(i => i.status === 'complete' || i.status === 'failed');
      for (const item of toDelete) {
        await store.delete('render_queue', item.id);
      }
      res.json({ cleared: toDelete.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Calculate average render time from completed items (in seconds).
   * Falls back to 600s (10 min) if no history.
   */
  function calculateAvgRenderTime(items) {
    const completed = items.filter(i => i.status === 'complete' && i.started_at && i.completed_at);
    if (completed.length === 0) return 600;
    const totalSeconds = completed.reduce((sum, i) => {
      return sum + (new Date(i.completed_at) - new Date(i.started_at)) / 1000;
    }, 0);
    return Math.round(totalSeconds / completed.length);
  }

  /**
   * Process queue items sequentially. Picks next queued item by priority,
   * renders it via the bridge, updates status, then moves to next.
   */
  async function processQueue() {
    try {
    while (queueRunning && !queuePaused) {
      // Find next queued item
      const items = await store.list('render_queue', i => i.status === 'queued');
      items.sort((a, b) => {
        if ((a.priority || 0) !== (b.priority || 0)) return (a.priority || 0) - (b.priority || 0);
        return new Date(a.queued_at) - new Date(b.queued_at);
      });

      if (items.length === 0) {
        // Nothing left to process
        queueRunning = false;
        activeItem = null;
        activeProgress = null;
        console.log('[Queue] All items processed — queue stopped');
        break;
      }

      const item = items[0];
      activeItem = item;
      activeProgress = null;
      activeRenderId++;
      const renderId = activeRenderId;

      // Mark as rendering
      await store.update('render_queue', item.id, {
        status: 'rendering',
        started_at: new Date().toISOString()
      });

      console.log(`[Queue] Processing: ${item.clip_name} (${item.json_path})`);

      // Subscribe to progress — capture both step progress and phase info
      onProgress(renderId, (data) => {
        if (data.type === 'progress') {
          activeProgress = {
            ...activeProgress,
            percent: data.percent,
            step: data.step,
            totalSteps: data.totalSteps,
            secsPerStep: data.secsPerStep
          };
          if (data.percent % 10 === 0) {
            store.update('render_queue', item.id, { status: 'rendering', progress: activeProgress }).catch(() => {});
          }
        } else if (data.type === 'info') {
          activeProgress = {
            ...activeProgress,
            phase: data.phase,
            phaseLabel: data.phaseLabel || null,
            currentPhase: data.currentPhase || null,
            totalPhases: data.totalPhases || null,
            message: data.message
          };
          store.update('render_queue', item.id, { status: 'rendering', progress: activeProgress }).catch(() => {});
        }
      });

      try {
        const renderStart = Date.now();
        await renderSingle(item.json_path, { renderId });
        const renderDuration = Math.round((Date.now() - renderStart) / 1000);

        // Ghost render detection: Wan2GP sometimes exits code 0 without producing
        // a video (VRAM contention, output already exists, malformed JSON).
        // A real render takes 8-20+ min; anything under 60s with no output is a no-op.
        let videoExists = false;
        if (item.iteration_id) {
          try {
            const iter = await store.get('iterations', item.iteration_id);
            let rp = iter.render_path;
            if (!rp && iter.json_contents?.output_filename) {
              rp = join(config.wan2gp_output_dir, `${iter.json_contents.output_filename}.mp4`);
            }
            videoExists = !!(rp && existsSync(rp));
          } catch {}
        }

        if (renderDuration < 60 && !videoExists) {
          await store.update('render_queue', item.id, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            error: `Ghost render: Wan2GP exited in ${renderDuration}s without producing a video file. Likely VRAM contention or duplicate output path.`,
            progress: null
          });
          console.warn(`[Queue] Ghost render detected: ${item.clip_name} — ${renderDuration}s, no video output`);
          if (item.iteration_id) {
            try { await store.update('iterations', item.iteration_id, { status: 'failed' }); } catch {}
          }
        } else {
        // Real render completed
        await store.update('render_queue', item.id, {
          status: 'complete',
          completed_at: new Date().toISOString(),
          progress: { percent: 100 }
        });
        console.log(`[Queue] Complete: ${item.clip_name} (${renderDuration}s)`);

        // Update iteration status + extract frames for thumbnail
        if (item.iteration_id) {
          try {
            const iter = await store.get('iterations', item.iteration_id);
            const updates = { status: 'rendered' };

            // Derive render_path if not set — check output_filename in JSON + Wan2GP output dir
            let renderPath = iter.render_path;
            if (!renderPath && iter.json_contents?.output_filename) {
              const candidate = join(config.wan2gp_output_dir, `${iter.json_contents.output_filename}.mp4`);
              if (existsSync(candidate)) {
                renderPath = candidate;
                updates.render_path = candidate;
                console.log(`[Queue] Derived render_path from output_filename: ${candidate}`);
              }
            }

            if (renderPath && existsSync(renderPath)) {
              updates.render_duration_seconds = Math.round((Date.now() - new Date(iter.created_at).getTime()) / 1000);
            }
            await store.update('iterations', item.iteration_id, updates);

            // Extract 6 key frames immediately for quick preview.
            // Full 32-frame extraction happens lazily on first view.
            if (renderPath && existsSync(renderPath)) {
              try {
                const frameAbort = new AbortController();
                const frameTimeout = setTimeout(() => frameAbort.abort(), 90000); // 90s max
                await fetch(`http://localhost:${config.port || 3847}/api/frames/extract`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ video_path: renderPath, iteration_id: item.iteration_id, count: 6 }),
                  signal: frameAbort.signal
                });
                clearTimeout(frameTimeout);
                await store.update('iterations', item.iteration_id, { frames_extracted: true });
                console.log(`[Queue] 6 key frames extracted for ${item.clip_name}`);
              } catch (frameErr) {
                console.log(`[Queue] Frame extraction skipped — will extract on view: ${frameErr.message}`);
              }
            }
          } catch (e) {
            console.log(`[Queue] Iteration update failed: ${e.message}`);
          }
        }
        } // end ghost render else
      } catch (err) {
        await store.update('render_queue', item.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err.message
        });
        console.error(`[Queue] Failed: ${item.clip_name} — ${err.message}`);
        // Update iteration status to failed
        if (item.iteration_id) {
          try { await store.update('iterations', item.iteration_id, { status: 'failed' }); } catch {}
        }
      } finally {
        offProgress(renderId);
        activeItem = null;
        activeProgress = null;
      }
    }
    } catch (err) {
      console.error('[Queue] Unhandled error in processQueue — queue stopped:', err.message);
      queueRunning = false;
      activeItem = null;
      activeProgress = null;
    }
  }

  return router;
}

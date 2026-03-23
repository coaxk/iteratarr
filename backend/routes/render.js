import { Router } from 'express';
import { renderSingle, renderBatch, renderQueue, createQueueFile, checkWan2GP } from '../wan2gp-bridge.js';
import { join } from 'path';

// Track active renders
const activeRenders = new Map();
let renderIdCounter = 0;

function trackRender(id, info) {
  activeRenders.set(id, { ...info, id, startedAt: new Date().toISOString(), status: 'rendering' });
}

function completeRender(id, success, error) {
  const render = activeRenders.get(id);
  if (render) {
    render.status = success ? 'complete' : 'failed';
    render.completedAt = new Date().toISOString();
    render.duration = Math.round((new Date(render.completedAt) - new Date(render.startedAt)) / 1000);
    if (error) render.error = error;
    // Keep completed renders for 1 hour then clean up
    setTimeout(() => activeRenders.delete(id), 3600000);
  }
}

/**
 * Render API routes — bridges Iteratarr to Wan2GP headless mode.
 */
export function createRenderRoutes(store, config) {
  const router = Router();

  /**
   * GET /api/render/status — Check Wan2GP + active render queue
   */
  router.get('/status', async (req, res) => {
    const available = await checkWan2GP();
    const renders = Array.from(activeRenders.values()).sort((a, b) =>
      new Date(b.startedAt) - new Date(a.startedAt)
    );
    const active = renders.filter(r => r.status === 'rendering');
    const completed = renders.filter(r => r.status === 'complete');
    const failed = renders.filter(r => r.status === 'failed');

    res.json({
      available,
      wan2gp_root: config.wan2gp_json_dir,
      output_dir: config.wan2gp_output_dir,
      queue: {
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: renders.length
      },
      renders
    });
  });

  /**
   * POST /api/render/single — Render a single JSON file
   * Body: { json_path: string }
   */
  router.post('/single', async (req, res) => {
    const { json_path } = req.body;
    if (!json_path) return res.status(400).json({ error: 'json_path required' });

    const id = ++renderIdCounter;
    const filename = json_path.split(/[/\\]/).pop();
    trackRender(id, { json_path, filename, type: 'single' });

    renderSingle(json_path).then(result => {
      console.log(`[Render API] Complete: ${filename}`);
      completeRender(id, true);
    }).catch(err => {
      console.error(`[Render API] Failed: ${filename} — ${err.message}`);
      completeRender(id, false, err.message);
    });

    res.json({ submitted: true, render_id: id, json_path, message: 'Render submitted. Check /api/render/status for progress.' });
  });

  /**
   * POST /api/render/batch — Render multiple JSON files
   * Body: { json_paths: [string] } or { tasks: [object] }
   */
  router.post('/batch', async (req, res) => {
    const { json_paths, tasks } = req.body;

    try {
      if (tasks && Array.isArray(tasks)) {
        const queuePath = join(config.wan2gp_output_dir, `_iteratarr_queue_${Date.now()}.json`);
        await createQueueFile(tasks, queuePath);

        const id = ++renderIdCounter;
        trackRender(id, { queue_path: queuePath, type: 'batch', task_count: tasks.length });

        renderQueue(queuePath).then(result => {
          console.log(`[Render API] Batch complete: ${tasks.length} tasks`);
          completeRender(id, true);
        }).catch(err => {
          console.error(`[Render API] Batch failed: ${err.message}`);
          completeRender(id, false, err.message);
        });

        res.json({ submitted: true, render_id: id, queue_path: queuePath, task_count: tasks.length });
      } else if (json_paths && Array.isArray(json_paths)) {
        const ids = [];
        for (const jp of json_paths) {
          const id = ++renderIdCounter;
          const filename = jp.split(/[/\\]/).pop();
          trackRender(id, { json_path: jp, filename, type: 'single' });
          ids.push(id);
        }

        // Render sequentially in background
        (async () => {
          for (let i = 0; i < json_paths.length; i++) {
            try {
              await renderSingle(json_paths[i]);
              console.log(`[Render API] ${i + 1}/${json_paths.length} complete`);
              completeRender(ids[i], true);
            } catch (err) {
              console.error(`[Render API] ${i + 1}/${json_paths.length} failed: ${err.message}`);
              completeRender(ids[i], false, err.message);
            }
          }
        })();

        res.json({ submitted: true, render_ids: ids, count: json_paths.length });
      } else {
        res.status(400).json({ error: 'Provide json_paths array or tasks array' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

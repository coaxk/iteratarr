import { Router } from 'express';
import { renderSingle, renderBatch, renderQueue, createQueueFile, checkWan2GP } from '../wan2gp-bridge.js';
import { join } from 'path';

/**
 * Render API routes — bridges Iteratarr to Wan2GP headless mode.
 */
export function createRenderRoutes(store, config) {
  const router = Router();

  /**
   * GET /api/render/status — Check if Wan2GP is accessible
   */
  router.get('/status', async (req, res) => {
    const available = await checkWan2GP();
    res.json({
      available,
      wan2gp_root: config.wan2gp_json_dir,
      output_dir: config.wan2gp_output_dir
    });
  });

  /**
   * POST /api/render/single — Render a single JSON file
   * Body: { json_path: string }
   */
  router.post('/single', async (req, res) => {
    const { json_path } = req.body;
    if (!json_path) return res.status(400).json({ error: 'json_path required' });

    try {
      // Fire and forget — render runs in background, polling detects completion
      renderSingle(json_path).then(result => {
        console.log(`[Render API] Single render complete: ${json_path}`);
      }).catch(err => {
        console.error(`[Render API] Single render failed: ${err.message}`);
      });

      res.json({ submitted: true, json_path, message: 'Render submitted. Polling will detect completion.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/render/batch — Render multiple JSON files as a queue
   * Body: { json_paths: [string] } or { tasks: [object] }
   */
  router.post('/batch', async (req, res) => {
    const { json_paths, tasks } = req.body;

    try {
      if (tasks && Array.isArray(tasks)) {
        // Create a queue file from task objects and process it
        const queuePath = join(config.wan2gp_output_dir, `_iteratarr_queue_${Date.now()}.json`);
        await createQueueFile(tasks, queuePath);

        renderQueue(queuePath).then(result => {
          console.log(`[Render API] Batch queue complete`);
        }).catch(err => {
          console.error(`[Render API] Batch queue failed: ${err.message}`);
        });

        res.json({ submitted: true, queue_path: queuePath, task_count: tasks.length });
      } else if (json_paths && Array.isArray(json_paths)) {
        // Render individual files sequentially
        renderBatch(json_paths).then(results => {
          console.log(`[Render API] Batch complete: ${results.length} renders`);
        }).catch(err => {
          console.error(`[Render API] Batch failed: ${err.message}`);
        });

        res.json({ submitted: true, count: json_paths.length });
      } else {
        res.status(400).json({ error: 'Provide json_paths array or tasks array' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

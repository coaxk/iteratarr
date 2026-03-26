import { Router } from 'express';
import { renderSingle, renderBatch, renderQueue, createQueueFile, checkWan2GP, onProgress } from '../wan2gp-bridge.js';
import { join } from 'path';
import { readdir } from 'fs/promises';

// Track active renders
const activeRenders = new Map();
let renderIdCounter = 0;

function trackRender(id, info) {
  activeRenders.set(id, { ...info, id, startedAt: new Date().toISOString(), status: 'rendering', progress: null });
  // Subscribe to progress updates from the bridge
  onProgress(id, (data) => {
    const render = activeRenders.get(id);
    if (render) {
      if (data.type === 'progress') {
        render.progress = { percent: data.percent, step: data.step, totalSteps: data.totalSteps, secsPerStep: data.secsPerStep };
      } else if (data.type === 'abort') {
        render.status = 'aborted';
        render.error = data.message;
      } else if (data.type === 'info') {
        render.phase = data.phase;
      }
    }
  });
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
 * After a render completes, find the matching iteration by json_path,
 * update its status to 'rendered', set render_path to the output file,
 * and record render duration.
 */
async function updateIterationAfterRender(store, jsonPath, outputDir) {
  try {
    const iterations = await store.list('iterations');
    // Normalize paths for comparison (backslash vs forward slash)
    const normalize = p => p?.replace(/\\/g, '/');
    const match = iterations.find(i => normalize(i.json_path) === normalize(jsonPath));
    if (!match) {
      console.log(`[Render API] No iteration found for json_path: ${jsonPath}`);
      return;
    }

    // Find the output MP4 — check render_path first, then scan output dir
    let renderPath = match.render_path;
    if (!renderPath && outputDir) {
      // Look for most recently created MP4 in output dir
      try {
        const files = await readdir(outputDir, { withFileTypes: true });
        const mp4s = files.filter(f => f.isFile() && f.name.toLowerCase().endsWith('.mp4'));
        if (mp4s.length > 0) {
          // Get stats to find newest
          const { stat } = await import('fs/promises');
          let newest = null;
          let newestTime = 0;
          for (const f of mp4s) {
            const fullPath = join(outputDir, f.name);
            const s = await stat(fullPath);
            if (s.mtimeMs > newestTime) {
              newestTime = s.mtimeMs;
              newest = fullPath;
            }
          }
          // Only use if created after the iteration (within last 2 hours)
          if (newest && newestTime > Date.now() - 7200000) {
            renderPath = newest;
          }
        }
      } catch (e) {
        console.log(`[Render API] Could not scan output dir: ${e.message}`);
      }
    }

    const updates = { status: 'rendered' };
    if (renderPath) updates.render_path = renderPath;

    const created = new Date(match.created_at);
    updates.render_duration_seconds = Math.round((Date.now() - created.getTime()) / 1000);

    await store.update('iterations', match.id, updates);
    console.log(`[Render API] Updated iteration ${match.iteration_number}: status=rendered${renderPath ? ', render_path=' + renderPath : ''}`);
  } catch (err) {
    console.error(`[Render API] Failed to update iteration after render: ${err.message}`);
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

    renderSingle(json_path, { renderId: id }).then(async (result) => {
      console.log(`[Render API] Complete: ${filename}`);
      completeRender(id, true);
      // Update iteration status and render_path when render completes
      await updateIterationAfterRender(store, json_path, config.wan2gp_output_dir);
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

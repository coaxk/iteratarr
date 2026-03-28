import express from 'express';
import cors from 'cors';
import { createStore } from './store/index.js';
import { createProjectRoutes } from './routes/projects.js';
import { createClipRoutes } from './routes/clips.js';
import { createIterationRoutes } from './routes/iterations.js';
import { createCharacterRoutes } from './routes/characters.js';
import { createExportRoutes } from './routes/export.js';
import { createFrameRoutes } from './routes/frames.js';
import { createBrowserRoutes } from './routes/browser.js';
import { createTelemetryRoutes } from './routes/telemetry.js';
import { createTemplateRoutes } from './routes/templates.js';
import { createSeedScreenRoutes } from './routes/seedscreen.js';
import { createRenderRoutes } from './routes/render.js';
import { createBranchRoutes, createBranchIterationRoutes } from './routes/branches.js';
import { createContactSheetRoutes } from './routes/contactsheet.js';
import { createQueueRoutes } from './routes/queue.js';
import { createGpuRoutes } from './routes/gpu.js';
import { createAnalyticsRoutes } from './routes/analytics.js';
import { createVisionRoutes } from './routes/vision.js';
import { createWatcher } from './watcher.js';
import { createTelemetry } from './telemetry/index.js';
import config from './config.js';

const store = createStore(config.iteratarr_data_dir);
const telemetry = createTelemetry(store, config);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '0.1.0' }));

// Admin: update any record in any collection
app.patch('/api/admin/:collection/:id', async (req, res) => {
  try {
    const updated = await store.update(req.params.collection, req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
app.get('/api/config/paths', (req, res) => res.json({
  wan2gp_lora_dir: config.wan2gp_lora_dir,
  wan2gp_output_dir: config.wan2gp_output_dir,
  project_base_dir: config.project_base_dir,
  wan2gp_json_dir: config.wan2gp_json_dir
}));
app.use('/api/projects', createProjectRoutes(store));
app.use('/api/clips', createClipRoutes(store));
app.use('/api/iterations', createIterationRoutes(store, config, telemetry));
app.use('/api/characters', createCharacterRoutes(store, telemetry));
app.use('/api/export', createExportRoutes(store, config));
app.use('/api/telemetry', createTelemetryRoutes(telemetry, config));
app.use('/api/frames', createFrameRoutes(config.iteratarr_data_dir));
app.use('/api/browser', createBrowserRoutes(config));
app.use('/api/templates', createTemplateRoutes(store));
app.use('/api/render', createRenderRoutes(store, config));
app.use('/api/clips', createSeedScreenRoutes(store, config));
app.use('/api/clips', createBranchRoutes(store, config));
app.use('/api/branches', createBranchIterationRoutes(store));
app.use('/api/contactsheet', createContactSheetRoutes(config));
app.use('/api/queue', createQueueRoutes(store, config));
app.use('/api/gpu', createGpuRoutes());
app.use('/api/analytics', createAnalyticsRoutes(store));
app.use('/api/vision', createVisionRoutes(store, config));

// Video file serving — streams MP4 files from allowed directories
import { resolve, relative, extname } from 'path';
import { stat as fsStat } from 'fs/promises';
app.get('/api/video', async (req, res) => {
  const videoPath = req.query.path;
  if (!videoPath || typeof videoPath !== 'string') return res.status(400).json({ error: 'path required' });
  if (videoPath.includes('..')) return res.status(403).json({ error: 'Invalid path' });
  if (extname(videoPath).toLowerCase() !== '.mp4') return res.status(400).json({ error: 'Only .mp4 files' });

  // Validate path is within allowed directories
  const resolved = resolve(videoPath);
  const allowedRoots = [config.project_base_dir, config.iteration_save_dir, config.wan2gp_json_dir, config.wan2gp_output_dir].filter(Boolean);
  const isAllowed = allowedRoots.some(root => {
    const r = resolve(root);
    return resolved.startsWith(r);
  });
  if (!isAllowed) return res.status(403).json({ error: 'Path outside allowed directories' });

  try {
    await fsStat(resolved);
    res.sendFile(resolved);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Production queue endpoint — lists locked-for-production items (legacy collection)
app.get('/api/production-queue', async (req, res) => {
  try {
    const items = await store.list('production_queue');
    items.sort((a, b) => new Date(b.queued_at) - new Date(a.queued_at));
    res.json(items);
  } catch {
    res.json([]);
  }
});

export { app, store, telemetry };

// Auto-ingest watcher
const watcher = createWatcher(
  [config.wan2gp_json_dir, config.iteration_save_dir].filter(Boolean),
  async (filePath, contents) => {
    console.log(`[Watcher] New JSON detected: ${filePath}`);
    try {
      await store.create('iterations', {
        clip_id: '_unassigned',
        iteration_number: 0,
        json_filename: filePath.split(/[/\\]/).pop(),
        json_path: filePath,
        json_contents: contents,
        seed_used: contents.seed || null,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: null,
        change_from_parent: null
      });
    } catch (err) {
      console.error('[Watcher] Failed to ingest:', err.message);
    }
  }
);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  watcher.start();
  app.listen(config.port, () => {
    console.log(`Iteratarr backend running on port ${config.port}`);
    console.log(`Watching: ${config.wan2gp_json_dir}`);
  });
}

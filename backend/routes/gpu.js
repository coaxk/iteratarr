import { Router } from 'express';
import { getGpuStatus, getGpuHistory, startGpuPolling } from '../gpu-monitor.js';
import wan2gp from '../wan2gp-api.js';

export function createGpuRoutes() {
  const router = Router();

  // Start background polling when routes are registered
  startGpuPolling();

  // GET /api/gpu/status — current GPU stats + running processes
  router.get('/status', async (req, res) => {
    try {
      const status = await getGpuStatus();
      res.json(status || { online: false, error: 'No GPU data available' });
    } catch (err) {
      res.json({ online: false, error: err.message });
    }
  });

  // GET /api/gpu/history — recent utilization samples for sparkline
  router.get('/history', (req, res) => {
    res.json(getGpuHistory());
  });

  // POST /api/gpu/release-vram — tell Wan2GP to unload models from VRAM/RAM
  router.post('/release-vram', async (req, res) => {
    try {
      const result = await wan2gp.releaseVram();
      res.json({ released: true, event_id: result.event_id });
    } catch (err) {
      res.status(502).json({ error: 'Wan2GP is not running. Open Pinokio → start Wan2GP first.' });
    }
  });

  // POST /api/gpu/abort — abort current Wan2GP generation
  router.post('/abort', async (req, res) => {
    try {
      const result = await wan2gp.abortGeneration();
      res.json({ aborted: true, event_id: result.event_id });
    } catch (err) {
      res.status(502).json({ error: 'Wan2GP is not running.' });
    }
  });

  // POST /api/gpu/pause — pause current generation
  router.post('/pause', async (req, res) => {
    try {
      const result = await wan2gp.pauseGeneration();
      res.json({ paused: true, event_id: result.event_id });
    } catch (err) {
      res.status(502).json({ error: 'Wan2GP is not running.' });
    }
  });

  // POST /api/gpu/resume — resume paused generation
  router.post('/resume', async (req, res) => {
    try {
      const result = await wan2gp.resumeGeneration();
      res.json({ resumed: true, event_id: result.event_id });
    } catch (err) {
      res.status(502).json({ error: 'Wan2GP is not running.' });
    }
  });

  // GET /api/gpu/wan2gp — Wan2GP connection info
  router.get('/wan2gp', async (req, res) => {
    try {
      const available = await wan2gp.isAvailable();
      const port = await wan2gp.getPort();
      res.json({ available, port, api_prefix: '/gradio_api' });
    } catch {
      res.json({ available: false, port: null });
    }
  });

  return router;
}

import { Router } from 'express';
import { getGpuStatus, getGpuHistory, startGpuPolling } from '../gpu-monitor.js';

// Wan2GP Gradio API for VRAM release
const WAN2GP_GRADIO_PORT = 42003;
const WAN2GP_RELEASE_URL = `http://localhost:${WAN2GP_GRADIO_PORT}/gradio_api/call/release_ram_and_notify`;

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
      const response = await fetch(WAN2GP_RELEASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [null] })
      });
      if (!response.ok) {
        return res.status(502).json({ error: 'Wan2GP is not running or release endpoint unavailable' });
      }
      const result = await response.json();
      res.json({ released: true, event_id: result.event_id });
    } catch (err) {
      res.status(502).json({ error: 'Wan2GP is not running. Open Pinokio → start Wan2GP first.' });
    }
  });

  return router;
}

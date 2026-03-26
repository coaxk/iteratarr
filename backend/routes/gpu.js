import { Router } from 'express';
import { getGpuStatus, getGpuHistory, startGpuPolling } from '../gpu-monitor.js';

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

  return router;
}

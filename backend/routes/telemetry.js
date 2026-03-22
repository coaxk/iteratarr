import { Router } from 'express';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Telemetry API routes.
 *
 * GET  /api/telemetry/status  — Returns { enabled, event_count, last_event }
 * POST /api/telemetry/toggle  — Enable/disable telemetry. Body: { enabled: true/false }
 * GET  /api/telemetry/export  — Returns anonymized telemetry data as JSON
 */
export function createTelemetryRoutes(telemetry, config) {
  const router = Router();

  router.get('/status', async (req, res) => {
    try {
      const events = await telemetry.getEvents({ limit: 1 });
      res.json({
        enabled: telemetry.isEnabled(),
        event_count: (await telemetry.getEvents()).length,
        last_event: events[0] || null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Body must include { enabled: true/false }' });
      }

      telemetry.setEnabled(enabled);

      // Persist to config.json so setting survives restart
      try {
        const configPath = resolve(__dirname, '..', 'config.json');
        const { readFileSync } = await import('fs');
        const existing = JSON.parse(readFileSync(configPath, 'utf-8'));
        existing.telemetry_enabled = enabled;
        writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
      } catch {
        // Config write failure is non-fatal — runtime toggle still works
      }

      res.json({ enabled: telemetry.isEnabled() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/export', async (req, res) => {
    try {
      const data = await telemetry.exportAnonymized();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

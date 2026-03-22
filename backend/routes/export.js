import { Router } from 'express';

export function createExportRoutes(store, config) {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const exportDir = config.export_dir || config.iteratarr_data_dir + '/export';
      const counts = await store.exportAllToJson(exportDir);
      res.json({ exported: true, path: exportDir, counts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

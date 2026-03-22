import { Router } from 'express';
import { validateProject } from '../store/validators.js';

export function createProjectRoutes(store) {
  const router = Router();

  router.get('/', async (req, res) => {
    const projects = await store.list('projects');
    res.json(projects);
  });

  router.post('/', async (req, res) => {
    try {
      validateProject(req.body);
      const project = await store.create('projects', {
        name: req.body.name,
        scenes: []
      });
      res.status(201).json(project);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const project = await store.get('projects', req.params.id);
      const scenes = await store.list('scenes', s => s.project_id === req.params.id);
      res.json({ ...project, scenes });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/:id/scenes', async (req, res) => {
    try {
      await store.get('projects', req.params.id); // verify project exists
      const scene = await store.create('scenes', {
        project_id: req.params.id,
        name: req.body.name,
        episode: req.body.episode || 1
      });
      res.status(201).json(scene);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}

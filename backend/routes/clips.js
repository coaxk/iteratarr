import { Router } from 'express';
import { validateClip } from '../store/validators.js';

export function createClipRoutes(store) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { status, scene_id, project_id } = req.query;
    let clips = await store.list('clips');
    if (status) clips = clips.filter(c => c.status === status);
    if (scene_id) clips = clips.filter(c => c.scene_id === scene_id);
    if (project_id) {
      const scenes = await store.list('scenes', s => s.project_id === project_id);
      const sceneIds = new Set(scenes.map(s => s.id));
      clips = clips.filter(c => sceneIds.has(c.scene_id));
    }
    // Enrich with branch + fork counts + unscored count
    for (const clip of clips) {
      const branches = await store.list('branches', b => b.clip_id === clip.id);
      clip.branch_count = branches.length;
      clip.fork_count = branches.filter(b => b.created_from === 'fork').length;
      const iterations = await store.list('iterations', i => i.clip_id === clip.id);
      clip.unscored_count = iterations.filter(i => i.status !== 'pending' && !i.evaluation).length;
    }
    res.json(clips);
  });

  router.post('/', async (req, res) => {
    try {
      validateClip(req.body);
      const clip = await store.create('clips', {
        scene_id: req.body.scene_id,
        name: req.body.name,
        characters: req.body.characters || [],
        location: req.body.location || '',
        status: 'not_started',
        locked_iteration_id: null,
        production_json_path: null,
        notes: req.body.notes || ''
      });
      res.status(201).json(clip);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      if (req.body.status) validateClip({ scene_id: 'x', name: 'x', status: req.body.status });
      const updated = await store.update('clips', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const clip = await store.get('clips', req.params.id);

      // Check for iterations — warn but allow with force flag
      const iterations = await store.list('iterations', i => i.clip_id === req.params.id);
      if (iterations.length > 0 && !req.query.force) {
        return res.status(400).json({
          error: `Clip has ${iterations.length} iteration(s). Use ?force=true to delete anyway.`,
          iteration_count: iterations.length
        });
      }

      // Clean up related data
      if (iterations.length > 0) {
        for (const iter of iterations) {
          if (iter.evaluation_id) {
            try { await store.delete('evaluations', iter.evaluation_id); } catch {}
          }
          await store.delete('iterations', iter.id);
        }
      }

      // Clean up branches
      const branches = await store.list('branches', b => b.clip_id === req.params.id);
      for (const branch of branches) {
        await store.delete('branches', branch.id);
      }

      // Clean up seed screens
      const screens = await store.list('seed_screens', s => s.clip_id === req.params.id);
      for (const screen of screens) {
        await store.delete('seed_screens', screen.id);
      }

      await store.delete('clips', req.params.id);
      res.json({ deleted: true, id: req.params.id, cleaned: { iterations: iterations.length, branches: branches.length, seed_screens: screens.length } });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  router.get('/:id/iterations', async (req, res) => {
    const { branch_id } = req.query;
    let iterations = await store.list('iterations', i => i.clip_id === req.params.id);
    if (branch_id) {
      iterations = iterations.filter(i => i.branch_id === branch_id);
    }
    iterations.sort((a, b) => a.iteration_number - b.iteration_number);
    // Enrich with evaluation data so UI can show scores and load existing evaluations
    for (const iter of iterations) {
      if (iter.evaluation_id) {
        try {
          iter.evaluation = await store.get('evaluations', iter.evaluation_id);
        } catch { /* evaluation may have been deleted */ }
      }
    }
    res.json(iterations);
  });

  return router;
}

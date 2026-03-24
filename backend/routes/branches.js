import { Router } from 'express';
import { validateBranch } from '../store/validators.js';

/**
 * Branch routes — manages per-seed iteration branches within a clip.
 * Each branch represents an independent iteration chain for a specific seed.
 */
export function createBranchRoutes(store) {
  const router = Router();

  /**
   * GET /api/clips/:clipId/branches — list all branches for a clip
   */
  router.get('/:clipId/branches', async (req, res) => {
    try {
      const branches = await store.list('branches', b => b.clip_id === req.params.clipId);
      branches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      res.json(branches);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * POST /api/clips/:clipId/branches — create a new branch
   */
  router.post('/:clipId/branches', async (req, res) => {
    try {
      const data = { ...req.body, clip_id: req.params.clipId };
      validateBranch(data);

      // Check for duplicate seed on this clip
      const existing = await store.list('branches', b => b.clip_id === req.params.clipId && b.seed === data.seed);
      if (existing.length > 0) {
        return res.status(409).json({ error: `Branch for seed ${data.seed} already exists on this clip`, existing_id: existing[0].id });
      }

      const branch = await store.create('branches', {
        clip_id: req.params.clipId,
        seed: data.seed,
        name: data.name || `seed-${data.seed}`,
        status: data.status || 'active',
        created_from: data.created_from || 'manual',
        source_branch_id: data.source_branch_id || null,
        source_iteration_id: data.source_iteration_id || null,
        base_settings: data.base_settings || {},
        best_score: null,
        best_iteration_id: null,
        iteration_count: 0,
        locked_at: null
      });

      res.status(201).json(branch);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/clips/:clipId/branches/:id — get branch with iteration summary
   */
  router.get('/:clipId/branches/:id', async (req, res) => {
    try {
      const branch = await store.get('branches', req.params.id);
      if (branch.clip_id !== req.params.clipId) {
        return res.status(404).json({ error: 'Branch not found for this clip' });
      }

      // Enrich with iteration stats
      const iterations = await store.list('iterations', i => i.branch_id === branch.id);
      branch.iteration_count = iterations.length;

      // Find best score across iterations
      let bestScore = null;
      let bestIterationId = null;
      for (const iter of iterations) {
        if (iter.evaluation_id) {
          try {
            const evaluation = await store.get('evaluations', iter.evaluation_id);
            if (evaluation.scores?.grand_total && (!bestScore || evaluation.scores.grand_total > bestScore)) {
              bestScore = evaluation.scores.grand_total;
              bestIterationId = iter.id;
            }
          } catch { /* evaluation may not exist */ }
        }
      }
      branch.best_score = bestScore;
      branch.best_iteration_id = bestIterationId;

      res.json(branch);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/clips/:clipId/branches/:id — update branch status or name
   */
  router.patch('/:clipId/branches/:id', async (req, res) => {
    try {
      const branch = await store.get('branches', req.params.id);
      if (branch.clip_id !== req.params.clipId) {
        return res.status(404).json({ error: 'Branch not found for this clip' });
      }

      // Validate status if being updated
      if (req.body.status) {
        validateBranch({ clip_id: branch.clip_id, seed: branch.seed, status: req.body.status });
      }

      const patch = { ...req.body };
      if (patch.status === 'locked') {
        patch.locked_at = new Date().toISOString();
      }

      const updated = await store.update('branches', req.params.id, patch);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/clips/:clipId/branches/:id — delete branch (only if no iterations)
   */
  router.delete('/:clipId/branches/:id', async (req, res) => {
    try {
      const branch = await store.get('branches', req.params.id);
      if (branch.clip_id !== req.params.clipId) {
        return res.status(404).json({ error: 'Branch not found for this clip' });
      }

      // Check for existing iterations
      const iterations = await store.list('iterations', i => i.branch_id === branch.id);
      if (iterations.length > 0) {
        return res.status(400).json({
          error: `Cannot delete branch with ${iterations.length} iteration(s). Delete iterations first or mark branch as abandoned.`
        });
      }

      await store.delete('branches', req.params.id);
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * GET /api/branches/:id/iterations — list iterations for a specific branch
   */
  router.get('/', async (req, res) => {
    // This is mounted at /api/branches — handle /api/branches/:id/iterations
    res.status(404).json({ error: 'Use /api/clips/:clipId/branches instead' });
  });

  return router;
}

/**
 * Standalone branch iteration listing — mounted separately at /api/branches
 */
export function createBranchIterationRoutes(store) {
  const router = Router();

  router.get('/:id/iterations', async (req, res) => {
    try {
      const branch = await store.get('branches', req.params.id);
      const iterations = await store.list('iterations', i => i.branch_id === branch.id);
      iterations.sort((a, b) => a.iteration_number - b.iteration_number);

      // Enrich with evaluation data
      for (const iter of iterations) {
        if (iter.evaluation_id) {
          try {
            iter.evaluation = await store.get('evaluations', iter.evaluation_id);
          } catch { /* evaluation may not exist */ }
        }
      }

      res.json(iterations);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}

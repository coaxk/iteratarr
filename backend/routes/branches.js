import { Router } from 'express';
import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { validateBranch } from '../store/validators.js';
import { getClipPaths } from '../paths.js';
import { WAN2GP_FIELDS } from './iterations.js';

/**
 * Branch routes — manages per-seed iteration branches within a clip.
 * Each branch represents an independent iteration chain for a specific seed.
 */
export function createBranchRoutes(store, config = {}) {
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
   * POST /api/clips/:clipId/fork — create a new branch by forking from any iteration
   *
   * Body: {
   *   source_iteration_id: string,  — iteration to fork from (copies its settings)
   *   seed: number (optional),      — new seed for the fork (defaults to source seed)
   *   name: string (optional)       — branch name
   * }
   *
   * Creates a new branch + iter_01 with the source iteration's settings.
   * Returns { branch, iteration } for frontend navigation.
   */
  router.post('/:clipId/fork', async (req, res) => {
    try {
      const { clipId } = req.params;
      const { source_iteration_id, seed: requestedSeed, name } = req.body;

      if (!source_iteration_id) {
        return res.status(400).json({ error: 'source_iteration_id is required' });
      }

      // Get source iteration and its settings
      const sourceIter = await store.get('iterations', source_iteration_id);
      if (sourceIter.clip_id !== clipId) {
        return res.status(400).json({ error: 'Source iteration does not belong to this clip' });
      }

      const seed = requestedSeed !== undefined ? parseInt(requestedSeed) : (sourceIter.seed_used || sourceIter.json_contents?.seed);
      if (!seed || isNaN(seed)) {
        return res.status(400).json({ error: 'Could not determine seed — provide one explicitly' });
      }

      // Check for duplicate seed branch
      const existing = await store.list('branches', b => b.clip_id === clipId && b.seed === seed);
      if (existing.length > 0 && !requestedSeed) {
        // Same seed fork — allow it but with a distinct name
      }

      // Build iter_01 JSON from source iteration's settings
      const forkJson = { ...sourceIter.json_contents };
      forkJson.seed = seed;
      forkJson.video_length = config.iteration_frame_count || 32;

      // Set output filename
      const clip = await store.get('clips', clipId);
      const safeClipName = basename(clip.name)
        .replace(/[^a-zA-Z0-9\-. ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      forkJson.output_filename = `${safeClipName}_iter_01`;

      // Strip junk fields
      Object.keys(forkJson).forEach(k => { if (!WAN2GP_FIELDS.has(k)) delete forkJson[k]; });

      // Create branch
      const branchName = name || `seed-${seed}${existing.length > 0 ? `-fork-${existing.length + 1}` : ''}`;
      const branch = await store.create('branches', {
        clip_id: clipId,
        seed,
        name: branchName,
        status: 'active',
        created_from: 'fork',
        source_branch_id: sourceIter.branch_id || null,
        source_iteration_id,
        base_settings: forkJson,
        best_score: null,
        best_iteration_id: null,
        iteration_count: 1,
        locked_at: null
      });

      // Write iter_01 JSON to disk
      let iterPath = null;
      let renderPath = null;
      const iterFilename = `${safeClipName}_iter_01.json`;
      try {
        const scene = await store.get('scenes', clip.scene_id);
        const paths = getClipPaths(config, clip, scene);
        // Use branch-specific subdirectory
        const branchIterDir = join(paths.iterations, `branch-${seed}`);
        await mkdir(branchIterDir, { recursive: true });
        iterPath = join(branchIterDir, iterFilename);
        await writeFile(iterPath, JSON.stringify(forkJson, null, 2));
      } catch {
        // Fall back to flat save dir
        const saveDir = config.iteration_save_dir || './iterations';
        await mkdir(saveDir, { recursive: true });
        iterPath = join(saveDir, iterFilename);
        await writeFile(iterPath, JSON.stringify(forkJson, null, 2));
      }

      // Render path — if same seed as source, reuse source render
      if (seed === sourceIter.seed_used && sourceIter.render_path) {
        renderPath = sourceIter.render_path;
      } else {
        const outputDir = config.wan2gp_output_dir || join(config.wan2gp_json_dir || '.', 'outputs');
        renderPath = join(outputDir, `${safeClipName}_iter_01.mp4`);
      }

      // Create iteration record
      const iteration = await store.create('iterations', {
        clip_id: clipId,
        branch_id: branch.id,
        iteration_number: 1,
        json_filename: iterFilename,
        json_path: iterPath,
        json_contents: forkJson,
        seed_used: seed,
        model_type: sourceIter.model_type || 'other',
        render_path: renderPath,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: null,
        change_from_parent: `Forked from branch ${sourceIter.branch_id || 'unknown'} iter #${sourceIter.iteration_number}`
      });

      res.status(201).json({ branch, iteration });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
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

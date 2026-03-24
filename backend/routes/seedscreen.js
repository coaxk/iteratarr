import { Router } from 'express';
import { writeFile, mkdir } from 'fs/promises';
import { join, resolve, relative, basename } from 'path';
import { getClipPaths } from '../paths.js';
import { WAN2GP_FIELDS } from './iterations.js';

/**
 * Validates that a resolved path is within the expected base directory.
 * Prevents directory traversal attacks on all file write operations.
 */
function isPathWithin(filePath, baseDir) {
  const resolved = resolve(filePath);
  const base = resolve(baseDir);
  const rel = relative(base, resolved);
  return !rel.startsWith('..') && !resolve(base, rel).includes('\0');
}

/**
 * Generates a random seed in the Wan2GP range (0 to 2^31 - 1).
 */
function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Seed Screening routes — "Step 0" workflow for comparing renders across
 * multiple seeds before committing to the iteration loop.
 *
 * Generates N identical JSONs that differ only in seed and output_filename,
 * so the user can render them all in Wan2GP and visually pick the best
 * starting seed before iterating.
 */
export function createSeedScreenRoutes(store, config = {}) {
  const router = Router();

  /**
   * POST /api/clips/:clipId/seed-screen
   * Generate seed screening JSONs for a clip.
   *
   * Body: {
   *   base_json: object,      — Wan2GP generation settings to hold constant
   *   seeds: number[],        — Specific seeds to test (optional)
   *   count: number           — How many random seeds if seeds array is empty (default 6, max 12)
   * }
   *
   * Creates JSON files in clip-path/seed-screening/ and records in seed_screens collection.
   */
  router.post('/:clipId/seed-screen', async (req, res) => {
    try {
      const { clipId } = req.params;
      const { base_json, seeds: requestedSeeds, count: requestedCount } = req.body;

      if (!base_json || typeof base_json !== 'object') {
        return res.status(400).json({ error: 'base_json is required and must be an object' });
      }

      // Determine seeds: use provided array, or generate random ones
      const count = Math.min(Math.max(parseInt(requestedCount) || 6, 1), 12);
      let seeds;
      if (Array.isArray(requestedSeeds) && requestedSeeds.length > 0) {
        seeds = requestedSeeds.slice(0, 12).map(s => parseInt(s)).filter(s => !isNaN(s));
        if (seeds.length === 0) {
          return res.status(400).json({ error: 'seeds array contained no valid numbers' });
        }
      } else {
        seeds = Array.from({ length: count }, () => randomSeed());
      }

      // Look up clip and scene for path generation
      const clip = await store.get('clips', clipId);
      const scene = await store.get('scenes', clip.scene_id);
      const paths = getClipPaths(config, clip, scene);
      const screenDir = paths.seedScreening;

      // Path safety check
      const baseDir = config.project_base_dir || config.iteration_save_dir;
      if (!isPathWithin(screenDir, baseDir)) {
        return res.status(400).json({ error: 'Path validation failed — directory traversal detected' });
      }

      await mkdir(screenDir, { recursive: true });

      // Sanitize clip name for filenames
      const safeClipName = basename(clip.name)
        .replace(/[^a-zA-Z0-9\-. ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();

      const iterationFrameCount = config.iteration_frame_count || 32;
      const outputDir = config.wan2gp_output_dir || join(config.wan2gp_json_dir || '.', 'outputs');

      const results = [];

      for (const seed of seeds) {
        // Clone base_json, set seed-specific fields
        const screenJson = { ...base_json };
        screenJson.seed = seed;
        screenJson.video_length = iterationFrameCount;
        screenJson.output_filename = `${safeClipName}_seed-screen_${seed}`;

        // Strip junk fields using WAN2GP_FIELDS whitelist
        Object.keys(screenJson).forEach(k => {
          if (!WAN2GP_FIELDS.has(k)) delete screenJson[k];
        });

        // Write JSON to seed-screening directory
        const jsonFilename = `${safeClipName}_seed-screen_${seed}.json`;
        const jsonPath = join(screenDir, jsonFilename);
        await writeFile(jsonPath, JSON.stringify(screenJson, null, 2));

        // Expected render path (where Wan2GP will output the file)
        const renderPath = join(outputDir, `${safeClipName}_seed-screen_${seed}.mp4`);

        // Store screening record in seed_screens collection
        const record = await store.create('seed_screens', {
          clip_id: clipId,
          seed,
          json_path: jsonPath,
          render_path: renderPath,
          frames: [],
          selected: false,
          rating: null
        });

        results.push({
          id: record.id,
          seed,
          json_path: jsonPath,
          render_path: renderPath
        });
      }

      // Update clip status to screening
      await store.update('clips', clipId, { status: 'screening' });

      res.status(201).json(results);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  /**
   * GET /api/clips/:clipId/seed-screen
   * List all seed screening results for a clip, sorted by seed.
   */
  router.get('/:clipId/seed-screen', async (req, res) => {
    try {
      const { clipId } = req.params;
      const records = await store.list('seed_screens', r => r.clip_id === clipId);
      records.sort((a, b) => a.seed - b.seed);
      res.json(records);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * PATCH /api/clips/:clipId/seed-screen/:screenId
   * Update a seed screen record (e.g. rating, frames).
   */
  router.patch('/:clipId/seed-screen/:screenId', async (req, res) => {
    try {
      const updated = await store.update('seed_screens', req.params.screenId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/clips/:clipId/seed-screen/:screenId
   * Delete a seed screen record from the store.
   */
  router.delete('/:clipId/seed-screen/:screenId', async (req, res) => {
    try {
      const { clipId, screenId } = req.params;

      // Verify the record belongs to this clip before deleting
      const record = await store.get('seed_screens', screenId);
      if (record.clip_id !== clipId) {
        return res.status(404).json({ error: 'Seed screen not found for this clip' });
      }

      await store.delete('seed_screens', screenId);
      res.json({ deleted: true, id: screenId });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * POST /api/clips/:clipId/select-seed
   * Select a seed from screening and start the iteration loop.
   *
   * Body: {
   *   seed: number,           — The winning seed
   *   rating: number (1-5)    — Optional quick rating for the selected seed
   * }
   *
   * Marks the seed as selected, creates iter_01, and transitions clip to in_progress.
   */
  router.post('/:clipId/select-seed', async (req, res) => {
    try {
      const { clipId } = req.params;
      const { seed, rating } = req.body;

      if (seed === undefined || seed === null) {
        return res.status(400).json({ error: 'seed is required' });
      }

      const parsedSeed = parseInt(seed);
      if (isNaN(parsedSeed)) {
        return res.status(400).json({ error: 'seed must be a number' });
      }

      // Find the matching seed screen record and mark it selected
      const screenRecords = await store.list('seed_screens', r => r.clip_id === clipId);
      const match = screenRecords.find(r => r.seed === parsedSeed);

      if (match) {
        const updateData = { selected: true };
        if (rating !== undefined && rating >= 1 && rating <= 5) {
          updateData.rating = rating;
        }
        await store.update('seed_screens', match.id, updateData);
      }

      // Get clip and scene for path generation and iter_01 creation
      const clip = await store.get('clips', clipId);
      const scene = await store.get('scenes', clip.scene_id);
      const paths = getClipPaths(config, clip, scene);

      // Build iter_01 JSON from the selected screening JSON
      // Use the matched seed screen's base settings, or fall back to any screen's settings
      let baseSettings = {};
      if (match?.json_path) {
        try {
          const { readFile } = await import('fs/promises');
          const raw = await readFile(match.json_path, 'utf-8');
          baseSettings = JSON.parse(raw);
        } catch { /* fall through to empty base */ }
      }

      // Ensure the winning seed and iteration-mode frame count
      baseSettings.seed = parsedSeed;
      baseSettings.video_length = config.iteration_frame_count || 32;

      // Set output filename to match iteration naming convention
      const safeClipName = basename(clip.name)
        .replace(/[^a-zA-Z0-9\-. ]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      baseSettings.output_filename = `${safeClipName}_iter_01`;

      // Strip junk fields
      Object.keys(baseSettings).forEach(k => {
        if (!WAN2GP_FIELDS.has(k)) delete baseSettings[k];
      });

      // Write iter_01 JSON to iterations directory
      await mkdir(paths.iterations, { recursive: true });
      const iterFilename = `${safeClipName}_iter_01.json`;
      const iterPath = join(paths.iterations, iterFilename);
      await writeFile(iterPath, JSON.stringify(baseSettings, null, 2));

      // Expected render path for iter_01
      const outputDir = config.wan2gp_output_dir || join(config.wan2gp_json_dir || '.', 'outputs');
      const renderPath = join(outputDir, `${safeClipName}_iter_01.mp4`);

      // Create branch for the selected seed
      // Check if a branch for this seed already exists (re-selection)
      const existingBranches = await store.list('branches', b => b.clip_id === clipId && b.seed === parsedSeed);
      let branch;
      if (existingBranches.length > 0) {
        branch = existingBranches[0];
        // Reactivate if it was screening-only
        if (branch.status === 'screening') {
          branch = await store.update('branches', branch.id, { status: 'active' });
        }
      } else {
        branch = await store.create('branches', {
          clip_id: clipId,
          seed: parsedSeed,
          name: `seed-${parsedSeed}`,
          status: 'active',
          created_from: 'screening',
          source_branch_id: null,
          source_iteration_id: null,
          base_settings: baseSettings,
          best_score: null,
          best_iteration_id: null,
          iteration_count: 0,
          locked_at: null
        });
      }

      // Link seed screen record to branch
      if (match) {
        await store.update('seed_screens', match.id, { branch_id: branch.id });
      }

      // Create iteration record in store with branch_id
      const iteration = await store.create('iterations', {
        clip_id: clipId,
        branch_id: branch.id,
        iteration_number: 1,
        json_filename: iterFilename,
        json_path: iterPath,
        json_contents: baseSettings,
        seed_used: parsedSeed,
        model_type: baseSettings.model_type || 'other',
        render_path: renderPath,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: null,
        change_from_parent: 'Selected from seed screening'
      });

      // Update branch iteration count
      await store.update('branches', branch.id, { iteration_count: 1 });

      // Update clip status to in_progress (only on first selection)
      const clip_current = await store.get('clips', clipId);
      if (clip_current.status !== 'in_progress') {
        await store.update('clips', clipId, { status: 'in_progress' });
      }

      res.status(201).json({ ...iteration, branch_id: branch.id, branch: branch });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}

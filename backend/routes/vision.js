import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { scoreFrames, checkVisionApi } from '../vision-scorer.js';

/**
 * Vision API routes — auto-score iterations using Claude Vision.
 */
export function createVisionRoutes(store, config) {
  const router = Router();
  const framesRoot = join(config.iteratarr_data_dir, 'frames');

  /**
   * GET /api/vision/status — check if Vision API is configured
   */
  router.get('/status', async (req, res) => {
    const status = await checkVisionApi();
    res.json(status);
  });

  /**
   * POST /api/vision/score — score a single iteration
   * Body: { iteration_id, character_name? }
   */
  router.post('/score', async (req, res) => {
    const { iteration_id, character_name } = req.body;
    if (!iteration_id) return res.status(400).json({ error: 'iteration_id required' });

    try {
      // Get iteration data
      const iteration = await store.get('iterations', iteration_id);

      // Find frames
      const framesDir = join(framesRoot, iteration_id);
      let framePaths = [];
      if (existsSync(framesDir)) {
        const files = await readdir(framesDir);
        framePaths = files
          .filter(f => /^frame_\d{3}\.png$/.test(f))
          .sort()
          .map(f => join(framesDir, f));
      }

      // If no frames, try contact sheet
      if (framePaths.length === 0) {
        const csDir = join(config.iteratarr_data_dir, 'contactsheets');
        if (existsSync(csDir)) {
          const csFiles = await readdir(csDir);
          const cs = csFiles.find(f => f.includes(iteration_id));
          if (cs) framePaths = [join(csDir, cs)];
        }
      }

      if (framePaths.length === 0) {
        return res.status(400).json({ error: 'No frames or contact sheet found for this iteration. Extract frames first.' });
      }

      // Build context for scoring
      const context = {
        prompt: iteration.json_contents?.prompt || '',
        negativePrompt: iteration.json_contents?.negative_prompt || '',
        iterationNumber: iteration.iteration_number,
        changeFromParent: iteration.change_from_parent || ''
      };

      // Try to find character description
      if (character_name) {
        try {
          const characters = await store.list('characters');
          const char = characters.find(c => c.name === character_name);
          if (char?.locked_identity_block) {
            context.characterDescription = char.locked_identity_block;
          }
        } catch {}
      }

      // Score
      console.log(`[Vision] Scoring iteration ${iteration.iteration_number} (${iteration_id.substring(0, 8)})`);
      const result = await scoreFrames(framePaths, context);
      console.log(`[Vision] Score: ${result.grand_total}/75`);

      res.json(result);
    } catch (err) {
      console.error(`[Vision] Error:`, err.message);
      res.status(err.message.includes('API key') ? 401 : 500).json({ error: err.message });
    }
  });

  /**
   * POST /api/vision/batch — score multiple iterations
   * Body: { iteration_ids: string[], character_name? }
   */
  router.post('/batch', async (req, res) => {
    const { iteration_ids, character_name } = req.body;
    if (!iteration_ids?.length) return res.status(400).json({ error: 'iteration_ids array required' });

    const results = [];
    for (const id of iteration_ids) {
      try {
        // Reuse the single score logic
        const iteration = await store.get('iterations', id);
        const framesDir = join(framesRoot, id);
        let framePaths = [];
        if (existsSync(framesDir)) {
          const files = await readdir(framesDir);
          framePaths = files
            .filter(f => /^frame_\d{3}\.png$/.test(f))
            .sort()
            .map(f => join(framesDir, f));
        }

        if (framePaths.length === 0) {
          results.push({ iteration_id: id, error: 'No frames found' });
          continue;
        }

        const context = {
          prompt: iteration.json_contents?.prompt || '',
          negativePrompt: iteration.json_contents?.negative_prompt || '',
          iterationNumber: iteration.iteration_number,
          changeFromParent: iteration.change_from_parent || ''
        };

        if (character_name) {
          try {
            const characters = await store.list('characters');
            const char = characters.find(c => c.name === character_name);
            if (char?.locked_identity_block) context.characterDescription = char.locked_identity_block;
          } catch {}
        }

        console.log(`[Vision] Batch scoring ${id.substring(0, 8)}`);
        const result = await scoreFrames(framePaths, context);
        results.push({ iteration_id: id, ...result });
      } catch (err) {
        results.push({ iteration_id: id, error: err.message });
      }
    }

    res.json({ results, scored: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length });
  });

  return router;
}

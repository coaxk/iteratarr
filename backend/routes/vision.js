import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { scoreFrames, checkVisionApi } from '../vision-scorer.js';

// Rate limiting — max 10 requests per minute
let requestTimes = [];
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;

function checkRateLimit() {
  const now = Date.now();
  requestTimes = requestTimes.filter(t => now - t < RATE_WINDOW_MS);
  if (requestTimes.length >= RATE_LIMIT) {
    const waitMs = RATE_WINDOW_MS - (now - requestTimes[0]);
    return { limited: true, waitMs, message: `Rate limited. Try again in ${Math.ceil(waitMs / 1000)}s.` };
  }
  requestTimes.push(now);
  return { limited: false };
}

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
   * GET /api/vision/estimate — estimate cost for scoring an iteration
   */
  router.get('/estimate/:iterationId', async (req, res) => {
    try {
      const framesDir = join(framesRoot, req.params.iterationId);
      let method = 'none';
      let imageCount = 0;
      let estimatedTokens = 0;

      if (existsSync(framesDir)) {
        const files = await readdir(framesDir);
        const cs = files.find(f => f.startsWith('contact_sheet'));
        const frames = files.filter(f => /^frame_\d{3}\.png$/.test(f));

        if (cs) {
          method = 'contact_sheet';
          imageCount = 1;
          estimatedTokens = 2500; // single stitched image
        } else if (frames.length > 0) {
          method = 'individual_frames';
          imageCount = frames.length;
          estimatedTokens = frames.length * 1600;
        }
      }

      const textTokens = 800;
      const outputTokens = 400;
      const totalTokens = estimatedTokens + textTokens + outputTokens;
      // Sonnet pricing: $3/M input, $15/M output
      const estimatedCost = ((estimatedTokens + textTokens) * 3 + outputTokens * 15) / 1000000;

      res.json({ method, imageCount, estimatedTokens: totalTokens, estimatedCost: `$${estimatedCost.toFixed(4)}`, rateLimit: { remaining: RATE_LIMIT - requestTimes.filter(t => Date.now() - t < RATE_WINDOW_MS).length, limit: RATE_LIMIT } });
    } catch {
      res.json({ method: 'unknown', estimatedCost: '~$0.03' });
    }
  });

  /**
   * POST /api/vision/score — score a single iteration
   * Body: { iteration_id, character_name?, force? }
   */
  router.post('/score', async (req, res) => {
    const { iteration_id, character_name, force } = req.body;
    if (!iteration_id) return res.status(400).json({ error: 'iteration_id required' });

    // Rate limit check
    const rl = checkRateLimit();
    if (rl.limited) return res.status(429).json({ error: rl.message });

    try {
      // Get iteration data
      const iteration = await store.get('iterations', iteration_id);

      // Cache check — skip if already scored by vision API (unless force=true)
      if (!force && iteration.evaluation?.scoring_source === 'vision_api') {
        return res.json({
          ...iteration.evaluation,
          cached: true,
          message: 'Already scored by Vision API. Use force=true to re-score.'
        });
      }

      // Prefer contact sheet (1 image, ~75% cheaper) over individual frames
      const framesDir = join(framesRoot, iteration_id);
      let framePaths = [];
      let method = 'none';

      if (existsSync(framesDir)) {
        const files = await readdir(framesDir);

        // Try contact sheet first
        const cs = files.find(f => f.startsWith('contact_sheet'));
        if (cs) {
          framePaths = [join(framesDir, cs)];
          method = 'contact_sheet';
        } else {
          // Fall back to individual frames
          framePaths = files
            .filter(f => /^frame_\d{3}\.png$/.test(f))
            .sort()
            .map(f => join(framesDir, f));
          method = 'individual_frames';
        }
      }

      // Last resort — check central contactsheets directory
      if (framePaths.length === 0) {
        const csDir = join(config.iteratarr_data_dir, 'contactsheets');
        if (existsSync(csDir)) {
          const csFiles = await readdir(csDir);
          const cs = csFiles.find(f => f.includes(iteration_id));
          if (cs) {
            framePaths = [join(csDir, cs)];
            method = 'contact_sheet';
          }
        }
      }

      if (framePaths.length === 0) {
        return res.status(400).json({ error: 'No frames or contact sheet found. Extract frames first.' });
      }

      // Build context
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

      console.log(`[Vision] Scoring iter#${iteration.iteration_number} (${iteration_id.substring(0, 8)}) via ${method}`);
      const result = await scoreFrames(framePaths, context);
      result.method = method;
      console.log(`[Vision] Score: ${result.grand_total}/75 (${method})`);

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
      // Rate limit per item
      const rl = checkRateLimit();
      if (rl.limited) {
        results.push({ iteration_id: id, error: rl.message });
        continue;
      }

      try {
        const iteration = await store.get('iterations', id);
        const framesDir = join(framesRoot, id);
        let framePaths = [];

        if (existsSync(framesDir)) {
          const files = await readdir(framesDir);
          const cs = files.find(f => f.startsWith('contact_sheet'));
          if (cs) {
            framePaths = [join(framesDir, cs)];
          } else {
            framePaths = files.filter(f => /^frame_\d{3}\.png$/.test(f)).sort().map(f => join(framesDir, f));
          }
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

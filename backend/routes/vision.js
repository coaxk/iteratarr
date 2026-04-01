import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
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
  const frameFilePattern = /^frame_\d{3}\.(webp|png)$/i;
  const MIN_FRAME_BYTES = 1024; // anything under 1 KB is a corrupted/empty write

  /**
   * Deduplicate frame filenames: when both frame_NNN.png and frame_NNN.webp exist,
   * keep WebP only. Also filters out files below MIN_FRAME_BYTES.
   */
  async function dedupeFrames(dir, files) {
    const byNumber = {};
    for (const f of files) {
      const m = f.match(/^frame_(\d{3})\.(webp|png)$/i);
      if (!m) continue;
      const num = m[1];
      const ext = m[2].toLowerCase();
      if (!byNumber[num] || ext === 'webp') byNumber[num] = f; // prefer webp
    }
    const candidates = Object.values(byNumber).sort();
    const valid = [];
    for (const f of candidates) {
      try {
        const s = await stat(join(dir, f));
        if (s.size >= MIN_FRAME_BYTES) valid.push(f);
      } catch {}
    }
    return valid;
  }

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
        const frames = files.filter(f => frameFilePattern.test(f));

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
    const { iteration_id, character_name, force, use_frames } = req.body;
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

        if (use_frames) {
          // Forced individual frames mode — for A/B testing vs contact sheet
          const deduped = await dedupeFrames(framesDir, files);
          framePaths = deduped.map(f => join(framesDir, f));
          method = 'individual_frames';
        } else {
          // Default: contact sheet first (cheaper)
          const cs = files.find(f => f.startsWith('contact_sheet'));
          if (cs) {
            framePaths = [join(framesDir, cs)];
            method = 'contact_sheet';
          } else {
            const deduped = await dedupeFrames(framesDir, files);
            framePaths = deduped.map(f => join(framesDir, f));
            method = 'individual_frames';
          }
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

          // Load reference images — check character data dir first, then training dir
          const charPhotoDir = join(config.iteratarr_data_dir, 'characters', char.id);
          const { readdirSync } = await import('fs');
          let photos = [];
          // Source 1: Character data directory (uploaded reference photos)
          try {
            if (existsSync(charPhotoDir)) {
              photos = readdirSync(charPhotoDir)
                .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
                .slice(0, 3)
                .map(f => join(charPhotoDir, f));
            }
          } catch {}
          // Source 2: Fall back to lora-trainer directory
          if (photos.length === 0) {
            const charDirName = character_name.toLowerCase().split(' ')[0];
            const trainingDir = join('C:/Projects/lora-trainer/characters', charDirName);
            try {
              if (existsSync(trainingDir)) {
                const scanDir = (dir) => {
                  const files = readdirSync(dir);
                  for (const f of files) {
                    const fp = join(dir, f);
                    if (/\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('_')) {
                      photos.push(fp);
                    } else if (existsSync(fp) && !f.startsWith('.')) {
                      try { for (const sf of readdirSync(fp)) { if (/\.(jpg|jpeg|png|webp)$/i.test(sf) && !sf.startsWith('_')) photos.push(join(fp, sf)); } } catch {}
                    }
                    if (photos.length >= 3) break;
                  }
                };
                scanDir(trainingDir);
              }
            } catch {}
          }
          if (photos.length > 0) {
            context.referenceImagePaths = photos.slice(0, 3);
            console.log(`[Vision] Loaded ${context.referenceImagePaths.length} reference photos for ${character_name}`);
          }
        } catch {}
      }

      // Build iteration history for chain-aware scoring (#40)
      try {
        const { buildAncestorChain, analyzeHistory } = await import('../iteration-history.js');
        const chain = await buildAncestorChain(store, iteration_id);
        if (chain.length > 1) {
          context.iterationHistory = analyzeHistory(chain);
          console.log(`[Vision] Chain-aware: ${chain.length} ancestors, ${context.iterationHistory.patterns?.stuck_fields?.length || 0} stuck fields`);
        }
      } catch (err) {
        console.log(`[Vision] Could not build iteration history (non-fatal): ${err.message}`);
      }

      console.log(`[Vision] Scoring iter#${iteration.iteration_number} (${iteration_id.substring(0, 8)}) via ${method}`);
      const result = await scoreFrames(framePaths, context);
      result.method = method;
      const cacheLabel = result.cache_hit ? ' [cache hit]' : result.tokens_used?.cache_write > 0 ? ' [cache write]' : '';
      console.log(`[Vision] Score: ${result.grand_total}/75 (${method})${cacheLabel}`);

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
            const deduped = await dedupeFrames(framesDir, files);
            framePaths = deduped.map(f => join(framesDir, f));
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
        const cacheLabel = result.cache_hit ? ' [cache hit]' : result.tokens_used?.cache_write > 0 ? ' [cache write]' : '';
        console.log(`[Vision] Score: ${result.grand_total}/75${cacheLabel}`);
        results.push({ iteration_id: id, ...result });
      } catch (err) {
        results.push({ iteration_id: id, error: err.message });
      }
    }

    res.json({ results, scored: results.filter(r => !r.error).length, failed: results.filter(r => r.error).length });
  });

  /**
   * POST /api/vision/consistency-test
   * Scores the same iteration N times to measure scoring variance.
   * Body: { iteration_id: string, runs?: number (default 5, max 10) }
   * Returns all score sets + computed statistics (mean, stdev per field and grand total).
   */
  router.post('/consistency-test', async (req, res) => {
    try {
      const { iteration_id, runs: rawRuns } = req.body;
      const runs = Math.min(Math.max(parseInt(rawRuns) || 5, 2), 10);

      if (!iteration_id) return res.status(400).json({ error: 'iteration_id required' });

      // Resolve frames (same logic as /score)
      const framesDir = join(framesRoot, iteration_id);
      let framePaths = [];
      if (existsSync(framesDir)) {
        const files = await readdir(framesDir);
        const cs = files.find(f => f.startsWith('contact_sheet'));
        if (cs) {
          framePaths = [join(framesDir, cs)];
        } else {
          const deduped = await dedupeFrames(framesDir, files);
          framePaths = deduped.map(f => join(framesDir, f));
        }
      }
      if (framePaths.length === 0) {
        return res.status(400).json({ error: 'No frames or contact sheet found for this iteration.' });
      }

      // Build context
      const iteration = await store.get('iterations', iteration_id);
      const context = {
        prompt: iteration.json_contents?.prompt || '',
        negativePrompt: iteration.json_contents?.negative_prompt || '',
        iterationNumber: iteration.iteration_number
      };

      // Load character reference images if available
      if (iteration.clip_id) {
        try {
          const clip = await store.get('clips', iteration.clip_id);
          const charName = clip.characters?.[0];
          if (charName) {
            const chars = await store.list('characters', c => c.name === charName);
            if (chars[0]?.reference_images?.length > 0) {
              context.referenceImagePaths = chars[0].reference_images;
              context.characterDescription = chars[0].locked_identity_block || chars[0].description || '';
            }
          }
        } catch {}
      }

      // Run N scores sequentially with retry on transient failures
      const results = [];
      for (let i = 0; i < runs; i++) {
        let retries = 3;
        while (retries > 0) {
          try {
            console.log(`[Vision] Consistency test run ${i + 1}/${runs} for ${iteration_id.substring(0, 8)}`);
            const result = await scoreFrames(framePaths, context);
            results.push(result);
            break;
          } catch (err) {
            retries--;
            if (retries === 0) throw err;
            const isTransient = err.message.includes('temporarily unavailable') || err.message.includes('rate limit') || err.message.includes('gateway');
            if (!isTransient) throw err;
            console.log(`[Vision] Transient error on run ${i + 1}, retrying in 15s (${retries} left): ${err.message}`);
            await new Promise(r => setTimeout(r, 15000));
          }
        }
      }

      // Compute statistics
      const allFields = [
        'face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency',
        'location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct',
        'action_executed', 'smoothness', 'camera_movement'
      ];
      const fieldStats = {};
      for (const field of allFields) {
        const group = ['face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency'].includes(field) ? 'identity'
          : ['location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct'].includes(field) ? 'location' : 'motion';
        const values = results.map(r => r.scores[group][field]);
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const stdev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
        const range = Math.max(...values) - Math.min(...values);
        fieldStats[field] = { values, mean: +mean.toFixed(2), stdev: +stdev.toFixed(2), range, min: Math.min(...values), max: Math.max(...values) };
      }

      const grandTotals = results.map(r => r.grand_total);
      const grandMean = grandTotals.reduce((s, v) => s + v, 0) / grandTotals.length;
      const grandStdev = Math.sqrt(grandTotals.reduce((s, v) => s + (v - grandMean) ** 2, 0) / grandTotals.length);

      res.json({
        iteration_id,
        runs,
        scores: results.map(r => ({ scores: r.scores, grand_total: r.grand_total, qualitative_notes: r.qualitative_notes })),
        grand_totals: grandTotals,
        grand_mean: +grandMean.toFixed(2),
        grand_stdev: +grandStdev.toFixed(2),
        grand_range: Math.max(...grandTotals) - Math.min(...grandTotals),
        field_stats: fieldStats,
        verdict: grandStdev < 3 ? 'PASS — scoring is stable enough for iteration decisions'
          : grandStdev < 5 ? 'MARGINAL — moderate variance, results should be interpreted cautiously'
          : 'FAIL — too noisy for reliable iteration decisions, rubric needs tightening'
      });
    } catch (err) {
      console.error('[Vision] Consistency test error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

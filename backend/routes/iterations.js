import { Router } from 'express';
import { writeFile, mkdir, copyFile } from 'fs/promises';
import { join, resolve, basename, relative } from 'path';
import { validateIteration, validateEvaluation, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, MODEL_TYPES } from '../store/validators.js';
import { getClipPaths } from '../paths.js';
import { EVENTS } from '../telemetry/index.js';

/**
 * Whitelist of valid Wan2GP JSON fields. When generating iteration JSONs,
 * any field NOT in this set is stripped before writing to disk. This prevents
 * junk fields from parent iterations propagating through the chain.
 */
export const WAN2GP_FIELDS = new Set([
  'image_mode', 'prompt', 'alt_prompt', 'negative_prompt', 'resolution',
  'video_length', 'batch_size', 'seed', 'num_inference_steps', 'guidance_scale',
  'guidance2_scale', 'switch_threshold', 'guidance_phases', 'flow_shift',
  'sample_solver', 'repeat_generation', 'multi_prompts_gen_type',
  'multi_images_gen_type', 'skip_steps_cache_type', 'skip_steps_multiplier',
  'skip_steps_start_step_perc', 'loras_multipliers', 'image_prompt_type',
  'video_prompt_type', 'keep_frames_video_guide', 'mask_expand',
  'audio_prompt_type', 'sliding_window_size', 'sliding_window_overlap',
  'sliding_window_color_correction_strength', 'sliding_window_overlap_noise',
  'sliding_window_discard_last_frames', 'temporal_upsampling',
  'spatial_upsampling', 'film_grain_intensity', 'film_grain_saturation',
  'RIFLEx_setting', 'NAG_scale', 'NAG_tau', 'NAG_alpha', 'perturbation_switch',
  'perturbation_layers', 'perturbation_start_perc', 'perturbation_end_perc',
  'apg_switch', 'cfg_star_switch', 'cfg_zero_step', 'min_frames_if_references',
  'override_profile', 'override_attention', 'self_refiner_setting',
  'self_refiner_plan', 'self_refiner_f_uncertainty',
  'self_refiner_certain_percentage', 'output_filename', 'mode',
  'activated_loras', 'type', 'settings_version', 'model_filename', 'model_type'
]);

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
 * Normalizes model type from Wan2GP JSON fields into a canonical enum value.
 * Wan2GP includes `model_type` (e.g. "t2v_2_2") and `type` (e.g. "WanGP v10.9875...")
 * in its JSON. This function maps those to our MODEL_TYPES enum.
 */
export function normalizeModelType(jsonContents) {
  const mt = jsonContents?.model_type || '';
  const type = jsonContents?.type || '';
  if (mt.includes('t2v_2_2') || type.includes('Wan2.2')) return 'wan2.2_t2v_14B';
  if (mt.includes('t2v_2_1') || type.includes('Wan2.1')) return 'wan2.1_t2v_14B';
  if (type.toLowerCase().includes('hunyuan')) return 'hunyuan_video';
  if (type.toLowerCase().includes('ltx')) return 'ltx_2';
  if (type.toLowerCase().includes('flux')) return 'flux';
  return 'other';
}

function computeTotals(scores) {
  const identity = { ...scores.identity };
  identity.total = IDENTITY_FIELDS.reduce((sum, f) => sum + (identity[f] || 0), 0);
  identity.max = IDENTITY_FIELDS.length * 5;

  const location = { ...scores.location };
  location.total = LOCATION_FIELDS.reduce((sum, f) => sum + (location[f] || 0), 0);
  location.max = LOCATION_FIELDS.length * 5;

  const motion = { ...scores.motion };
  motion.total = MOTION_FIELDS.reduce((sum, f) => sum + (motion[f] || 0), 0);
  motion.max = MOTION_FIELDS.length * 5;

  const grand_total = identity.total + location.total + motion.total;
  const grand_max = identity.max + location.max + motion.max;

  return { identity, location, motion, grand_total, grand_max };
}

export function createIterationRoutes(store, config = { score_lock_threshold: 65, iteration_frame_count: 32, production_frame_count: 81, iteration_save_dir: './iterations' }, telemetry = null) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      validateIteration(req.body);
      const existing = await store.list('iterations', i => i.clip_id === req.body.clip_id);
      const iteration_number = existing.reduce((max, i) => Math.max(max, i.iteration_number || 0), 0) + 1;

      // Validate branch_id if provided
      const branch_id = req.body.branch_id || null;
      if (branch_id) {
        try {
          const branch = await store.get('branches', branch_id);
          if (branch.clip_id !== req.body.clip_id) {
            return res.status(400).json({ error: 'Branch does not belong to this clip' });
          }
        } catch {
          return res.status(400).json({ error: `Branch ${branch_id} not found` });
        }
      }

      const iteration = await store.create('iterations', {
        clip_id: req.body.clip_id,
        branch_id,
        iteration_number,
        json_filename: req.body.json_filename || `iter_${String(iteration_number).padStart(2, '0')}.json`,
        json_path: req.body.json_path || null,
        json_contents: req.body.json_contents || {},
        seed_used: req.body.json_contents?.seed || null,
        model_type: normalizeModelType(req.body.json_contents),
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: req.body.parent_iteration_id || null,
        change_from_parent: req.body.change_from_parent || null
      });

      // Update clip status to in_progress if it was not_started
      try {
        const clip = await store.get('clips', req.body.clip_id);
        if (clip.status === 'not_started') {
          await store.update('clips', clip.id, { status: 'in_progress' });
        }
      } catch { /* clip might not exist in tests */ }

      res.status(201).json(iteration);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const iteration = await store.get('iterations', req.params.id);
      if (iteration.evaluation_id) {
        iteration.evaluation = await store.get('evaluations', iteration.evaluation_id);
      }
      res.json(iteration);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.post('/:id/evaluate', async (req, res) => {
    try {
      validateEvaluation({ iteration_id: req.params.id, ...req.body });
      const scores = computeTotals(req.body.scores);
      const production_ready = scores.grand_total >= config.score_lock_threshold;

      // Compute score deltas if AI scores were provided
      let ai_scores = req.body.ai_scores || null;
      let score_deltas = null;
      if (ai_scores) {
        score_deltas = {};
        for (const group of ['identity', 'location', 'motion']) {
          if (ai_scores[group] && scores[group]) {
            score_deltas[group] = {};
            for (const [key, humanVal] of Object.entries(scores[group])) {
              if (key === 'total' || key === 'max') continue;
              const aiVal = ai_scores[group][key];
              if (aiVal !== undefined) {
                score_deltas[group][key] = aiVal - humanVal;
              }
            }
          }
        }
      }

      const evaluation = await store.create('evaluations', {
        iteration_id: req.params.id,
        scores,
        ai_scores,
        score_deltas,
        attribution: req.body.attribution || {},
        qualitative_notes: req.body.qualitative_notes || '',
        scoring_source: req.body.scoring_source || 'manual',
        production_ready,
        meta: { app_version: '0.1.0' }
      });

      await store.update('iterations', req.params.id, {
        status: 'evaluated',
        evaluation_id: evaluation.id
      });

      // Update branch best score if this evaluation is higher
      const iterForBranch = await store.get('iterations', req.params.id);
      if (iterForBranch.branch_id) {
        try {
          const branch = await store.get('branches', iterForBranch.branch_id);
          if (!branch.best_score || evaluation.scores.grand_total > branch.best_score) {
            await store.update('branches', iterForBranch.branch_id, {
              best_score: evaluation.scores.grand_total,
              best_iteration_id: req.params.id
            });
          }
          // Update iteration count
          const branchIters = await store.list('iterations', i => i.branch_id === iterForBranch.branch_id);
          await store.update('branches', iterForBranch.branch_id, {
            iteration_count: branchIters.length
          });
        } catch { /* branch may not exist */ }
      }

      // Telemetry: record evaluation with scores, attribution, and generation settings
      if (telemetry) {
        const iterForTelemetry = await store.get('iterations', req.params.id);
        telemetry.record(EVENTS.EVALUATION_SAVED, {
          iteration_number: iterForTelemetry.iteration_number,
          model_type: iterForTelemetry.model_type || null,
          scores: evaluation.scores,
          ai_scores: evaluation.ai_scores,
          score_deltas: evaluation.score_deltas,
          scoring_source: evaluation.scoring_source,
          attribution: evaluation.attribution,
          production_ready: evaluation.production_ready,
          guidance_scale: iterForTelemetry.json_contents?.guidance_scale,
          guidance2_scale: iterForTelemetry.json_contents?.guidance2_scale,
          loras_multipliers: iterForTelemetry.json_contents?.loras_multipliers,
          video_length: iterForTelemetry.json_contents?.video_length,
          seed: iterForTelemetry.seed_used,
          flow_shift: iterForTelemetry.json_contents?.flow_shift,
          NAG_scale: iterForTelemetry.json_contents?.NAG_scale
        });

        // If rope attribution present, record a separate ROPE_ATTRIBUTED event
        if (evaluation.attribution?.rope) {
          telemetry.record(EVENTS.ROPE_ATTRIBUTED, {
            rope: evaluation.attribution.rope,
            confidence: evaluation.attribution.confidence,
            lowest_element: evaluation.attribution.lowest_element,
            scores: evaluation.scores,
            model_type: iterForTelemetry.model_type || null,
            iteration_number: iterForTelemetry.iteration_number
          });
        }
      }

      res.status(201).json(evaluation);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/:id/lock', async (req, res) => {
    try {
      // --- Step 1: Validate iteration exists and has been evaluated ---
      const iteration = await store.get('iterations', req.params.id);
      if (iteration.status !== 'evaluated') {
        return res.status(400).json({ error: `Iteration must be evaluated before locking. Current status: ${iteration.status}` });
      }
      if (!iteration.evaluation_id) {
        return res.status(400).json({ error: 'Iteration has no evaluation — cannot lock without scoring' });
      }

      // Verify score meets threshold
      const evaluation = await store.get('evaluations', iteration.evaluation_id);
      if (!evaluation.production_ready) {
        return res.status(400).json({
          error: `Score ${evaluation.scores.grand_total}/${evaluation.scores.grand_max} does not meet lock threshold of ${config.score_lock_threshold}`
        });
      }

      // --- Step 2: Look up clip and scene for naming/metadata ---
      const clip = await store.get('clips', iteration.clip_id);
      const scene = await store.get('scenes', clip.scene_id);

      // Sanitize clip name for filesystem use (no traversal, no special chars)
      const safeClipName = basename(clip.name).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
      if (!safeClipName) {
        return res.status(400).json({ error: 'Clip name is invalid for filesystem use' });
      }

      // --- Step 3: Create LOCKED directory, copy iteration JSON there ---
      const lockDir = config.production_lock_dir;
      const lockedDir = join(lockDir, safeClipName, 'LOCKED');

      // Path safety: all writes must be within configured directories
      if (!isPathWithin(lockedDir, lockDir)) {
        return res.status(400).json({ error: 'Path validation failed — directory traversal detected' });
      }

      await mkdir(lockedDir, { recursive: true });

      // Write the original iteration JSON to the LOCKED folder
      const iterationJsonPath = join(lockedDir, iteration.json_filename);
      await writeFile(iterationJsonPath, JSON.stringify(iteration.json_contents, null, 2));

      // --- Step 4: Generate production JSON (81 frames, same seed) ---
      const prodJson = {
        ...iteration.json_contents,
        video_length: config.production_frame_count || 81
      };
      const prodFilename = `${safeClipName}_PRODUCTION.json`;
      const prodJsonPath = join(lockedDir, prodFilename);
      await writeFile(prodJsonPath, JSON.stringify(prodJson, null, 2));

      // --- Step 5: Generate DaVinci metadata sidecar JSON ---
      const davinciMeta = {
        clip: clip.name,
        scene: scene.name,
        episode: scene.episode || 1,
        character: (clip.characters && clip.characters[0]) || '',
        loras: iteration.json_contents.loras || iteration.json_contents.lora_files || [],
        seed: iteration.json_contents.seed || iteration.seed_used,
        locked_date: new Date().toISOString().split('T')[0],
        iteration: iteration.iteration_number,
        final_score: evaluation.scores.grand_total
      };
      const sidecarFilename = `${safeClipName}_DAVINCI.json`;
      const sidecarPath = join(lockedDir, sidecarFilename);
      await writeFile(sidecarPath, JSON.stringify(davinciMeta, null, 2));

      // --- Step 6: Create queue record in store ---
      const queueDir = config.production_queue_dir;
      if (queueDir) {
        await mkdir(queueDir, { recursive: true });
        // Also write a queue manifest file for external tools to pick up
        const queueFilePath = join(queueDir, `${safeClipName}.json`);
        if (isPathWithin(queueFilePath, queueDir)) {
          await writeFile(queueFilePath, JSON.stringify({
            clip_id: clip.id,
            clip_name: clip.name,
            production_json_path: prodJsonPath,
            sidecar_path: sidecarPath,
            queued_at: new Date().toISOString()
          }, null, 2));
        }
      }

      const queueRecord = await store.create('production_queue', {
        clip_id: clip.id,
        clip_name: clip.name,
        iteration_id: iteration.id,
        iteration_number: iteration.iteration_number,
        seed: iteration.json_contents.seed || iteration.seed_used,
        loras: davinciMeta.loras,
        final_score: evaluation.scores.grand_total,
        production_json_path: prodJsonPath,
        sidecar_path: sidecarPath,
        locked_dir: lockedDir,
        status: 'queued',
        queued_at: new Date().toISOString()
      });

      // --- Step 7: Mark iteration locked, update clip + branch statuses ---
      await store.update('iterations', req.params.id, { status: 'locked' });
      await store.update('clips', iteration.clip_id, {
        status: 'in_queue',
        locked_iteration_id: req.params.id,
        production_json_path: prodJsonPath
      });

      // Branch lock cascade: lock the winning branch, supersede all others
      if (iteration.branch_id) {
        await store.update('branches', iteration.branch_id, {
          status: 'locked',
          locked_at: new Date().toISOString(),
          best_score: evaluation.scores.grand_total,
          best_iteration_id: iteration.id
        });
        const otherBranches = await store.list('branches',
          b => b.clip_id === iteration.clip_id && b.id !== iteration.branch_id && b.status !== 'abandoned'
        );
        for (const branch of otherBranches) {
          await store.update('branches', branch.id, { status: 'superseded' });
        }
      }

      // --- Step 8: Update character proven settings from locked iteration ---
      // Roots->leaves write-back with provenance.
      // Only replace best_* pointers when score improves; preserve historical best.
      const updatedCharacters = [];
      const now = new Date().toISOString();
      const lockedSeed = iteration.json_contents.seed || iteration.seed_used || null;
      const lockedScore = evaluation.scores.grand_total;

      function buildProvenSettings(jsonContents) {
        return {
          guidance_scale: jsonContents.guidance_scale,
          guidance2_scale: jsonContents.guidance2_scale,
          loras_multipliers: jsonContents.loras_multipliers || '',
          film_grain_intensity: jsonContents.film_grain_intensity,
          film_grain_saturation: jsonContents.film_grain_saturation,
          flow_shift: jsonContents.flow_shift,
          NAG_scale: jsonContents.NAG_scale,
          num_inference_steps: jsonContents.num_inference_steps,
          seed: jsonContents.seed
        };
      }

      if (clip.characters && Array.isArray(clip.characters)) {
        for (const clipCharacterValue of clip.characters) {
          const key = String(clipCharacterValue).toLowerCase();
          const matches = await store.list('characters', c =>
            String(c.trigger_word || '').toLowerCase() === key ||
            String(c.name || '').toLowerCase() === key
          );
          if (matches.length > 0) {
            const character = matches[0];
            const existingBest = Number(character.best_score ?? -1);
            const isBetter = lockedScore > existingBest;
            const hasNoBest = !Number.isFinite(existingBest) || existingBest < 0;
            const characterUpdate = {
              proven_seed: lockedSeed,
              seed_promoted_at: now,
              seed_promotion_source_iteration_id: iteration.id,
              seed_promotion_clip_id: clip.id
            };

            // Only overwrite proven settings on improved (or first) best.
            if (isBetter || hasNoBest || !character.proven_settings_source_iteration_id) {
              characterUpdate.proven_settings = buildProvenSettings(iteration.json_contents || {});
              characterUpdate.proven_settings_source_iteration_id = iteration.id;
              characterUpdate.proven_settings_updated_at = now;

              // Optional identity write-back from alt prompt when present.
              if (iteration.json_contents.alt_prompt) {
                characterUpdate.locked_identity_block = iteration.json_contents.alt_prompt;
              }
            }

            if (isBetter || hasNoBest) {
              characterUpdate.best_iteration_id = iteration.id;
              characterUpdate.best_score = lockedScore;
            }

            await store.update('characters', character.id, characterUpdate);
            updatedCharacters.push({
              id: character.id,
              name: character.name,
              trigger_word: character.trigger_word,
              best_updated: !!(isBetter || hasNoBest),
              proven_settings_updated: !!(isBetter || hasNoBest || !character.proven_settings_source_iteration_id),
              proven_seed: lockedSeed
            });
          }
        }
      }

      // Telemetry: record iteration lock event
      if (telemetry) {
        telemetry.record(EVENTS.ITERATION_LOCKED, {
          iteration_number: iteration.iteration_number,
          final_score: evaluation.scores.grand_total,
          seed: iteration.json_contents.seed || iteration.seed_used,
          guidance_scale: iteration.json_contents?.guidance_scale,
          guidance2_scale: iteration.json_contents?.guidance2_scale,
          loras_multipliers: iteration.json_contents?.loras_multipliers,
          video_length: config.production_frame_count,
          production_ready: true
        });
      }

      res.json({
        locked: true,
        production_json: prodJson,
        paths: {
          locked_dir: lockedDir,
          iteration_json: iterationJsonPath,
          production_json: prodJsonPath,
          davinci_sidecar: sidecarPath
        },
        queue_record_id: queueRecord.id,
        davinci_metadata: davinciMeta,
        updated_characters: updatedCharacters
      });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  router.post('/:id/render-complete', async (req, res) => {
    try {
      const { detected_at } = req.body;
      if (!detected_at) {
        return res.status(400).json({ error: 'Body must include { detected_at: ISO string }' });
      }

      const iteration = await store.get('iterations', req.params.id);
      const detectedTime = new Date(detected_at);
      const createdTime = new Date(iteration.created_at);
      const render_duration_seconds = Math.round((detectedTime - createdTime) / 1000);

      await store.update('iterations', req.params.id, { render_duration_seconds });

      // Telemetry: record render completion with duration and context
      if (telemetry) {
        telemetry.record(EVENTS.RENDER_COMPLETED, {
          render_duration_seconds,
          iteration_number: iteration.iteration_number,
          video_length: iteration.json_contents?.video_length || null
        });
      }

      res.json({
        render_duration_seconds,
        iteration_id: req.params.id,
        iteration_number: iteration.iteration_number
      });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await store.delete('iterations', req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const updated = await store.update('iterations', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  router.post('/:id/next', async (req, res) => {
    try {
      const parent = await store.get('iterations', req.params.id);

      // Guardrail: check this iteration hasn't already generated a child
      const allIterations = await store.list('iterations', i => i.clip_id === parent.clip_id);
      const existingChild = allIterations.find(i => i.parent_iteration_id === parent.id);
      if (existingChild) {
        return res.status(409).json({
          error: `Iteration #${parent.iteration_number} has already generated iteration #${existingChild.iteration_number}. Each iteration can only generate one child.`,
          existing_child_id: existingChild.id
        });
      }

      // Guardrail: must be evaluated before generating next
      if (!parent.evaluation_id) {
        return res.status(400).json({ error: 'Iteration must be evaluated before generating the next iteration' });
      }

      // Get evaluation for attribution
      let attribution = {};
      if (parent.evaluation_id) {
        const evaluation = await store.get('evaluations', parent.evaluation_id);
        attribution = evaluation.attribution || {};
      }

      // Apply changes from attribution
      const nextJson = { ...parent.json_contents };

      // Priority 1: next_changes object — multi-field changes (e.g. prompt + alt_prompt + negative_prompt)
      if (attribution.next_changes && typeof attribution.next_changes === 'object') {
        for (const [field, value] of Object.entries(attribution.next_changes)) {
          if (field in nextJson) {
            nextJson[field] = value;
          }
        }
      }
      // Priority 2: legacy single-field change (backward compatible)
      else if (attribution.next_change_json_field && attribution.next_change_value !== undefined) {
        // Only apply if it's a single field name (not comma-separated)
        if (!attribution.next_change_json_field.includes(',') && attribution.next_change_json_field in nextJson) {
          // Coerce value to match the original type (prevents string "8.5" overwriting number 6.1)
          let val = attribution.next_change_value;
          const origType = typeof nextJson[attribution.next_change_json_field];
          if (origType === 'number' && typeof val === 'string') {
            const parsed = Number(val);
            if (!isNaN(parsed)) val = parsed;
          }
          nextJson[attribution.next_change_json_field] = val;
        }
      }
      // Ensure iteration mode — but don't overwrite if next_changes explicitly set these
      const changedFields = attribution.next_changes ? Object.keys(attribution.next_changes) : [];
      if (!changedFields.includes('seed')) {
        nextJson.seed = parent.json_contents.seed || parent.seed_used;
      }
      if (!changedFields.includes('video_length')) {
        nextJson.video_length = config.iteration_frame_count;
      }

      // Count existing iterations for this clip to get correct number
      const existing = await store.list('iterations', i => i.clip_id === parent.clip_id);
      const nextNum = existing.reduce((max, i) => Math.max(max, i.iteration_number || 0), 0) + 1;

      // Build change description
      let change_from_parent;
      if (attribution.next_changes && typeof attribution.next_changes === 'object') {
        const fields = Object.keys(attribution.next_changes);
        change_from_parent = `${fields.length} field(s) changed: ${fields.join(', ')}`;
      } else if (attribution.next_change_json_field && attribution.next_change_value !== undefined) {
        change_from_parent = `${attribution.next_change_json_field}: ${JSON.stringify(parent.json_contents[attribution.next_change_json_field])} -> ${JSON.stringify(attribution.next_change_value)}`;
      } else {
        change_from_parent = req.body?.change_from_parent || 'manual change';
      }

      // Determine save path using clip paths if clip + scene are available,
      // otherwise fall back to flat iteration_save_dir
      let saveDir;
      let nextFilename;
      let renderPath = null;
      try {
        const clip = await store.get('clips', parent.clip_id);
        const scene = await store.get('scenes', clip.scene_id);
        const paths = getClipPaths(config, clip, scene);
        saveDir = paths.iterations;
        nextFilename = basename(paths.iterationFile(nextNum));
      } catch {
        // Clip or scene not found — fall back to flat directory
        saveDir = config.iteration_save_dir || './iterations';
        const baseName = parent.json_filename.replace(/\d+\.json$/, '');
        nextFilename = `${baseName}${String(nextNum).padStart(2, '0')}.json`;
      }

      // Set output_filename so Wan2GP names the render to match our convention
      // Wan2GP outputs to its own outputs/ folder with this basename
      const renderBasename = nextFilename.replace(/\.json$/, '');
      nextJson.output_filename = renderBasename;

      // Render path points to where Wan2GP will actually put the file
      const outputDir = config.wan2gp_output_dir || join(config.wan2gp_json_dir, 'outputs');
      renderPath = join(outputDir, `${renderBasename}.mp4`);

      // Strip any fields not in the Wan2GP whitelist to prevent junk propagation
      Object.keys(nextJson).forEach(k => { if (!WAN2GP_FIELDS.has(k)) delete nextJson[k]; });

      // Apply user-supplied JSON overrides AFTER the whitelist strip.
      // These bypass the whitelist intentionally — the user owns the risk on
      // unrecognised fields (Wan2GP silently ignores what it doesn't know).
      const userOverride = req.body?.json_contents_override;
      if (userOverride && typeof userOverride === 'object' && !Array.isArray(userOverride)) {
        const manualFields = [];
        for (const [field, value] of Object.entries(userOverride)) {
          if (JSON.stringify(nextJson[field]) !== JSON.stringify(value)) {
            nextJson[field] = value;
            manualFields.push(field);
          }
        }
        if (manualFields.length > 0) {
          change_from_parent += ` + manual: ${manualFields.join(', ')}`;
        }
      }

      await mkdir(saveDir, { recursive: true });
      const savePath = join(saveDir, nextFilename);
      await writeFile(savePath, JSON.stringify(nextJson, null, 2));

      const nextIteration = await store.create('iterations', {
        clip_id: parent.clip_id,
        branch_id: parent.branch_id || null,
        iteration_number: nextNum,
        json_filename: nextFilename,
        json_path: savePath,
        json_contents: nextJson,
        seed_used: nextJson.seed,
        model_type: parent.model_type || normalizeModelType(nextJson),
        render_path: renderPath,
        status: 'pending',
        evaluation_id: null,
        parent_iteration_id: parent.id,
        change_from_parent
      });

      // Telemetry: record iteration generation
      if (telemetry) {
        telemetry.record(EVENTS.ITERATION_GENERATED, {
          iteration_number: nextIteration.iteration_number,
          parent_iteration_number: parent.iteration_number,
          change_from_parent: nextIteration.change_from_parent,
          seed: nextJson.seed,
          guidance_scale: nextJson.guidance_scale,
          guidance2_scale: nextJson.guidance2_scale,
          loras_multipliers: nextJson.loras_multipliers,
          video_length: nextJson.video_length,
          flow_shift: nextJson.flow_shift,
          NAG_scale: nextJson.NAG_scale
        });
      }

      res.status(201).json(nextIteration);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}

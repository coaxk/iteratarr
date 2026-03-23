import { Router } from 'express';
import { writeFile, mkdir, copyFile } from 'fs/promises';
import { join, resolve, basename, relative } from 'path';
import { validateIteration, validateEvaluation, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../store/validators.js';
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

      const iteration = await store.create('iterations', {
        clip_id: req.body.clip_id,
        iteration_number,
        json_filename: req.body.json_filename || `iter_${String(iteration_number).padStart(2, '0')}.json`,
        json_path: req.body.json_path || null,
        json_contents: req.body.json_contents || {},
        seed_used: req.body.json_contents?.seed || null,
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

      // Telemetry: record evaluation with scores, attribution, and generation settings
      if (telemetry) {
        const iterForTelemetry = await store.get('iterations', req.params.id);
        telemetry.record(EVENTS.EVALUATION_SAVED, {
          iteration_number: iterForTelemetry.iteration_number,
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

      // --- Step 7: Mark iteration locked, update clip status to in_queue ---
      await store.update('iterations', req.params.id, { status: 'locked' });
      await store.update('clips', iteration.clip_id, {
        status: 'in_queue',
        locked_iteration_id: req.params.id,
        production_json_path: prodJsonPath
      });

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
        davinci_metadata: davinciMeta
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
          nextJson[attribution.next_change_json_field] = attribution.next_change_value;
        }
      }
      // Ensure iteration mode
      nextJson.seed = parent.json_contents.seed || parent.seed_used;
      nextJson.video_length = config.iteration_frame_count;

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

      await mkdir(saveDir, { recursive: true });
      const savePath = join(saveDir, nextFilename);
      await writeFile(savePath, JSON.stringify(nextJson, null, 2));

      const nextIteration = await store.create('iterations', {
        clip_id: parent.clip_id,
        iteration_number: nextNum,
        json_filename: nextFilename,
        json_path: savePath,
        json_contents: nextJson,
        seed_used: nextJson.seed,
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

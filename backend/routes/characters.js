import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir, readdir, writeFile, unlink } from 'fs/promises';
import { validateCharacter } from '../store/validators.js';
import { EVENTS } from '../telemetry/index.js';

/**
 * Default Wan2GP JSON template — all fields that Wan2GP expects.
 * Character-specific values (prompt, negative, LoRAs, settings) are injected.
 */
const WAN2GP_TEMPLATE = {
  image_mode: 0,
  resolution: '832x480',
  video_length: 81,
  batch_size: 1,
  num_inference_steps: 30,
  switch_threshold: 875,
  guidance_phases: 2,
  flow_shift: 12,
  sample_solver: 'unipc',
  repeat_generation: 1,
  multi_prompts_gen_type: 0,
  multi_images_gen_type: 0,
  skip_steps_cache_type: '',
  skip_steps_multiplier: 1.75,
  skip_steps_start_step_perc: 0,
  image_prompt_type: '',
  video_prompt_type: '',
  keep_frames_video_guide: '',
  mask_expand: 0,
  audio_prompt_type: '',
  sliding_window_size: 81,
  sliding_window_overlap: 5,
  sliding_window_color_correction_strength: 0,
  sliding_window_overlap_noise: 0,
  sliding_window_discard_last_frames: 0,
  temporal_upsampling: '',
  spatial_upsampling: '',
  RIFLEx_setting: 0,
  NAG_scale: 1,
  NAG_tau: 3.5,
  NAG_alpha: 0.5,
  perturbation_switch: 0,
  perturbation_layers: [9],
  perturbation_start_perc: 10,
  perturbation_end_perc: 90,
  apg_switch: 0,
  cfg_star_switch: 0,
  cfg_zero_step: -1,
  min_frames_if_references: 1,
  override_profile: -1,
  override_attention: '',
  self_refiner_setting: 0,
  self_refiner_plan: [],
  self_refiner_f_uncertainty: 0,
  self_refiner_certain_percentage: 0.999,
  output_filename: '',
  mode: '',
  type: 'WanGP v10.9875 by DeepBeepMeep - Wan2.2 Text2video 14B',
  settings_version: 2.55,
  model_filename: 'https://huggingface.co/DeepBeepMeep/Wan2.2/resolve/main/wan2.2_text2video_14B_high_quanto_mbf16_int8.safetensors',
  model_type: 't2v_2_2'
};

export function createCharacterRoutes(store, config, telemetry = null) {
  const router = Router();
  const charsDataDir = join(config.iteratarr_data_dir, 'characters');

  router.get('/', async (req, res) => {
    const characters = await store.list('characters');
    // Enrich with reference photo count
    for (const char of characters) {
      const photoDir = join(charsDataDir, char.id);
      try {
        if (existsSync(photoDir)) {
          const files = await readdir(photoDir);
          char.reference_photo_count = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
        } else {
          char.reference_photo_count = 0;
        }
      } catch { char.reference_photo_count = 0; }
    }
    res.json(characters);
  });

  router.post('/', async (req, res) => {
    try {
      validateCharacter(req.body);
      const character = await store.create('characters', {
        name: req.body.name,
        trigger_word: req.body.trigger_word,
        lora_files: req.body.lora_files || [],
        lora_dir: req.body.lora_dir || '',
        locked_identity_block: req.body.locked_identity_block || '',
        locked_negative_block: req.body.locked_negative_block || '',
        proven_settings: req.body.proven_settings || {},
        proven_seed: req.body.proven_seed ?? null,
        proven_settings_source_iteration_id: null,
        proven_settings_updated_at: null,
        seed_promotion_source_iteration_id: null,
        seed_promoted_at: null,
        best_iteration_id: null,
        notes: req.body.notes || ''
      });

      // Create reference photo directory
      await mkdir(join(charsDataDir, character.id), { recursive: true });

      if (telemetry) {
        telemetry.record(EVENTS.CHARACTER_CREATED, {
          character_name: character.name,
          lora_count: (character.lora_files || []).length,
          has_identity_block: !!character.locked_identity_block,
          has_negative_block: !!character.locked_negative_block,
          has_proven_settings: Object.keys(character.proven_settings || {}).length > 0
        });
      }

      res.status(201).json(character);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);
      res.json(character);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const updated = await store.update('characters', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  /**
   * POST /:id/promote-seed
   *
   * Promote a seed to character-level provenance so future workflows can reuse it.
   * This supports the roots->leaves loop even when promotion is done from screening
   * or analytics views before/without a lock event.
   *
   * Body: {
   *   seed: number (required),
   *   source_iteration_id?: string,
   *   clip_id?: string
   * }
   */
  router.post('/:id/promote-seed', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);
      const parsedSeed = Number(req.body.seed);
      if (!Number.isFinite(parsedSeed)) {
        return res.status(400).json({ error: 'seed is required and must be a number' });
      }

      const now = new Date().toISOString();
      const patch = {
        proven_seed: parsedSeed,
        seed_promoted_at: now,
        seed_promotion_source_iteration_id: req.body.source_iteration_id || null
      };

      // If source iteration is supplied, verify it belongs to a clip containing this character.
      if (req.body.source_iteration_id) {
        const iter = await store.get('iterations', req.body.source_iteration_id);
        const clip = await store.get('clips', iter.clip_id);
        const chars = (clip.characters || []).map(v => String(v).toLowerCase());
        const matchesCharacter = chars.includes(String(character.name).toLowerCase()) ||
          chars.includes(String(character.trigger_word).toLowerCase());
        if (!matchesCharacter) {
          return res.status(400).json({
            error: 'source_iteration_id does not belong to a clip containing this character'
          });
        }

        // Optional settings write-back when iteration JSON is present.
        if (iter.json_contents && typeof iter.json_contents === 'object') {
          patch.proven_settings = {
            ...(character.proven_settings || {}),
            guidance_scale: iter.json_contents.guidance_scale,
            guidance2_scale: iter.json_contents.guidance2_scale,
            loras_multipliers: iter.json_contents.loras_multipliers || '',
            film_grain_intensity: iter.json_contents.film_grain_intensity,
            film_grain_saturation: iter.json_contents.film_grain_saturation,
            flow_shift: iter.json_contents.flow_shift,
            NAG_scale: iter.json_contents.NAG_scale,
            num_inference_steps: iter.json_contents.num_inference_steps,
            seed: iter.json_contents.seed
          };
          patch.proven_settings_source_iteration_id = iter.id;
          patch.proven_settings_updated_at = now;
        }
      }

      if (req.body.clip_id) {
        patch.seed_promotion_clip_id = req.body.clip_id;
      }

      const updated = await store.update('characters', req.params.id, patch);
      res.json({
        promoted: true,
        character_id: updated.id,
        proven_seed: updated.proven_seed,
        seed_promoted_at: updated.seed_promoted_at,
        seed_promotion_source_iteration_id: updated.seed_promotion_source_iteration_id,
        character: updated
      });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await store.delete('characters', req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // ─── Reference Photos ───────────────────────────────────

  /**
   * GET /:id/photos — list reference photos for a character
   */
  router.get('/:id/photos', async (req, res) => {
    try {
      const photoDir = join(charsDataDir, req.params.id);
      await mkdir(photoDir, { recursive: true });
      const files = await readdir(photoDir);
      const photos = files
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map(f => ({
          filename: f,
          path: join(photoDir, f),
          url: `/api/characters/${req.params.id}/photos/${f}`
        }));
      res.json({ photos, directory: photoDir });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /:id/photos/:filename — serve a reference photo
   */
  router.get('/:id/photos/:filename', (req, res) => {
    const filePath = join(charsDataDir, req.params.id, req.params.filename);
    if (!existsSync(filePath)) return res.status(404).json({ error: 'Photo not found' });
    res.sendFile(filePath);
  });

  /**
   * POST /:id/photos — upload reference photos (base64 JSON body)
   * Body: { photos: [{ filename, data (base64) }] }
   */
  router.post('/:id/photos', async (req, res) => {
    try {
      const photoDir = join(charsDataDir, req.params.id);
      await mkdir(photoDir, { recursive: true });
      const uploaded = [];
      for (const photo of (req.body.photos || [])) {
        if (!photo.filename || !photo.data) continue;
        const safeName = photo.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const buffer = Buffer.from(photo.data, 'base64');
        await writeFile(join(photoDir, safeName), buffer);
        uploaded.push(safeName);
      }
      res.json({ uploaded, count: uploaded.length });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * DELETE /:id/photos/:filename — delete a reference photo
   */
  router.delete('/:id/photos/:filename', async (req, res) => {
    try {
      const filePath = join(charsDataDir, req.params.id, req.params.filename);
      if (!existsSync(filePath)) return res.status(404).json({ error: 'Photo not found' });
      await unlink(filePath);
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── Baseline JSON Generator ────────────────────────────

  /**
   * POST /:id/baseline-json — generate a Wan2GP-ready baseline JSON from character data
   * Returns a complete JSON ready to paste into seed screener or render directly.
   * Pure identity prompt — no scene. Character development first.
   */
  router.post('/:id/baseline-json', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);
      const seed = req.body.seed || Math.floor(Math.random() * 2147483647);

      if (!character.locked_identity_block) {
        return res.status(400).json({ error: 'Character needs an identity block before generating baseline JSON. Add the character description first.' });
      }

      // Build the identity-focused prompt
      const prompt = `${character.locked_identity_block}, wearing casual clothing, standing, looking toward camera, natural outdoor light, cinematic documentary style, film grain`;

      // Build the JSON
      const json = {
        ...WAN2GP_TEMPLATE,
        prompt,
        alt_prompt: '',
        negative_prompt: character.locked_negative_block || 'blurry, distorted, deformed, low quality, smooth skin, perfect skin, dramatic lighting, video game, CGI, over-rendered',
        seed,
        guidance_scale: character.proven_settings?.guidance_scale ?? 5.9,
        guidance2_scale: character.proven_settings?.guidance2_scale ?? 3,
        loras_multipliers: character.proven_settings?.loras_multipliers ?? '',
        film_grain_intensity: character.proven_settings?.film_grain_intensity ?? 0.01,
        film_grain_saturation: character.proven_settings?.film_grain_saturation ?? 0.5,
        activated_loras: character.lora_files || []
      };

      res.json({
        json,
        character_name: character.name,
        seed,
        note: 'Pure identity baseline — no scene. Establish character identity floor before layering scene content.'
      });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  // ─── Test This Character ────────────────────────────────

  /**
   * POST /:id/test — create a baseline test clip and return it
   * Creates a clip named "[Character] - Baseline" under the LoRA Baseline Tests scene.
   */
  router.post('/:id/test', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);

      if (!character.locked_identity_block) {
        return res.status(400).json({ error: 'Character needs an identity block before testing. Add the character description first.' });
      }
      if (!character.lora_files || character.lora_files.length === 0) {
        return res.status(400).json({ error: 'Character needs LoRA files before testing. Add the LoRA file references first.' });
      }

      // Check if a baseline clip already exists
      const clips = await store.list('clips');
      const existing = clips.find(c => (c.characters || []).includes(character.name) && c.name.includes('Baseline'));
      if (existing) {
        return res.json({ clip: existing, existing: true, message: `Baseline clip already exists: ${existing.name}` });
      }

      // Find or create the LoRA Baseline Tests scene
      const scenes = await store.list('scenes');
      let testScene = scenes.find(s => s.name === 'LoRA Baseline Tests');
      if (!testScene) {
        // Find any project to attach to
        const projects = await store.list('projects');
        if (projects.length === 0) {
          return res.status(400).json({ error: 'No projects exist. Create a project first.' });
        }
        testScene = await store.create('scenes', { name: 'LoRA Baseline Tests', project_id: projects[0].id });
      }

      // Create the clip
      const clip = await store.create('clips', {
        scene_id: testScene.id,
        name: `${character.name} - Baseline`,
        characters: [character.name],
        location: '',
        status: 'screening',
        goal: `Establish identity baseline for ${character.name}. Pure identity render — no scene complexity.`
      });

      res.status(201).json({
        clip,
        existing: false,
        character_name: character.name,
        message: `Created baseline clip. Use "Generate Seeds" to start screening.`,
        note: 'This is a pure identity test — establish the character floor before layering scenes.'
      });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}

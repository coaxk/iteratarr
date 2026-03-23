import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';
import { WAN2GP_FIELDS } from '../../routes/iterations.js';

describe('Iterations API', () => {
  let tmpDir, request, store, iterSaveDir;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    iterSaveDir = join(tmpDir, 'iter-save');
    const testApp = createTestApp(tmpDir, {
      score_lock_threshold: 65,
      iteration_frame_count: 32,
      production_frame_count: 81,
      iteration_save_dir: iterSaveDir,
      production_lock_dir: join(tmpDir, 'finals'),
      production_queue_dir: join(tmpDir, 'queue'),
      wan2gp_output_dir: join(tmpDir, 'outputs')
    });
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleJson = {
    prompt: 'mckdhn, standing on balcony',
    seed: 544083690,
    guidance_scale: 6.1,
    guidance2_scale: 4,
    loras_multipliers: '1.0;0.3 0.3;1.2',
    video_length: 32,
    activated_loras: ['mckdhn-v1-cloud-high.safetensors', 'mckdhn-v1-cloud-low.safetensors']
  };

  it('POST /api/iterations creates iteration with JSON contents', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const res = await request.post('/api/iterations').send({
      clip_id: clip.id,
      json_filename: 'monaco_iter_01.json',
      json_contents: sampleJson
    });
    expect(res.status).toBe(201);
    expect(res.body.iteration_number).toBe(1);
    expect(res.body.seed_used).toBe(544083690);
    expect(res.body.json_contents.guidance_scale).toBe(6.1);
  });

  it('auto-increments iteration number', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });
    const res = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i2.json', json_contents: sampleJson });
    expect(res.body.iteration_number).toBe(2);
  });

  it('POST /api/iterations/:id/evaluate saves evaluation with computed totals', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });

    const res = await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      },
      attribution: {
        lowest_element: 'frame_consistency',
        rope: 'rope_3_lora_multipliers',
        confidence: 'high',
        next_change_description: 'Increase low noise LoRA weight to 1.3',
        next_change_json_field: 'loras_multipliers',
        next_change_value: '1.0;0.2 0.2;1.3'
      },
      qualitative_notes: 'Face drifts in frames 15-20'
    });

    expect(res.status).toBe(201);
    expect(res.body.scores.identity.total).toBe(27);
    expect(res.body.scores.location.total).toBe(16);
    expect(res.body.scores.motion.total).toBe(9);
    expect(res.body.scores.grand_total).toBe(52);
    expect(res.body.scores.grand_max).toBe(75);
    expect(res.body.production_ready).toBe(false);
  });

  it('marks production_ready when score >= threshold', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });

    const res = await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 5, head_shape: 5, jaw: 5, cheekbones: 5, eyes_brow: 5, skin_texture: 5, hair: 5, frame_consistency: 5 },
        location: { location_correct: 5, lighting_correct: 5, wardrobe_correct: 5, geometry_correct: 5 },
        motion: { action_executed: 5, smoothness: 5, camera_movement: 5 }
      },
      attribution: { lowest_element: 'none', rope: 'none' },
      qualitative_notes: 'Perfect'
    });

    expect(res.body.production_ready).toBe(true);
  });

  it('POST /api/iterations/:id/next generates next iteration JSON and writes to disk', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'monaco_iter_01.json', json_contents: sampleJson });

    // Evaluate first
    await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      },
      attribution: {
        lowest_element: 'frame_consistency',
        rope: 'rope_3_lora_multipliers',
        next_change_json_field: 'loras_multipliers',
        next_change_value: '1.0;0.2 0.2;1.3'
      }
    });

    const res = await request.post(`/api/iterations/${iter.body.id}/next`);
    expect(res.status).toBe(201);
    expect(res.body.iteration_number).toBe(2);
    expect(res.body.parent_iteration_id).toBe(iter.body.id);
    expect(res.body.json_contents.loras_multipliers).toBe('1.0;0.2 0.2;1.3');
    expect(res.body.json_contents.seed).toBe(544083690); // seed locked from parent
    expect(res.body.json_contents.video_length).toBe(32); // iteration mode
    expect(res.body.change_from_parent).toContain('loras_multipliers');

    // Verify JSON was written to disk
    const expectedPath = join(iterSaveDir, 'monaco_iter_02.json');
    expect(existsSync(expectedPath)).toBe(true);
    const diskContents = JSON.parse(readFileSync(expectedPath, 'utf-8'));
    expect(diskContents.loras_multipliers).toBe('1.0;0.2 0.2;1.3');
    expect(diskContents.seed).toBe(544083690);
  });

  it('POST /api/iterations/:id/next strips junk fields not in WAN2GP_FIELDS whitelist', async () => {
    const junkJson = {
      ...sampleJson,
      'prompt, alt_prompt, negative_prompt': 'See iter_07 JSON',
      'totally_bogus_field': 42,
      '__internal_debug': true
    };
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'monaco_iter_01.json', json_contents: junkJson });

    // Evaluate first so /next is allowed
    await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      },
      attribution: {
        lowest_element: 'frame_consistency',
        rope: 'rope_3_lora_multipliers',
        next_change_json_field: 'loras_multipliers',
        next_change_value: '1.0;0.2 0.2;1.3'
      }
    });

    const res = await request.post(`/api/iterations/${iter.body.id}/next`);
    expect(res.status).toBe(201);

    // Junk fields must NOT be in the generated JSON
    expect(res.body.json_contents).not.toHaveProperty('prompt, alt_prompt, negative_prompt');
    expect(res.body.json_contents).not.toHaveProperty('totally_bogus_field');
    expect(res.body.json_contents).not.toHaveProperty('__internal_debug');

    // Valid fields must still be present
    expect(res.body.json_contents.prompt).toBe('mckdhn, standing on balcony');
    expect(res.body.json_contents.guidance_scale).toBe(6.1);
    expect(res.body.json_contents.loras_multipliers).toBe('1.0;0.2 0.2;1.3');
    expect(res.body.json_contents.seed).toBe(544083690);

    // Verify the on-disk JSON is also clean
    const diskContents = JSON.parse(readFileSync(res.body.json_path, 'utf-8'));
    expect(diskContents).not.toHaveProperty('prompt, alt_prompt, negative_prompt');
    expect(diskContents).not.toHaveProperty('totally_bogus_field');
    expect(diskContents.prompt).toBe('mckdhn, standing on balcony');

    // Every key in the generated JSON must be in the whitelist
    for (const key of Object.keys(res.body.json_contents)) {
      expect(WAN2GP_FIELDS.has(key), `Unexpected field "${key}" found in generated JSON`).toBe(true);
    }
  });

  it('POST /api/iterations/:id/lock locks iteration and generates production JSON', async () => {
    // Lock requires a real scene (for metadata) and a passing evaluation
    const scene = await store.create('scenes', { project_id: 'p1', name: 'Scene 01', episode: 1 });
    const clip = await store.create('clips', { scene_id: scene.id, name: 'C1', status: 'in_progress' });
    const iter = await request.post('/api/iterations').send({ clip_id: clip.id, json_filename: 'i1.json', json_contents: sampleJson });

    // Evaluate with all 5s (75/75) to meet lock threshold
    await request.post(`/api/iterations/${iter.body.id}/evaluate`).send({
      scores: {
        identity: { face_match: 5, head_shape: 5, jaw: 5, cheekbones: 5, eyes_brow: 5, skin_texture: 5, hair: 5, frame_consistency: 5 },
        location: { location_correct: 5, lighting_correct: 5, wardrobe_correct: 5, geometry_correct: 5 },
        motion: { action_executed: 5, smoothness: 5, camera_movement: 5 }
      },
      attribution: { lowest_element: 'none', rope: 'none' },
      qualitative_notes: 'Perfect'
    });

    const res = await request.post(`/api/iterations/${iter.body.id}/lock`);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.production_json.video_length).toBe(81);
    expect(res.body.paths).toBeDefined();
    expect(res.body.davinci_metadata).toBeDefined();
    expect(res.body.davinci_metadata.final_score).toBe(75);
  });
});

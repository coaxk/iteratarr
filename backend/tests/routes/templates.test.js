import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Templates API', () => {
  let tmpDir, request, store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const VALID_TEMPLATE = {
    name: 'Character at Location — Proven Architecture',
    description: 'Identity anchor + location + action. Alt prompt for identity reinforcement.',
    prompt_template: '({{trigger}}:1.3), ({{identity_condensed}}:1.1), {{action}}, ({{location}}:0.9), cinematic documentary, film grain',
    alt_prompt_template: '{{identity_full}}',
    negative_prompt_template: '{{negative_block}}, jittery motion, watermark',
    default_settings: {
      guidance_scale: 6.1,
      guidance2_scale: 3,
      video_length: 32,
      num_inference_steps: 30,
      film_grain_intensity: 0.01
    }
  };

  const VALID_CHARACTER = {
    name: 'Mick Doohan',
    trigger_word: 'mckdhn',
    lora_files: ['mckdhn-v1-cloud-high.safetensors'],
    locked_identity_block: 'mckdhn, fit healthy mid to late fifties male. Strong jaw, weathered skin, piercing blue eyes, close-cropped grey hair.',
    locked_negative_block: 'young, feminine, cartoon, anime, deformed',
    proven_settings: { guidance_scale: 6.1, guidance2_scale: 3, loras_multipliers: '1.0;0.3' }
  };

  // --- CRUD ---

  it('POST /api/templates creates a template', async () => {
    const res = await request.post('/api/templates').send(VALID_TEMPLATE);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(VALID_TEMPLATE.name);
    expect(res.body.prompt_template).toBe(VALID_TEMPLATE.prompt_template);
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
  });

  it('POST /api/templates rejects missing name', async () => {
    const res = await request.post('/api/templates').send({
      prompt_template: 'test'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('POST /api/templates rejects missing prompt_template', async () => {
    const res = await request.post('/api/templates').send({
      name: 'Test Template'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt_template/i);
  });

  it('GET /api/templates lists all templates', async () => {
    await request.post('/api/templates').send(VALID_TEMPLATE);
    await request.post('/api/templates').send({
      ...VALID_TEMPLATE,
      name: 'Second Template'
    });
    const res = await request.get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/templates/:id returns a single template', async () => {
    const created = await request.post('/api/templates').send(VALID_TEMPLATE);
    const res = await request.get(`/api/templates/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(VALID_TEMPLATE.name);
  });

  it('GET /api/templates/:id returns 404 for missing template', async () => {
    const res = await request.get('/api/templates/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/templates/:id removes a template', async () => {
    const created = await request.post('/api/templates').send(VALID_TEMPLATE);
    const del = await request.delete(`/api/templates/${created.body.id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    // Verify it's gone
    const list = await request.get('/api/templates');
    expect(list.body).toHaveLength(0);
  });

  it('DELETE /api/templates/:id returns 404 for missing template', async () => {
    const res = await request.delete('/api/templates/nonexistent-id');
    expect(res.status).toBe(404);
  });

  // --- Generate ---

  it('POST /api/templates/:id/generate produces a Wan2GP JSON', async () => {
    // Create character
    const char = await request.post('/api/characters').send(VALID_CHARACTER);
    // Create template
    const tmpl = await request.post('/api/templates').send(VALID_TEMPLATE);

    const res = await request.post(`/api/templates/${tmpl.body.id}/generate`).send({
      character_id: char.body.id,
      location: 'Monaco harbour balcony',
      action: 'man gazes out then turns to camera'
    });

    expect(res.status).toBe(200);
    expect(res.body.generated_json).toBeDefined();
    expect(res.body.character_name).toBe('Mick Doohan');
    expect(res.body.template_name).toBe(VALID_TEMPLATE.name);

    const json = res.body.generated_json;

    // Prompt should contain the trigger word and location
    expect(json.prompt).toContain('mckdhn');
    expect(json.prompt).toContain('Monaco harbour balcony');
    expect(json.prompt).toContain('man gazes out then turns to camera');

    // Alt prompt should contain the full identity block
    expect(json.alt_prompt).toContain('fit healthy mid to late fifties male');

    // Negative prompt should include character negative + template additions
    expect(json.negative_prompt).toContain('young, feminine');
    expect(json.negative_prompt).toContain('jittery motion');

    // Settings: character proven settings override template defaults
    expect(json.guidance_scale).toBe(6.1);
    expect(json.guidance2_scale).toBe(3);
    expect(json.loras_multipliers).toBe('1.0;0.3');

    // Always iteration mode
    expect(json.video_length).toBe(32);
    expect(json.seed).toBe(-1);
  });

  it('POST /api/templates/:id/generate requires character_id', async () => {
    const tmpl = await request.post('/api/templates').send(VALID_TEMPLATE);
    const res = await request.post(`/api/templates/${tmpl.body.id}/generate`).send({
      location: 'Monaco'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/character_id/i);
  });

  it('POST /api/templates/:id/generate returns 404 for missing character', async () => {
    const tmpl = await request.post('/api/templates').send(VALID_TEMPLATE);
    const res = await request.post(`/api/templates/${tmpl.body.id}/generate`).send({
      character_id: 'nonexistent-id'
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/templates/:id/generate returns 404 for missing template', async () => {
    const char = await request.post('/api/characters').send(VALID_CHARACTER);
    const res = await request.post('/api/templates/nonexistent-id/generate').send({
      character_id: char.body.id
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/templates/:id/generate strips non-Wan2GP fields', async () => {
    const char = await request.post('/api/characters').send(VALID_CHARACTER);
    const tmpl = await request.post('/api/templates').send({
      ...VALID_TEMPLATE,
      default_settings: { ...VALID_TEMPLATE.default_settings, bogus_field: 'should be stripped' }
    });

    const res = await request.post(`/api/templates/${tmpl.body.id}/generate`).send({
      character_id: char.body.id,
      location: 'test'
    });

    expect(res.body.generated_json.bogus_field).toBeUndefined();
  });

  it('POST /api/templates/:id/generate condenses long identity blocks', async () => {
    const longIdentity = 'mckdhn, fit healthy mid to late fifties male. ' +
      'Strong jaw with prominent cheekbones. Weathered skin with fine lines around the eyes. ' +
      'Piercing blue eyes under heavy brows. Close-cropped grey hair thinning at the temples.';

    const char = await request.post('/api/characters').send({
      ...VALID_CHARACTER,
      locked_identity_block: longIdentity
    });

    const tmpl = await request.post('/api/templates').send(VALID_TEMPLATE);

    const res = await request.post(`/api/templates/${tmpl.body.id}/generate`).send({
      character_id: char.body.id,
      location: 'test'
    });

    // The condensed version should be the first sentence
    const placeholders = res.body.placeholders_used;
    expect(placeholders.identity_condensed).toBe('mckdhn, fit healthy mid to late fifties male.');
    // The full version should be complete
    expect(placeholders.identity_full).toBe(longIdentity);
  });
});

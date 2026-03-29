import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Characters API', () => {
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

  it('POST /api/characters creates a character', async () => {
    const res = await request.post('/api/characters').send({
      name: 'Mick Doohan', trigger_word: 'mckdhn',
      lora_files: ['mckdhn-v1-cloud-high.safetensors', 'mckdhn-v1-cloud-low.safetensors'],
      locked_identity_block: 'mckdhn, fit healthy mid to late fifties...',
      proven_settings: { guidance_scale: 6.1, loras_multipliers: '1.0;0.3 0.3;1.2' }
    });
    expect(res.status).toBe(201);
    expect(res.body.trigger_word).toBe('mckdhn');
  });

  it('GET /api/characters lists all characters', async () => {
    await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    await request.post('/api/characters').send({ name: 'Jack', trigger_word: 'jckdhn' });
    const res = await request.get('/api/characters');
    expect(res.body).toHaveLength(2);
  });

  it('PATCH /api/characters/:id updates character', async () => {
    const char = await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    const res = await request.patch(`/api/characters/${char.body.id}`).send({
      proven_settings: { guidance_scale: 6.2 }
    });
    expect(res.body.proven_settings.guidance_scale).toBe(6.2);
  });

  it('POST /api/characters/:id/promote-seed stores proven seed and provenance', async () => {
    const char = await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    const res = await request.post(`/api/characters/${char.body.id}/promote-seed`).send({
      seed: 767053159
    });
    expect(res.status).toBe(200);
    expect(res.body.promoted).toBe(true);
    expect(res.body.proven_seed).toBe(767053159);
    expect(res.body.character.proven_seed).toBe(767053159);
    expect(res.body.character.seed_promoted_at).toBeTruthy();
  });

  it('POST /api/characters/:id/promote-seed validates source iteration belongs to character clip', async () => {
    const char = await request.post('/api/characters').send({ name: 'Mick', trigger_word: 'mckdhn' });
    const otherChar = await request.post('/api/characters').send({ name: 'Jack', trigger_word: 'jckdhn' });

    const scene = await store.create('scenes', { project_id: 'p1', name: 'S1' });
    const clip = await store.create('clips', { scene_id: scene.id, name: 'C1', characters: [otherChar.body.trigger_word], status: 'in_progress' });
    const iter = await store.create('iterations', {
      clip_id: clip.id,
      iteration_number: 1,
      json_contents: { seed: 123456789, guidance_scale: 6.0 }
    });

    const res = await request.post(`/api/characters/${char.body.id}/promote-seed`).send({
      seed: 123456789,
      source_iteration_id: iter.id
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to a clip containing this character/);
  });
});

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
});

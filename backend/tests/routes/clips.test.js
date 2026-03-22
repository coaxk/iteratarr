import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Clips API', () => {
  let tmpDir, request, store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/clips creates a clip', async () => {
    const scene = await store.create('scenes', { name: 'S1', project_id: 'p1' });
    const res = await request.post('/api/clips').send({
      scene_id: scene.id, name: 'Clip 1e — Mick on Balcony',
      characters: ['mckdhn'], location: 'Monaco Balcony'
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('not_started');
  });

  it('GET /api/clips filters by status', async () => {
    const scene = await store.create('scenes', { name: 'S1', project_id: 'p1' });
    await request.post('/api/clips').send({ scene_id: scene.id, name: 'C1' });
    await store.create('clips', { scene_id: scene.id, name: 'C2', status: 'locked' });
    const res = await request.get('/api/clips?status=locked');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('C2');
  });

  it('PATCH /api/clips/:id updates clip', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    const res = await request.patch(`/api/clips/${clip.id}`).send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('GET /api/clips/:id/iterations returns iterations for clip', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C1', status: 'not_started' });
    await store.create('iterations', { clip_id: clip.id, iteration_number: 1 });
    await store.create('iterations', { clip_id: clip.id, iteration_number: 2 });
    const res = await request.get(`/api/clips/${clip.id}/iterations`);
    expect(res.body).toHaveLength(2);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Projects API', () => {
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

  it('POST /api/projects creates a project', async () => {
    const res = await request.post('/api/projects').send({ name: "Kebbin's Shop" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Kebbin's Shop");
  });

  it('GET /api/projects lists all projects', async () => {
    await request.post('/api/projects').send({ name: 'P1' });
    await request.post('/api/projects').send({ name: 'P2' });
    const res = await request.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /api/projects/:id returns project with scenes', async () => {
    const proj = await request.post('/api/projects').send({ name: 'P1' });
    const res = await request.get(`/api/projects/${proj.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('P1');
    expect(res.body.scenes).toEqual([]);
  });

  it('POST /api/projects/:id/scenes creates a scene', async () => {
    const proj = await request.post('/api/projects').send({ name: 'P1' });
    const res = await request.post(`/api/projects/${proj.body.id}/scenes`).send({
      name: 'Scene 01 — Saudi Arabia', episode: 1
    });
    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(proj.body.id);
  });
});

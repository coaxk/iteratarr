import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Branches API', () => {
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

  async function createClip(name = 'Clip 1e') {
    const scene = await store.create('scenes', { name: 'S1', project_id: 'p1' });
    return store.create('clips', { scene_id: scene.id, name, status: 'in_progress' });
  }

  it('POST creates a branch', async () => {
    const clip = await createClip();
    const res = await request.post(`/api/clips/${clip.id}/branches`).send({
      seed: 544083690, name: 'seed-544'
    });
    expect(res.status).toBe(201);
    expect(res.body.seed).toBe(544083690);
    expect(res.body.name).toBe('seed-544');
    expect(res.body.status).toBe('active');
    expect(res.body.clip_id).toBe(clip.id);
    expect(res.body.created_from).toBe('manual');
  });

  it('POST auto-generates name from seed', async () => {
    const clip = await createClip();
    const res = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 123456 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('seed-123456');
  });

  it('POST rejects duplicate seed on same clip', async () => {
    const clip = await createClip();
    await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const res = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('POST rejects missing seed', async () => {
    const clip = await createClip();
    const res = await request.post(`/api/clips/${clip.id}/branches`).send({ name: 'no-seed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/seed is required/);
  });

  it('GET lists branches for a clip', async () => {
    const clip = await createClip();
    await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 111 });
    await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 222 });
    await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 333 });

    const res = await request.get(`/api/clips/${clip.id}/branches`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('GET returns empty for clip with no branches', async () => {
    const clip = await createClip();
    const res = await request.get(`/api/clips/${clip.id}/branches`);
    expect(res.body).toHaveLength(0);
  });

  it('GET /:id includes iteration summary', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const branch = branchRes.body;

    // Create an iteration on this branch
    await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, seed_used: 544083690
    });

    const res = await request.get(`/api/clips/${clip.id}/branches/${branch.id}`);
    expect(res.status).toBe(200);
    expect(res.body.iteration_count).toBe(1);
  });

  it('PATCH updates branch status', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branchRes.body.id}`).send({ status: 'stalled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('stalled');
  });

  it('PATCH sets locked_at when status becomes locked', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branchRes.body.id}`).send({ status: 'locked' });
    expect(res.status).toBe(200);
    expect(res.body.locked_at).toBeTruthy();
  });

  it('PATCH rejects invalid status', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branchRes.body.id}`).send({ status: 'bogus' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid branch status/);
  });

  it('PATCH rejects branch from wrong clip', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const res = await request.patch(`/api/clips/wrong-clip-id/branches/${branchRes.body.id}`).send({ status: 'stalled' });
    expect(res.status).toBe(404);
  });

  it('DELETE removes empty branch', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });

    const res = await request.delete(`/api/clips/${clip.id}/branches/${branchRes.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await request.get(`/api/clips/${clip.id}/branches`);
    expect(listRes.body).toHaveLength(0);
  });

  it('DELETE rejects branch with iterations', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const branch = branchRes.body;

    // Add an iteration
    await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, seed_used: 544083690
    });

    const res = await request.delete(`/api/clips/${clip.id}/branches/${branch.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Cannot delete branch with/);
  });

  it('GET /api/branches/:id/iterations lists iterations for a branch', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const branch = branchRes.body;

    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 1 });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 2 });
    await store.create('iterations', { clip_id: clip.id, iteration_number: 3 }); // different branch

    const res = await request.get(`/api/branches/${branch.id}/iterations`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].iteration_number).toBe(1);
    expect(res.body[1].iteration_number).toBe(2);
  });
});

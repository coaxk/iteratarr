import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
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

  it('PATCH to locked purges frame files for branch iterations and preserves contact sheets', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const branch = branchRes.body;
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, seed_used: 544083690
    });

    const iterDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.webp'), 'frame');
    writeFileSync(join(iterDir, 'frame_002.png'), 'frame');
    writeFileSync(join(iterDir, 'contact_sheet_544083690.webp'), 'sheet');

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branch.id}`).send({ status: 'locked' });
    expect(res.status).toBe(200);
    expect(existsSync(join(iterDir, 'frame_001.webp'))).toBe(false);
    expect(existsSync(join(iterDir, 'frame_002.png'))).toBe(false);
    expect(existsSync(join(iterDir, 'contact_sheet_544083690.webp'))).toBe(true);
  });

  it('PATCH to stalled does not purge frame files', async () => {
    const clip = await createClip();
    const branchRes = await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 });
    const branch = branchRes.body;
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, seed_used: 544083690
    });

    const iterDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.webp'), 'frame');

    const res = await request.patch(`/api/clips/${clip.id}/branches/${branch.id}`).send({ status: 'stalled' });
    expect(res.status).toBe(200);
    expect(existsSync(join(iterDir, 'frame_001.webp'))).toBe(true);
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

  it('POST /api/clips/:clipId/fork creates a new branch from an iteration', async () => {
    const clip = await createClip();
    const branch = (await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 })).body;

    // Create source iteration with settings
    const sourceIter = await store.create('iterations', {
      clip_id: clip.id,
      branch_id: branch.id,
      iteration_number: 3,
      seed_used: 544083690,
      json_contents: { prompt: 'test prompt', seed: 544083690, guidance_scale: 6.1, video_length: 32 },
      render_path: '/tmp/some-render.mp4'
    });

    const res = await request.post(`/api/clips/${clip.id}/fork`).send({
      source_iteration_id: sourceIter.id,
      seed: 999888777
    });

    expect(res.status).toBe(201);
    expect(res.body.branch).toBeDefined();
    expect(res.body.branch.seed).toBe(999888777);
    expect(res.body.branch.created_from).toBe('fork');
    expect(res.body.branch.source_iteration_id).toBe(sourceIter.id);
    expect(res.body.branch.source_branch_id).toBe(branch.id);
    expect(res.body.iteration).toBeDefined();
    expect(res.body.iteration.iteration_number).toBe(1);
    expect(res.body.iteration.branch_id).toBe(res.body.branch.id);
    expect(res.body.iteration.json_contents.seed).toBe(999888777);
    expect(res.body.iteration.json_contents.prompt).toBe('test prompt');
    expect(res.body.iteration.change_from_parent).toMatch(/Forked from/);
  });

  it('POST /api/clips/:clipId/fork with same seed reuses source render path', async () => {
    const clip = await createClip();
    const branch = (await request.post(`/api/clips/${clip.id}/branches`).send({ seed: 544083690 })).body;

    const sourceIter = await store.create('iterations', {
      clip_id: clip.id,
      branch_id: branch.id,
      iteration_number: 5,
      seed_used: 544083690,
      json_contents: { prompt: 'test', seed: 544083690, video_length: 32 },
      render_path: '/tmp/original-render.mp4'
    });

    const res = await request.post(`/api/clips/${clip.id}/fork`).send({
      source_iteration_id: sourceIter.id
      // no seed override — uses source seed
    });

    expect(res.status).toBe(201);
    // Render path is now always unique per branch (includes branch name)
    expect(res.body.iteration.render_path).toContain('_iter_01.mp4');
    expect(res.body.iteration.render_path).not.toBe('/tmp/original-render.mp4');
  });

  it('POST /api/clips/:clipId/fork rejects missing source_iteration_id', async () => {
    const clip = await createClip();
    const res = await request.post(`/api/clips/${clip.id}/fork`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source_iteration_id/);
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

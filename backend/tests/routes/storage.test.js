import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Storage API — GET /api/storage', () => {
  let tmpDir;
  let request;
  let store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-storage-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero summary on empty dataset', async () => {
    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.summary.frames_bytes).toBe(0);
    expect(res.body.summary.contact_bytes).toBe(0);
    expect(res.body.summary.reclaimable_bytes).toBe(0);
    expect(res.body.stagnant).toEqual([]);
  });

  it('counts frame bytes excluding contact sheets', async () => {
    const clip = await store.create('clips', { name: 'Clip A', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 12345, status: 'active',
      name: 'test', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(1000));
    writeFileSync(join(frameDir, 'frame_002.webp'), Buffer.alloc(2000));
    writeFileSync(join(frameDir, 'contact_sheet_12345.webp'), Buffer.alloc(500));

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.summary.frames_bytes).toBe(3000);
  });

  it('does not include locked/abandoned branches in stagnant list', async () => {
    const clip = await store.create('clips', { name: 'Clip B', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 99999, status: 'locked',
      name: 'locked', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });
    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(1000));

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.stagnant).toHaveLength(0);
  });

  it('does not include keep_frames_forever branches in stagnant list', async () => {
    const clip = await store.create('clips', { name: 'Clip C', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 55555, status: 'active',
      keep_frames_forever: true,
      name: 'keep-it', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(1000));

    const res = await request.get('/api/storage');
    expect(res.status).toBe(200);
    expect(res.body.stagnant).toHaveLength(0);
  });
});

describe('Storage API — DELETE /api/storage/branch/:id/frames', () => {
  let tmpDir;
  let request;
  let store;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-storage-del-test-'));
    const testApp = createTestApp(tmpDir);
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes frame files and returns bytes reclaimed', async () => {
    const clip = await store.create('clips', { name: 'Clip D', scene_id: 's1', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', {
      clip_id: clip.id, seed: 77777, status: 'active',
      name: 'stagnant', created_from: 'manual', base_settings: {}
    });
    const iter = await store.create('iterations', {
      clip_id: clip.id, branch_id: branch.id, iteration_number: 1, status: 'rendered'
    });

    const frameDir = join(tmpDir, 'frames', iter.id);
    mkdirSync(frameDir, { recursive: true });
    writeFileSync(join(frameDir, 'frame_001.webp'), Buffer.alloc(5000));
    writeFileSync(join(frameDir, 'contact_sheet_77777.webp'), Buffer.alloc(1000));

    const res = await request.delete(`/api/storage/branch/${branch.id}/frames`);
    expect(res.status).toBe(200);
    expect(res.body.bytes_reclaimed).toBe(5000);
    expect(existsSync(join(frameDir, 'frame_001.webp'))).toBe(false);
    expect(existsSync(join(frameDir, 'contact_sheet_77777.webp'))).toBe(true);
  });

  it('returns 404 for unknown branch', async () => {
    const res = await request.delete('/api/storage/branch/nonexistent-id/frames');
    expect(res.status).toBe(404);
  });
});


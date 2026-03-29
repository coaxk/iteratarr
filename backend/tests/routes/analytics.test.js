import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Analytics API — /api/analytics/overview', () => {
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

  it('returns empty state when no data exists', async () => {
    const res = await request.get('/api/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.summary.clip_count).toBe(0);
    expect(res.body.summary.iteration_count).toBe(0);
    expect(res.body.summary.evaluated_count).toBe(0);
    expect(res.body.summary.locked_count).toBe(0);
    expect(res.body.summary.stalling_count).toBe(0);
    expect(res.body.clips).toEqual([]);
    expect(res.body.characters).toEqual([]);
    expect(res.body.ropes).toEqual([]);
    expect(res.body.score_distribution.buckets).toHaveLength(5);
    expect(res.body.score_distribution.median).toBeNull();
  });

  it('counts clips, iterations, and evaluations correctly', async () => {
    const clip1 = await store.create('clips', { scene_id: 's1', name: 'Clip A', characters: ['mckdhn'], status: 'in_progress' });
    const clip2 = await store.create('clips', { scene_id: 's1', name: 'Clip B', characters: ['mckdhn'], status: 'in_progress' });
    const branch1 = await store.create('branches', { clip_id: clip1.id, name: 'Branch 1', seed: 12345, status: 'active' });
    const eval1 = await store.create('evaluations', { scores: { grand_total: 55, identity: { total: 30 }, location: { total: 15 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 1, evaluation_id: eval1.id });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 2 });
    await store.create('iterations', { clip_id: clip2.id, branch_id: null, iteration_number: 1 });

    const res = await request.get('/api/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.summary.clip_count).toBe(2);
    expect(res.body.summary.iteration_count).toBe(3);
    expect(res.body.summary.evaluated_count).toBe(1);
    expect(res.body.summary.locked_count).toBe(0);
  });

  it('counts locked clips correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Locked Clip', characters: [], status: 'locked', locked_iteration_id: 'iter-123' });

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.locked_count).toBe(1);
    expect(res.body.clips[0].locked_iteration_id).toBe('iter-123');
    // Locked clips are never stalling
    expect(res.body.clips[0].stall).toBeNull();
  });

  it('detects plateau stall — best score unchanged in last 4 scored iters', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Plateau Clip', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B1', seed: 111, status: 'active' });

    // 5 scored iterations: best was set at iter 1 (score 60), iters 2–5 all score ≤ 60
    const scores = [60, 58, 57, 59, 57];
    for (let i = 0; i < scores.length; i++) {
      const ev = await store.create('evaluations', {
        scores: { grand_total: scores[i], identity: { total: 30 }, location: { total: 20 }, motion: { total: scores[i] - 50 } },
        attribution: { rope: 'rope_1_prompt_position' }
      });
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i + 1, evaluation_id: ev.id });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(1);
    expect(res.body.clips[0].stall).not.toBeNull();
    expect(res.body.clips[0].stall.type).toBe('plateau');
  });

  it('detects no-evals stall — 3+ active iters with zero evaluations', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'No Evals Clip', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B1', seed: 222, status: 'active' });
    for (let i = 1; i <= 4; i++) {
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(1);
    expect(res.body.clips[0].stall.type).toBe('no_evals');
  });

  it('excludes abandoned branches from stall detection', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Clip', characters: [], status: 'in_progress' });
    // Active branch: only 2 iters (not enough for stall)
    const activeBranch = await store.create('branches', { clip_id: clip.id, name: 'Active', seed: 333, status: 'active' });
    await store.create('iterations', { clip_id: clip.id, branch_id: activeBranch.id, iteration_number: 1 });
    await store.create('iterations', { clip_id: clip.id, branch_id: activeBranch.id, iteration_number: 2 });
    // Abandoned branch: 5 iters with no evals — should NOT trigger no-evals stall
    const deadBranch = await store.create('branches', { clip_id: clip.id, name: 'Dead', seed: 444, status: 'abandoned' });
    for (let i = 1; i <= 5; i++) {
      await store.create('iterations', { clip_id: clip.id, branch_id: deadBranch.id, iteration_number: i });
    }

    const res = await request.get('/api/analytics/overview');
    expect(res.body.summary.stalling_count).toBe(0);
    expect(res.body.clips[0].stall).toBeNull();
  });

  it('aggregates per-character data correctly', async () => {
    const clip1 = await store.create('clips', { scene_id: 's1', name: 'C1', characters: ['mckdhn'], status: 'in_progress' });
    const clip2 = await store.create('clips', { scene_id: 's1', name: 'C2', characters: ['mckdhn'], status: 'in_progress' });
    const branch1 = await store.create('branches', { clip_id: clip1.id, name: 'B1', seed: 1, status: 'active' });
    const branch2 = await store.create('branches', { clip_id: clip2.id, name: 'B2', seed: 2, status: 'active' });
    const ev1 = await store.create('evaluations', { scores: { grand_total: 50, identity: { total: 25 }, location: { total: 15 }, motion: { total: 10 } }, attribution: {} });
    const ev2 = await store.create('evaluations', { scores: { grand_total: 60, identity: { total: 30 }, location: { total: 20 }, motion: { total: 10 } }, attribution: {} });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 1, evaluation_id: ev1.id });
    await store.create('iterations', { clip_id: clip2.id, branch_id: branch2.id, iteration_number: 1, evaluation_id: ev2.id });

    const res = await request.get('/api/analytics/overview');
    const char = res.body.characters.find(c => c.name === 'mckdhn');
    expect(char).toBeDefined();
    expect(char.clip_count).toBe(2);
    expect(char.best_score).toBe(60);
    expect(char.avg_score).toBe(55);
  });

  it('aggregates rope effectiveness correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B', seed: 1, status: 'active' });
    const ev1 = await store.create('evaluations', { scores: { grand_total: 50, identity: { total: 25 }, location: { total: 15 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    const ev2 = await store.create('evaluations', { scores: { grand_total: 58, identity: { total: 30 }, location: { total: 18 }, motion: { total: 10 } }, attribution: { rope: 'rope_1_prompt_position' } });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 1, evaluation_id: ev1.id });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 2, evaluation_id: ev2.id });

    const res = await request.get('/api/analytics/overview');
    const rope = res.body.ropes.find(r => r.rope === 'rope_1_prompt_position');
    expect(rope).toBeDefined();
    expect(rope.count).toBe(1); // Only 1 consecutive pair
    expect(rope.avg_delta).toBe(8); // 58 - 50 = +8
    expect(rope.success_rate).toBe(100);
  });

  it('builds score distribution buckets correctly', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'C', characters: [], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'B', seed: 1, status: 'active' });
    // One score in each bucket: 10 (0-15), 20 (15-30), 40 (30-45), 50 (45-60), 70 (60-75)
    const scores = [10, 20, 40, 50, 70];
    for (let i = 0; i < scores.length; i++) {
      const ev = await store.create('evaluations', { scores: { grand_total: scores[i], identity: { total: 10 }, location: { total: 10 }, motion: { total: scores[i] - 20 } }, attribution: {} });
      await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: i + 1, evaluation_id: ev.id });
    }

    const res = await request.get('/api/analytics/overview');
    const dist = res.body.score_distribution;
    expect(dist.buckets[0].count).toBe(1); // 0–15: score 10
    expect(dist.buckets[1].count).toBe(1); // 15–30: score 20
    expect(dist.buckets[2].count).toBe(1); // 30–45: score 40
    expect(dist.buckets[3].count).toBe(1); // 45–60: score 50
    expect(dist.buckets[4].count).toBe(1); // 60–75: score 70
    expect(dist.median).toBe(40);
    expect(dist.high).toBe(70);
  });
});

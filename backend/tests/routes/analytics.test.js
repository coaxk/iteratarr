import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
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

describe('Analytics API — /api/analytics/seeds', () => {
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

  it('returns empty state when no seed data exists', async () => {
    const res = await request.get('/api/analytics/seeds');
    expect(res.status).toBe(200);
    expect(res.body.summary.seed_count).toBe(0);
    expect(res.body.summary.evaluated_seed_count).toBe(0);
    expect(res.body.summary.proven_seed_count).toBe(0);
    expect(res.body.summary.selected_seed_count).toBe(0);
    expect(res.body.seeds).toEqual([]);
  });

  it('aggregates per-seed performance across branches, clips, and screenings', async () => {
    const clip1 = await store.create('clips', { scene_id: 's1', name: 'Balcony', characters: ['mckdhn'], status: 'in_progress' });
    const clip2 = await store.create('clips', { scene_id: 's1', name: 'Monaco', characters: ['jack'], status: 'locked', locked_iteration_id: 'iter-locked' });

    const branch1 = await store.create('branches', { clip_id: clip1.id, name: 'Seed A', seed: 767053159, status: 'active' });
    const branch2 = await store.create('branches', { clip_id: clip2.id, name: 'Seed A Locked', seed: 767053159, status: 'locked' });
    await store.create('branches', { clip_id: clip1.id, name: 'Seed B', seed: 544083690, status: 'active' });

    const eval1 = await store.create('evaluations', { scores: { grand_total: 58 } });
    const eval2 = await store.create('evaluations', { scores: { grand_total: 67 } });
    const eval3 = await store.create('evaluations', { scores: { grand_total: 49 } });

    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 1, evaluation_id: eval1.id });
    await store.create('iterations', { clip_id: clip2.id, branch_id: branch2.id, iteration_number: 1, evaluation_id: eval2.id });
    await store.create('iterations', { clip_id: clip1.id, branch_id: branch1.id, iteration_number: 2, evaluation_id: eval3.id });

    await store.create('seed_screens', { clip_id: clip1.id, seed: 767053159, selected: true, rating: 4 });
    await store.create('seed_screens', { clip_id: clip1.id, seed: 544083690, selected: false, rating: 2 });

    const res = await request.get('/api/analytics/seeds');
    expect(res.status).toBe(200);
    expect(res.body.summary.seed_count).toBe(2);
    expect(res.body.summary.evaluated_seed_count).toBe(1);
    expect(res.body.summary.proven_seed_count).toBe(1);
    expect(res.body.summary.selected_seed_count).toBe(1);

    const topSeed = res.body.seeds.find(seed => seed.seed === 767053159);
    expect(topSeed).toBeDefined();
    expect(topSeed.branch_count).toBe(2);
    expect(topSeed.clip_count).toBe(2);
    expect(topSeed.character_names).toEqual(['jack', 'mckdhn']);
    expect(topSeed.iteration_count).toBe(3);
    expect(topSeed.evaluated_count).toBe(3);
    expect(topSeed.best_score).toBe(67);
    expect(topSeed.avg_score).toBe(58);
    expect(topSeed.selected_count).toBe(1);
    expect(topSeed.locked_count).toBe(1);
    expect(topSeed.screening_rating_avg).toBe(4);
    expect(topSeed.clips).toHaveLength(2);

    const secondSeed = res.body.seeds.find(seed => seed.seed === 544083690);
    expect(secondSeed.branch_count).toBe(1);
    expect(secondSeed.evaluated_count).toBe(0);
    expect(secondSeed.best_score).toBeNull();
    expect(secondSeed.screening_rating_avg).toBe(2);
  });

  it('includes seeds that exist only in screening data', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Baseline', characters: ['belinda'], status: 'screening' });
    await store.create('seed_screens', { clip_id: clip.id, seed: 123456789, selected: true, rating: 5 });

    const res = await request.get('/api/analytics/seeds');
    expect(res.status).toBe(200);
    expect(res.body.seeds).toHaveLength(1);
    expect(res.body.seeds[0].seed).toBe(123456789);
    expect(res.body.seeds[0].branch_count).toBe(0);
    expect(res.body.seeds[0].clip_count).toBe(1);
    expect(res.body.seeds[0].selected_count).toBe(1);
    expect(res.body.seeds[0].screening_rating_avg).toBe(5);
    expect(res.body.seeds[0].character_names).toEqual(['belinda']);
  });
});

describe('Analytics API — /api/analytics/clips/:clipId/seed-thumbnails', () => {
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

  it('returns batched seed thumbnails from screening and iteration sources', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Balcony', characters: ['mckdhn'], status: 'in_progress' });
    const screening = await store.create('seed_screens', { clip_id: clip.id, seed: 111111111, selected: false });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'seed-b', seed: 222222222, status: 'active' });
    const iteration = await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 1 });

    const screenFramesDir = join(tmpDir, 'frames', screening.id);
    const iterFramesDir = join(tmpDir, 'frames', iteration.id);
    mkdirSync(screenFramesDir, { recursive: true });
    mkdirSync(iterFramesDir, { recursive: true });
    writeFileSync(join(screenFramesDir, 'frame_001.webp'), 'fake');
    writeFileSync(join(iterFramesDir, 'frame_001.webp'), 'fake');

    const res = await request.get(`/api/analytics/clips/${clip.id}/seed-thumbnails`);
    expect(res.status).toBe(200);
    expect(res.body.clip_id).toBe(clip.id);
    expect(res.body.seeds).toHaveLength(2);

    const fromScreening = res.body.seeds.find(seed => seed.seed === 111111111);
    expect(fromScreening.thumbnail.source_type).toBe('screening');
    expect(fromScreening.thumbnail.url).toContain(`/api/frames/${screening.id}/`);

    const fromIteration = res.body.seeds.find(seed => seed.seed === 222222222);
    expect(fromIteration.thumbnail.source_type).toBe('iteration');
    expect(fromIteration.thumbnail.url).toContain(`/api/frames/${iteration.id}/`);
  });
});

describe('Analytics API — /api/analytics/seeds/:seed', () => {
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

  it('returns detailed drilldown for a known seed', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Balcony', characters: ['mckdhn'], status: 'in_progress' });
    const branch = await store.create('branches', { clip_id: clip.id, name: 'seed-a', seed: 767053159, status: 'active', created_from: 'screening' });

    const ev1 = await store.create('evaluations', {
      scores: { grand_total: 51, identity: { total: 25 }, location: { total: 16 }, motion: { total: 10 } },
      attribution: { rope: 'rope_2_attention_weighting', lowest_element: 'identity drift' },
      qualitative_notes: 'Looks younger than target and identity drift is visible.'
    });
    const ev2 = await store.create('evaluations', {
      scores: { grand_total: 60, identity: { total: 30 }, location: { total: 18 }, motion: { total: 12 } },
      attribution: { rope: 'rope_3_lora_multipliers', lowest_element: 'body' },
      qualitative_notes: 'Body looks heavier; accessories appear unexpectedly.'
    });

    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 1, evaluation_id: ev1.id });
    await store.create('iterations', { clip_id: clip.id, branch_id: branch.id, iteration_number: 2, evaluation_id: ev2.id });
    await store.create('seed_screens', { clip_id: clip.id, seed: 767053159, selected: true, rating: 4 });

    const res = await request.get('/api/analytics/seeds/767053159');
    expect(res.status).toBe(200);
    expect(res.body.seed).toBe(767053159);
    expect(res.body.summary.branch_count).toBe(1);
    expect(res.body.summary.clip_count).toBe(1);
    expect(res.body.summary.evaluated_count).toBe(2);
    expect(res.body.summary.best_score).toBe(60);
    expect(res.body.summary.avg_score).toBe(55.5);
    expect(res.body.clips).toHaveLength(1);
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.score_progression).toHaveLength(1);
    expect(res.body.screening.selected_count).toBe(1);
    expect(res.body.rope_effectiveness.length).toBeGreaterThan(0);
    expect(res.body.insights.trait_signals.length).toBeGreaterThan(0);
    expect(res.body.insights.stability.grand_stddev).not.toBeNull();
  });

  it('returns 404 for unknown seed', async () => {
    const res = await request.get('/api/analytics/seeds/123456');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid seed input', async () => {
    const res = await request.get('/api/analytics/seeds/not-a-number');
    expect(res.status).toBe(400);
  });

  it('includes latest stored personality profile in seed detail', async () => {
    const clip = await store.create('clips', { scene_id: 's1', name: 'Balcony', characters: ['mckdhn'], status: 'in_progress' });
    await store.create('branches', { clip_id: clip.id, name: 'seed-a', seed: 767053159, status: 'active' });

    const older = await store.create('seed_personality_profiles', {
      seed: 767053159,
      analyzed_at: '2026-03-30T00:00:00.000Z',
      sample_count: 3,
      trait_signals: []
    });
    const latest = await store.create('seed_personality_profiles', {
      seed: 767053159,
      analyzed_at: '2026-03-30T01:00:00.000Z',
      sample_count: 6,
      trait_signals: [{ key: 'identity_drift', label: 'Identity drift tendency', count: 2, prevalence: 33, confidence: 'medium' }]
    });

    const res = await request.get('/api/analytics/seeds/767053159');
    expect(res.status).toBe(200);
    expect(res.body.personality_profile).toBeDefined();
    expect(res.body.personality_profile.id).toBe(latest.id);
    expect(res.body.personality_profile.id).not.toBe(older.id);
    expect(res.body.personality_profile.sample_count).toBe(6);
  });
});

describe('Analytics API — /api/analytics/seeds/:seed/personality-profile', () => {
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

  it('returns cached profile without calling Vision when profile already exists', async () => {
    const profile = await store.create('seed_personality_profiles', {
      seed: 544083690,
      analyzed_at: '2026-03-30T02:00:00.000Z',
      sample_count: 4,
      trait_signals: []
    });

    const res = await request.post('/api/analytics/seeds/544083690/personality-profile').send({ force: false });
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.profile.id).toBe(profile.id);
    expect(res.body.seed).toBe(544083690);
  });

  it('returns 503 when Vision API is unavailable and no cached profile exists', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const clip = await store.create('clips', { scene_id: 's1', name: 'Balcony', characters: ['mckdhn'], status: 'in_progress' });
    await store.create('branches', { clip_id: clip.id, name: 'seed-a', seed: 767053159, status: 'active' });

    const res = await request.post('/api/analytics/seeds/767053159/personality-profile').send({ force: true });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Vision API unavailable/i);

    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('returns 404 status when no profile job and no profile exist', async () => {
    const res = await request.get('/api/analytics/seeds/987654321/personality-profile/status');
    expect(res.status).toBe(404);
  });
});

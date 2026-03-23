import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createTestApp } from '../helpers.js';

describe('Seed Screening API', () => {
  let tmpDir, request, store, projectBaseDir;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-seedscreen-'));
    projectBaseDir = join(tmpDir, 'project');
    const testApp = createTestApp(tmpDir, {
      score_lock_threshold: 65,
      iteration_frame_count: 32,
      production_frame_count: 81,
      iteration_save_dir: join(tmpDir, 'iter-save'),
      project_base_dir: projectBaseDir,
      wan2gp_output_dir: join(tmpDir, 'outputs'),
      wan2gp_json_dir: join(tmpDir, 'wan2gp')
    });
    request = supertest(testApp.app);
    store = testApp.store;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseJson = {
    prompt: 'mckdhn, standing on balcony overlooking Monaco',
    guidance_scale: 6.1,
    guidance2_scale: 4,
    loras_multipliers: '1.0;0.3 0.3;1.2',
    video_length: 81,
    seed: 999999
  };

  async function createClipWithScene() {
    const project = await store.create('projects', { name: 'Test Project' });
    const scene = await store.create('scenes', { name: 'Monaco Scene', project_id: project.id, episode: 1 });
    const clip = await store.create('clips', {
      scene_id: scene.id,
      name: 'Clip 1a - Balcony',
      characters: ['mckdhn'],
      location: 'Monaco Balcony',
      status: 'not_started'
    });
    return { project, scene, clip };
  }

  describe('POST /api/clips/:clipId/seed-screen', () => {
    it('generates screening JSONs with random seeds', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        count: 4
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(4);
      expect(res.body[0]).toHaveProperty('seed');
      expect(res.body[0]).toHaveProperty('json_path');
      expect(res.body[0]).toHaveProperty('render_path');

      // Verify JSON file was created
      expect(existsSync(res.body[0].json_path)).toBe(true);

      // Verify seed was set in the JSON
      const jsonContent = JSON.parse(readFileSync(res.body[0].json_path, 'utf-8'));
      expect(jsonContent.seed).toBe(res.body[0].seed);
      expect(jsonContent.video_length).toBe(32); // iteration frame count, not original 81
    });

    it('generates screening JSONs with manual seeds', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        seeds: [111111, 222222, 333333]
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveLength(3);
      expect(res.body.map(r => r.seed)).toEqual([111111, 222222, 333333]);
    });

    it('strips junk fields from generated JSONs', async () => {
      const { clip } = await createClipWithScene();
      const dirtyJson = { ...baseJson, junk_field: 'should be removed', another_junk: 42 };

      const res = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: dirtyJson,
        count: 1
      });

      expect(res.status).toBe(201);
      const jsonContent = JSON.parse(readFileSync(res.body[0].json_path, 'utf-8'));
      expect(jsonContent).not.toHaveProperty('junk_field');
      expect(jsonContent).not.toHaveProperty('another_junk');
      expect(jsonContent).toHaveProperty('prompt');
    });

    it('updates clip status to screening', async () => {
      const { clip } = await createClipWithScene();

      await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        count: 2
      });

      const updatedClip = await store.get('clips', clip.id);
      expect(updatedClip.status).toBe('screening');
    });

    it('rejects when base_json is missing', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        count: 4
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('base_json');
    });

    it('limits seeds to 12 maximum', async () => {
      const { clip } = await createClipWithScene();
      const manySeeds = Array.from({ length: 20 }, (_, i) => 100000 + i);

      const res = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        seeds: manySeeds
      });

      expect(res.status).toBe(201);
      expect(res.body.length).toBeLessThanOrEqual(12);
    });

    it('returns 404 for non-existent clip', async () => {
      const res = await request.post('/api/clips/nonexistent-id/seed-screen').send({
        base_json: baseJson,
        count: 2
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/clips/:clipId/seed-screen', () => {
    it('returns seed screen records sorted by seed', async () => {
      const { clip } = await createClipWithScene();

      // Generate screening with specific seeds
      await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        seeds: [999999, 111111, 555555]
      });

      const res = await request.get(`/api/clips/${clip.id}/seed-screen`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      // Sorted by seed
      expect(res.body[0].seed).toBe(111111);
      expect(res.body[1].seed).toBe(555555);
      expect(res.body[2].seed).toBe(999999);
    });

    it('returns empty array for clip with no screening', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.get(`/api/clips/${clip.id}/seed-screen`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('PATCH /api/clips/:clipId/seed-screen/:screenId', () => {
    it('updates rating on a seed screen record', async () => {
      const { clip } = await createClipWithScene();

      const genRes = await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        count: 1
      });

      const screenId = genRes.body[0].id;
      const res = await request.patch(`/api/clips/${clip.id}/seed-screen/${screenId}`).send({
        rating: 4
      });

      expect(res.status).toBe(200);
      expect(res.body.rating).toBe(4);
    });
  });

  describe('POST /api/clips/:clipId/select-seed', () => {
    it('creates iter_01 from selected seed and transitions clip to in_progress', async () => {
      const { clip } = await createClipWithScene();

      // Generate screening
      await request.post(`/api/clips/${clip.id}/seed-screen`).send({
        base_json: baseJson,
        seeds: [544083690, 123456789]
      });

      // Select a seed
      const res = await request.post(`/api/clips/${clip.id}/select-seed`).send({
        seed: 544083690,
        rating: 5
      });

      expect(res.status).toBe(201);
      expect(res.body.iteration_number).toBe(1);
      expect(res.body.seed_used).toBe(544083690);
      expect(res.body.change_from_parent).toBe('Selected from seed screening');
      expect(res.body.json_contents.seed).toBe(544083690);
      expect(res.body.json_contents.video_length).toBe(32);

      // Verify iter_01 JSON was written to disk
      expect(existsSync(res.body.json_path)).toBe(true);

      // Verify clip status is now in_progress
      const updatedClip = await store.get('clips', clip.id);
      expect(updatedClip.status).toBe('in_progress');

      // Verify the selected seed screen record was marked
      const screens = await store.list('seed_screens', r => r.clip_id === clip.id && r.seed === 544083690);
      expect(screens[0].selected).toBe(true);
      expect(screens[0].rating).toBe(5);
    });

    it('rejects when seed is missing', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.post(`/api/clips/${clip.id}/select-seed`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('seed');
    });

    it('rejects when seed is not a number', async () => {
      const { clip } = await createClipWithScene();

      const res = await request.post(`/api/clips/${clip.id}/select-seed`).send({
        seed: 'not-a-number'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('number');
    });
  });
});

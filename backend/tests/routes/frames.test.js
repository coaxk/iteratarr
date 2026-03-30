import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import supertest from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import express from 'express';
import { createFrameRoutes } from '../../routes/frames.js';
import { createStore } from '../../store/index.js';

function createFrameTestApp(dataDir, store) {
  const app = express();
  app.use(express.json());
  app.use('/api/frames', createFrameRoutes(dataDir, store));
  return app;
}

describe('Frames API — WebP output', () => {
  let tmpDir;
  let request;
  let store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-frames-test-'));
    store = createStore(tmpDir);
    request = supertest(createFrameTestApp(tmpDir, store));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /:iteration_id returns empty frames array when no files exist', async () => {
    const res = await request.get('/api/frames/test-iter-001');
    expect(res.status).toBe(200);
    expect(res.body.frames).toEqual([]);
  });

  it('GET /:iteration_id lists only .webp frames (not .png)', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.webp'), 'fake-webp-data');
    writeFileSync(join(iterDir, 'frame_002.webp'), 'fake-webp-data');
    writeFileSync(join(iterDir, 'frame_003.png'), 'old-png-data');

    const res = await request.get('/api/frames/test-iter-001');
    expect(res.status).toBe(200);
    expect(res.body.frames).toEqual(['frame_001.webp', 'frame_002.webp']);
    expect(res.body.frames).not.toContain('frame_003.png');
  });

  it('GET /:iteration_id/:filename rejects .png filenames', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.png'), 'png-data');

    const res = await request.get('/api/frames/test-iter-001/frame_001.png');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid frame filename/i);
  });

  it('GET /:iteration_id/:filename accepts .webp filenames', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-001');
    mkdirSync(iterDir, { recursive: true });
    const minimalWebP = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4C,
      0x17, 0x00, 0x00, 0x00, 0x2F, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);
    writeFileSync(join(iterDir, 'frame_001.webp'), minimalWebP);

    const res = await request.get('/api/frames/test-iter-001/frame_001.webp');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
  });

  it('DELETE /:iteration_id removes the frame directory', async () => {
    const iterDir = join(tmpDir, 'frames', 'test-iter-del');
    mkdirSync(iterDir, { recursive: true });
    writeFileSync(join(iterDir, 'frame_001.webp'), 'data');

    const res = await request.delete('/api/frames/test-iter-del');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(existsSync(iterDir)).toBe(false);
  });
});

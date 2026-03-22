import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStore } from '../store/index.js';

describe('JSON File Store', () => {
  let tmpDir;
  let store;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-test-'));
    store = createStore(tmpDir);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and retrieves a record', async () => {
    const record = await store.create('projects', { name: 'Test Project' });
    expect(record.id).toBeDefined();
    expect(record.name).toBe('Test Project');
    expect(record.created_at).toBeDefined();

    const fetched = await store.get('projects', record.id);
    expect(fetched.name).toBe('Test Project');
  });

  it('lists all records in a collection', async () => {
    await store.create('projects', { name: 'A' });
    await store.create('projects', { name: 'B' });
    const all = await store.list('projects');
    expect(all).toHaveLength(2);
  });

  it('updates a record', async () => {
    const record = await store.create('clips', { name: 'Clip 1', status: 'not_started' });
    const updated = await store.update('clips', record.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.name).toBe('Clip 1');
    expect(updated.updated_at).toBeDefined();
  });

  it('filters records by predicate', async () => {
    await store.create('clips', { scene_id: 's1', status: 'locked' });
    await store.create('clips', { scene_id: 's1', status: 'not_started' });
    await store.create('clips', { scene_id: 's2', status: 'locked' });
    const filtered = await store.list('clips', (c) => c.scene_id === 's1');
    expect(filtered).toHaveLength(2);
  });

  it('throws on get for non-existent record', async () => {
    await expect(store.get('projects', 'nonexistent')).rejects.toThrow();
  });
});

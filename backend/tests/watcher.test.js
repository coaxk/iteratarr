import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWatcher } from '../watcher.js';

describe('File Watcher', () => {
  let tmpDir, watchDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'iteratarr-watch-'));
    watchDir = join(tmpDir, 'watch');
    mkdirSync(watchDir, { recursive: true });
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('detects new JSON files and calls callback', async () => {
    const detected = [];
    const watcher = createWatcher([watchDir], (filePath, contents) => {
      detected.push({ filePath, contents });
    });

    await watcher.start();

    // Write a JSON file into watched dir
    const testJson = { prompt: 'test', seed: 42 };
    writeFileSync(join(watchDir, 'test_001.json'), JSON.stringify(testJson));

    // Wait for watcher to pick it up
    await new Promise(resolve => setTimeout(resolve, 2000));

    await watcher.stop();

    expect(detected.length).toBeGreaterThanOrEqual(1);
    expect(detected[0].contents.seed).toBe(42);
  });

  it('ignores non-JSON files', async () => {
    const detected = [];
    const watcher = createWatcher([watchDir], (filePath, contents) => {
      detected.push({ filePath, contents });
    });

    await watcher.start();
    writeFileSync(join(watchDir, 'test.txt'), 'not json');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await watcher.stop();

    expect(detected).toHaveLength(0);
  });
});

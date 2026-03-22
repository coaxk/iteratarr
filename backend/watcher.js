import chokidar from 'chokidar';
import { readFile } from 'fs/promises';
import { extname } from 'path';

export function createWatcher(directories, onNewJson) {
  let watcher = null;

  return {
    async start() {
      const validDirs = directories.filter(Boolean);
      if (validDirs.length === 0) return;

      watcher = chokidar.watch(validDirs, {
        ignoreInitial: true,
        depth: 1,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
      });

      // Wait for watcher to be ready before returning
      await new Promise((resolve) => {
        watcher.on('ready', resolve);
      });

      watcher.on('add', async (filePath) => {
        if (extname(filePath).toLowerCase() !== '.json') return;
        try {
          const raw = await readFile(filePath, 'utf-8');
          const contents = JSON.parse(raw);
          onNewJson(filePath, contents);
        } catch (err) {
          console.error(`Watcher: failed to parse ${filePath}:`, err.message);
        }
      });
    },

    async stop() {
      if (watcher) await watcher.close();
    }
  };
}

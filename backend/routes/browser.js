import { Router } from 'express';
import { readdir, stat } from 'fs/promises';
import { join, resolve, dirname, extname, relative } from 'path';

/**
 * File browser API for Iteratarr.
 * Lists directory contents within configured allowed root paths.
 *
 * Security: Only serves entries under whitelisted base directories.
 * Rejects any path containing ".." segments to prevent traversal.
 */

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.json', '.png', '.safetensors']);

/**
 * Validates that the given path is within one of the allowed root directories.
 * Returns the resolved path if valid, throws if not.
 */
function validatePath(requestedPath, allowedRoots) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new Error('path parameter is required');
  }

  // Block ".." segments before resolving — defense in depth
  const segments = requestedPath.replace(/\\/g, '/').split('/');
  if (segments.includes('..')) {
    throw new Error('Path must not contain ".." segments');
  }

  const resolved = resolve(requestedPath);

  for (const root of allowedRoots) {
    const resolvedRoot = resolve(root);
    const rel = relative(resolvedRoot, resolved);
    // rel must not start with ".." and must not be absolute (different drive on Windows)
    if (!rel.startsWith('..') && !resolve(resolvedRoot, rel).includes('\0') && resolved.startsWith(resolvedRoot)) {
      return resolved;
    }
  }

  throw new Error('Path is outside allowed directories');
}

export function createBrowserRoutes(config) {
  const router = Router();

  // Build the whitelist of allowed root paths from config
  const allowedRoots = [
    config.iteration_save_dir,
    config.project_base_dir,
    config.production_lock_dir,
    config.production_queue_dir,
    config.wan2gp_lora_dir,
    config.wan2gp_output_dir,
  ].filter(Boolean);

  router.get('/', async (req, res) => {
    try {
      const requestedPath = req.query.path || config.project_base_dir || config.iteration_save_dir;

      const validPath = validatePath(requestedPath, allowedRoots);

      // Verify it's a directory
      const pathStat = await stat(validPath);
      if (!pathStat.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }

      const rawEntries = await readdir(validPath, { withFileTypes: true });

      const entries = [];
      for (const entry of rawEntries) {
        if (entry.isDirectory()) {
          entries.push({ name: entry.name, type: 'directory' });
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext)) {
            try {
              const fileStat = await stat(join(validPath, entry.name));
              entries.push({
                name: entry.name,
                type: 'file',
                size: fileStat.size,
                modified: fileStat.mtime.toISOString()
              });
            } catch {
              // Skip files we can't stat
            }
          }
        }
      }

      // Sort: directories first, then files by modified date (newest first)
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        if (a.type === 'file' && a.modified && b.modified) {
          return new Date(b.modified) - new Date(a.modified);
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      // Compute parent path (null if at an allowed root)
      const parentDir = dirname(validPath);
      let parent = null;
      try {
        validatePath(parentDir, allowedRoots);
        parent = parentDir;
      } catch {
        // Parent is outside allowed roots — no navigation up
      }

      res.json({
        path: validPath,
        parent,
        entries
      });
    } catch (err) {
      const status = err.message.includes('outside allowed') || err.message.includes('".."') ? 403 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}

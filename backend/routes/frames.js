import { Router } from 'express';
import { mkdir, readdir, stat } from 'fs/promises';
import { join, resolve, basename, extname } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

// Point fluent-ffmpeg at the bundled binaries
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Frame extraction routes for Iteratarr.
 * Extracts evenly-spaced WebP frames from rendered MP4 videos so they
 * can be displayed inline in the evaluation panel.
 *
 * Frames are stored under: backend/data/frames/{iteration_id}/frame_001.webp
 */
export function createFrameRoutes(dataDir, store = null) {
  const router = Router();
  const framesRoot = resolve(dataDir, 'frames');

  // --- Helpers ---

  /** Validate that a path doesn't escape boundaries and ends in .mp4 */
  function validateVideoPath(videoPath) {
    if (!videoPath || typeof videoPath !== 'string') {
      throw new Error('video_path is required and must be a string');
    }
    // Block directory traversal
    if (videoPath.includes('..')) {
      throw new Error('video_path must not contain ".."');
    }
    // Must be an mp4 file
    if (extname(videoPath).toLowerCase() !== '.mp4') {
      throw new Error('video_path must point to an .mp4 file');
    }
    return videoPath;
  }

  /** Validate iteration_id is safe for use as a directory name */
  function validateIterationId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('iteration_id is required');
    }
    // UUIDs and simple alphanumeric-dash strings only
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('iteration_id contains invalid characters');
    }
    return id;
  }

  /** Validate filename is safe (no path traversal) */
  function validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new Error('filename is required');
    }
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    if (!/^(frame_\d{3}\.(webp|png)|contact_sheet_[a-zA-Z0-9_\-]+\.(webp|png))$/.test(filename)) {
      throw new Error('Invalid frame filename format');
    }
    return filename;
  }

  /** Get video duration in seconds using ffprobe */
  function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(new Error(`Cannot read video: ${err.message}`));
        const duration = metadata?.format?.duration;
        if (!duration || duration <= 0) {
          return reject(new Error('Video has no duration or is empty'));
        }
        resolve(parseFloat(duration));
      });
    });
  }

  /** Extract a single frame at a given timestamp */
  function extractFrame(videoPath, timestamp, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .output(outputPath)
        .outputOptions(['-vcodec', 'libwebp', '-quality', '85'])
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Frame extraction failed: ${err.message}`)))
        .run();
    });
  }

  // --- Routes ---

  /**
   * POST /api/frames/extract
   * Body: { video_path: string, iteration_id: string, count?: number }
   * Extracts evenly-spaced frames from a video file.
   */
  router.post('/extract', async (req, res) => {
    try {
      const videoPath = validateVideoPath(req.body.video_path);
      const iterationId = validateIterationId(req.body.iteration_id);
      const count = Math.min(Math.max(parseInt(req.body.count) || 4, 1), 32);

      // Verify the video file exists
      try {
        await stat(videoPath);
      } catch {
        return res.status(400).json({ error: `Video file not found: ${videoPath}` });
      }

      // Get duration to compute evenly-spaced timestamps
      const duration = await getVideoDuration(videoPath);

      // Create output directory
      const outDir = join(framesRoot, iterationId);
      await mkdir(outDir, { recursive: true });

      // Compute timestamps: evenly spaced, avoiding exact 0 and end
      const timestamps = [];
      for (let i = 0; i < count; i++) {
        const t = (duration * (i + 0.5)) / count;
        timestamps.push(t);
      }

      // Extract all frames
      const frames = [];
      for (let i = 0; i < timestamps.length; i++) {
        const filename = `frame_${String(i + 1).padStart(3, '0')}.webp`;
        const outputPath = join(outDir, filename);
        await extractFrame(videoPath, timestamps[i], outputPath);
        frames.push(filename);
      }

      const response = { frames, iteration_id: iterationId, frames_dir: outDir };

      // Full extraction (32 frames) marks the iteration as fully extracted.
      if (store && count >= 32) {
        try {
          await store.update('iterations', iterationId, {
            frames_extracted: true,
            frames_extracted_at: new Date().toISOString()
          });
          response.frames_extracted = true;
        } catch {
          // Iteration may not exist (e.g. seed screen frames). Ignore.
        }
      }

      res.json(response);
    } catch (err) {
      console.error('[Frames] Extraction error:', err.message);
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/frames/:iteration_id
   * Lists available frames for an iteration.
   */
  router.get('/:iteration_id', async (req, res) => {
    try {
      const iterationId = validateIterationId(req.params.iteration_id);
      const dir = join(framesRoot, iterationId);

      let files;
      try {
        files = await readdir(dir);
      } catch {
        return res.json({ frames: [] });
      }

      const frames = files
        .filter(f => /^frame_\d{3}\.(webp|png)$/.test(f))
        .sort();

      // Check for existing contact sheet
      const csFile = files.find(f => f.startsWith('contact_sheet'));
      const contact_sheet = csFile ? { filename: csFile, path: join(dir, csFile) } : null;

      res.json({ frames, frames_dir: frames.length > 0 ? dir : null, contact_sheet });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * DELETE /api/frames/:iteration_id
   * Removes all extracted frames for an iteration.
   */
  router.delete('/:iteration_id', async (req, res) => {
    try {
      const iterationId = validateIterationId(req.params.iteration_id);
      const dir = join(framesRoot, iterationId);
      const { rm } = await import('fs/promises');
      await rm(dir, { recursive: true, force: true });
      res.json({ deleted: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/frames/:iteration_id/:filename
   * Serves an individual frame WebP.
   */
  router.get('/:iteration_id/:filename', async (req, res) => {
    try {
      const iterationId = validateIterationId(req.params.iteration_id);
      const filename = validateFilename(req.params.filename);
      const filePath = join(framesRoot, iterationId, filename);

      // Verify the resolved path is still within framesRoot
      const resolved = resolve(filePath);
      if (!resolved.startsWith(resolve(framesRoot))) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.setHeader('Content-Type', filename.endsWith('.png') ? 'image/png' : 'image/webp');
      res.sendFile(resolved);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

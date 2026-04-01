import { Router } from 'express';
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';

/**
 * Contact Sheet API — stitches extracted frames into a single grid image.
 * Saves to a contactsheets/ directory and returns the path + serves the image.
 */
export function createContactSheetRoutes(config) {
  const router = Router();
  const sheetsDir = join(config.iteratarr_data_dir || '.', 'contactsheets');

  /**
   * POST /api/contactsheet
   * Body: {
   *   frame_paths: string[],      — full paths to frame PNGs (or)
   *   frame_id: string,           — iteration/seed_screen ID to pull frames from
   *   filename: string,           — output filename (optional, auto-generated)
   *   metadata: {                 — optional metadata strip
   *     seed: number,
   *     score: number,
   *     rope: string,
   *     clip_name: string,
   *     iteration_number: number
   *   }
   * }
   */
  router.post('/', async (req, res) => {
    try {
      const { frame_paths, frame_id, filename, metadata } = req.body;

      // Resolve frame paths — either provided directly or from frames API
      let framePaths = [];
      if (frame_paths && Array.isArray(frame_paths) && frame_paths.length > 0) {
        framePaths = frame_paths;
      } else if (frame_id) {
        const framesDir = join(config.iteratarr_data_dir || '.', 'frames', frame_id);
        if (existsSync(framesDir)) {
          const { readdirSync, statSync } = await import('fs');
          const files = readdirSync(framesDir);
          // Dedup: prefer WebP over PNG for same frame number, skip corrupted files (<1KB).
          // If ANY WebP frames exist, only use WebP — prevents legacy PNG full-extractions
          // from inflating a preview-only set.
          const byNumber = {};
          for (const f of files) {
            const m = f.match(/^frame_(\d{3})\.(webp|png)$/i);
            if (!m) continue;
            const [, num, ext] = m;
            if (!byNumber[num] || ext.toLowerCase() === 'webp') byNumber[num] = f;
          }
          const hasWebp = Object.values(byNumber).some(f => f.toLowerCase().endsWith('.webp'));
          framePaths = Object.values(byNumber).sort()
            .filter(f => {
              if (hasWebp && !f.toLowerCase().endsWith('.webp')) return false;
              try { return statSync(join(framesDir, f)).size >= 1024; } catch { return false; }
            })
            .map(f => join(framesDir, f));
        }
      }

      if (framePaths.length === 0) {
        return res.status(400).json({ error: 'No frames found. Provide frame_paths array or frame_id.' });
      }

      // Read all frame images
      const frameBuffers = [];
      for (const fp of framePaths) {
        if (!existsSync(fp)) continue;
        frameBuffers.push(await readFile(fp));
      }

      if (frameBuffers.length === 0) {
        return res.status(400).json({ error: 'No valid frame files found on disk.' });
      }

      // Determine grid layout
      const count = frameBuffers.length;
      let cols, rows;
      if (count <= 4) { cols = 2; rows = 2; }
      else if (count <= 6) { cols = 3; rows = 2; }
      else if (count <= 9) { cols = 3; rows = 3; }
      else { cols = 4; rows = Math.ceil(count / 4); }

      // Get dimensions from first frame
      const firstMeta = await sharp(frameBuffers[0], { limitInputPixels: false }).metadata();
      const cellW = firstMeta.width;
      const cellH = firstMeta.height;
      const gap = 3;
      const metaStripH = metadata ? 36 : 0;

      const canvasW = cols * cellW + (cols - 1) * gap;
      const canvasH = rows * cellH + (rows - 1) * gap + metaStripH;

      // Build composite operations
      const composites = [];

      // Metadata strip at top
      if (metadata) {
        const metaText = [
          metadata.clip_name && `Clip: ${metadata.clip_name}`,
          metadata.iteration_number && `Iter #${metadata.iteration_number}`,
          metadata.seed && `Seed: ${metadata.seed}`,
          metadata.score && `Score: ${metadata.score}/75`,
          metadata.rope && `Rope: ${metadata.rope}`
        ].filter(Boolean).join('  |  ');

        const metaSvg = `<svg width="${canvasW}" height="${metaStripH}">
          <rect width="${canvasW}" height="${metaStripH}" fill="#1a1a1a"/>
          <text x="8" y="24" font-family="monospace" font-size="14" fill="#d97706">${metaText}</text>
        </svg>`;
        composites.push({ input: Buffer.from(metaSvg), top: 0, left: 0 });
      }

      // Place frames in grid
      for (let i = 0; i < frameBuffers.length && i < cols * rows; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellW + gap);
        const y = metaStripH + row * (cellH + gap);

        // Resize frame to match cell dimensions
        const resized = await sharp(frameBuffers[i], { limitInputPixels: false })
          .resize(cellW, cellH, { fit: 'cover' })
          .toBuffer();

        composites.push({ input: resized, top: y, left: x });

        // Frame number label
        const labelSvg = `<svg width="32" height="20">
          <rect width="32" height="20" rx="3" fill="rgba(0,0,0,0.7)"/>
          <text x="16" y="15" font-family="monospace" font-size="12" fill="white" text-anchor="middle">${i + 1}</text>
        </svg>`;
        composites.push({
          input: Buffer.from(labelSvg),
          top: y + cellH - 24,
          left: x + 4
        });
      }

      // Create the composite image
      const result = await sharp({
        limitInputPixels: false,
        create: {
          width: canvasW,
          height: canvasH,
          channels: 3,
          background: { r: 0, g: 0, b: 0 }
        }
      })
        .composite(composites)
        .webp({ quality: 90 })
        .toBuffer();

      // Save alongside frames (same directory) so they're grouped in explorer
      let saveDir = sheetsDir;
      if (frame_id) {
        const framesDir = join(config.iteratarr_data_dir || '.', 'frames', frame_id);
        if (existsSync(framesDir)) {
          saveDir = framesDir;
        }
      }
      await mkdir(saveDir, { recursive: true });
      const outFilename = filename || `contact_sheet_${metadata?.seed || frame_id || 'manual'}.webp`;
      const outPath = join(saveDir, outFilename);
      // Also save to central sheets dir for the serving endpoint
      await mkdir(sheetsDir, { recursive: true });
      await writeFile(join(sheetsDir, outFilename), result);
      await writeFile(outPath, result);

      res.json({
        path: outPath,
        filename: outFilename,
        size: result.length,
        grid: `${cols}x${rows}`,
        frame_count: Math.min(frameBuffers.length, cols * rows)
      });
    } catch (err) {
      console.error('[ContactSheet] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/contactsheet/:filename — serve a contact sheet image
   */
  router.get('/:filename', async (req, res) => {
    const filePath = join(sheetsDir, req.params.filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Contact sheet not found' });
    }
    res.sendFile(resolve(filePath));
  });

  return router;
}

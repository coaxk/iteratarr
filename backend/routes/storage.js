import { Router } from 'express';
import { existsSync } from 'fs';
import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';

function frameFileRegex() {
  return /^frame_\d{3}\.(webp|png|jpg|jpeg)$/i;
}

function contactSheetRegex() {
  return /^contact_sheet.*\.(webp|png|jpg|jpeg)$/i;
}

function daysBetween(isoDate) {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function createStorageRoutes(store, config = {}) {
  const router = Router();
  const framesRoot = join(config.iteratarr_data_dir || '.', 'frames');
  const contactsheetsRoot = join(config.iteratarr_data_dir || '.', 'contactsheets');
  const autoPurgeDays = Number(config.auto_purge_days) || null;

  async function scanIterationStorage(iterationId) {
    const dir = join(framesRoot, iterationId);
    if (!existsSync(dir)) {
      return { frameBytes: 0, contactBytes: 0 };
    }

    let files = [];
    try {
      files = await readdir(dir);
    } catch {
      return { frameBytes: 0, contactBytes: 0 };
    }

    let frameBytes = 0;
    let contactBytes = 0;
    for (const filename of files) {
      const full = join(dir, filename);
      let size = 0;
      try {
        size = (await stat(full)).size;
      } catch {
        continue;
      }

      if (frameFileRegex().test(filename)) frameBytes += size;
      else if (contactSheetRegex().test(filename)) contactBytes += size;
    }
    return { frameBytes, contactBytes };
  }

  router.get('/', async (req, res) => {
    try {
      const [clips, branches, iterations, evaluations] = await Promise.all([
        store.list('clips'),
        store.list('branches'),
        store.list('iterations'),
        store.list('evaluations')
      ]);

      const clipById = Object.fromEntries(clips.map(clip => [clip.id, clip]));
      const evalById = Object.fromEntries(evaluations.map(ev => [ev.id, ev]));
      const itersByBranch = new Map();
      for (const iter of iterations) {
        const list = itersByBranch.get(iter.branch_id) || [];
        list.push(iter);
        itersByBranch.set(iter.branch_id, list);
      }

      let totalFrameBytes = 0;
      let totalContactBytes = 0;
      const stagnant = [];
      const scheduledPurge = [];

      for (const branch of branches) {
        const branchIters = (itersByBranch.get(branch.id) || []).sort((a, b) => a.iteration_number - b.iteration_number);
        if (branchIters.length === 0) continue;

        let branchFrameBytes = 0;
        let branchContactBytes = 0;
        for (const iter of branchIters) {
          const scanned = await scanIterationStorage(iter.id);
          branchFrameBytes += scanned.frameBytes;
          branchContactBytes += scanned.contactBytes;
        }

        totalFrameBytes += branchFrameBytes;
        totalContactBytes += branchContactBytes;

        if (branchFrameBytes <= 0) continue;
        if (branch.keep_frames_forever) continue;
        if (['locked', 'abandoned', 'archived'].includes(branch.status)) continue;

        const evaluated = branchIters.filter(iter => iter.evaluation_id && evalById[iter.evaluation_id]);
        const scored = evaluated
          .map(iter => evalById[iter.evaluation_id]?.scores?.grand_total)
          .filter(score => score != null);
        const latestIter = branchIters[branchIters.length - 1];
        const latestActivityAt = latestIter?.updated_at || latestIter?.created_at || branch.updated_at || branch.created_at;
        const idleDays = daysBetween(latestActivityAt) ?? 0;

        let staleReason = 'idle';
        if (evaluated.length >= 3 && scored.length === 0) {
          staleReason = 'no_evals';
        } else if (scored.length >= 5) {
          const last4 = scored.slice(-4);
          const earlierBest = Math.max(...scored.slice(0, -4));
          const last4Best = Math.max(...last4);
          if (earlierBest >= last4Best) staleReason = 'plateau';
        }

        const clip = clipById[branch.clip_id];
        const row = {
          branch_id: branch.id,
          clip_id: branch.clip_id,
          clip_name: clip?.name || 'Unknown clip',
          seed: branch.seed,
          status: branch.status,
          stale_reason: staleReason,
          idle_days: idleDays,
          frames_bytes: branchFrameBytes
        };
        stagnant.push(row);

        if (autoPurgeDays && idleDays >= autoPurgeDays) {
          const purgeDate = new Date(new Date(latestActivityAt).getTime() + autoPurgeDays * 24 * 60 * 60 * 1000).toISOString();
          scheduledPurge.push({ ...row, purge_date: purgeDate });
        }
      }

      // Include centralized contactsheets directory
      if (existsSync(contactsheetsRoot)) {
        try {
          const files = await readdir(contactsheetsRoot);
          for (const filename of files) {
            if (!contactSheetRegex().test(filename)) continue;
            try {
              totalContactBytes += (await stat(join(contactsheetsRoot, filename))).size;
            } catch {}
          }
        } catch {}
      }

      stagnant.sort((a, b) => b.frames_bytes - a.frames_bytes);
      scheduledPurge.sort((a, b) => new Date(a.purge_date) - new Date(b.purge_date));

      res.json({
        summary: {
          frames_bytes: totalFrameBytes,
          contact_bytes: totalContactBytes,
          reclaimable_bytes: stagnant.reduce((sum, row) => sum + row.frames_bytes, 0)
        },
        stagnant,
        scheduled_purge: scheduledPurge,
        settings: {
          auto_purge_days: autoPurgeDays
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/branch/:id/frames', async (req, res) => {
    try {
      const branch = await store.get('branches', req.params.id);
      const iterations = await store.list('iterations', iter => iter.branch_id === branch.id);
      let bytesReclaimed = 0;

      for (const iter of iterations) {
        const dir = join(framesRoot, iter.id);
        if (!existsSync(dir)) continue;

        let files = [];
        try {
          files = await readdir(dir);
        } catch {
          continue;
        }

        const frameFiles = files.filter(filename => frameFileRegex().test(filename));
        for (const filename of frameFiles) {
          const full = join(dir, filename);
          try {
            bytesReclaimed += (await stat(full)).size;
            await unlink(full);
          } catch {}
        }
      }

      res.json({ deleted: true, branch_id: branch.id, bytes_reclaimed: bytesReclaimed });
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}


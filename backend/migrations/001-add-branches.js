/**
 * Migration 001: Add branches to existing iteration data.
 *
 * For each clip that has iterations:
 * 1. Group iterations by seed_used
 * 2. Create a branch record for each unique seed
 * 3. Assign branch_id to each iteration
 * 4. Update branch best_score and iteration_count
 *
 * Safe to run multiple times — skips clips that already have branches.
 *
 * Usage: node migrations/001-add-branches.js [--data-dir <path>]
 */

import { createStore } from '../store/index.js';
import config from '../config.js';

const dataDir = process.argv.includes('--data-dir')
  ? process.argv[process.argv.indexOf('--data-dir') + 1]
  : config.iteratarr_data_dir;

console.log(`[Migration 001] Starting — data dir: ${dataDir}`);
const store = createStore(dataDir);

try {
  const clips = await store.list('clips');
  console.log(`[Migration 001] Found ${clips.length} clip(s)`);

  let branchesCreated = 0;
  let iterationsUpdated = 0;
  let clipsSkipped = 0;

  for (const clip of clips) {
    // Check if this clip already has branches
    const existingBranches = await store.list('branches', b => b.clip_id === clip.id);
    if (existingBranches.length > 0) {
      console.log(`  [SKIP] ${clip.name} — already has ${existingBranches.length} branch(es)`);
      clipsSkipped++;
      continue;
    }

    // Get all iterations for this clip
    const iterations = await store.list('iterations', i => i.clip_id === clip.id);
    if (iterations.length === 0) {
      console.log(`  [SKIP] ${clip.name} — no iterations`);
      clipsSkipped++;
      continue;
    }

    // Group by seed_used
    const seedGroups = new Map();
    for (const iter of iterations) {
      const seed = iter.seed_used || iter.json_contents?.seed || 0;
      if (!seedGroups.has(seed)) seedGroups.set(seed, []);
      seedGroups.get(seed).push(iter);
    }

    console.log(`  [MIGRATE] ${clip.name} — ${iterations.length} iteration(s), ${seedGroups.size} seed(s)`);

    for (const [seed, seedIters] of seedGroups) {
      // Determine branch status from iteration states
      const hasLocked = seedIters.some(i => i.status === 'locked');
      const hasEvaluated = seedIters.some(i => i.status === 'evaluated');
      let status = 'active';
      if (hasLocked) status = 'locked';

      // Find best score
      let bestScore = null;
      let bestIterationId = null;
      for (const iter of seedIters) {
        if (iter.evaluation_id) {
          try {
            const evaluation = await store.get('evaluations', iter.evaluation_id);
            if (evaluation.scores?.grand_total && (!bestScore || evaluation.scores.grand_total > bestScore)) {
              bestScore = evaluation.scores.grand_total;
              bestIterationId = iter.id;
            }
          } catch { /* evaluation may not exist */ }
        }
      }

      // Create branch
      const branch = await store.create('branches', {
        clip_id: clip.id,
        seed,
        name: `seed-${seed}`,
        status,
        created_from: 'migration',
        source_branch_id: null,
        source_iteration_id: null,
        base_settings: seedIters[0]?.json_contents || {},
        best_score: bestScore,
        best_iteration_id: bestIterationId,
        iteration_count: seedIters.length,
        locked_at: hasLocked ? new Date().toISOString() : null
      });

      branchesCreated++;
      console.log(`    Branch: seed-${seed} (${status}, ${seedIters.length} iters, best: ${bestScore || 'n/a'})`);

      // Assign branch_id to all iterations in this group
      for (const iter of seedIters) {
        await store.update('iterations', iter.id, { branch_id: branch.id });
        iterationsUpdated++;
      }

      // Also link any seed screen records for this seed
      const screenRecords = await store.list('seed_screens', r => r.clip_id === clip.id && r.seed === seed);
      for (const screen of screenRecords) {
        await store.update('seed_screens', screen.id, { branch_id: branch.id });
      }
    }
  }

  console.log(`\n[Migration 001] Complete`);
  console.log(`  Branches created: ${branchesCreated}`);
  console.log(`  Iterations updated: ${iterationsUpdated}`);
  console.log(`  Clips skipped: ${clipsSkipped}`);

} catch (err) {
  console.error(`[Migration 001] FAILED:`, err.message);
  process.exit(1);
} finally {
  store.close();
}

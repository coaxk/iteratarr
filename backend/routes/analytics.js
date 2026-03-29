import { Router } from 'express';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { checkVisionApi, scoreFrames } from '../vision-scorer.js';

/**
 * Analytics routes — cross-branch analysis for a clip.
 *
 * Provides aggregated views across all branches: score progressions,
 * seed effectiveness rankings, settings correlations, and side-by-side
 * branch comparisons. All data is derived from existing iteration and
 * evaluation records — no new collections needed.
 */
export function createAnalyticsRoutes(store, config = {}) {
  const router = Router();
  const framesRoot = join(config.iteratarr_data_dir || '.', 'frames');
  const seedPersonalityJobs = new Map();

  function stddev(values) {
    if (!values || values.length < 2) return null;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + ((val - mean) ** 2), 0) / values.length;
    return +Math.sqrt(variance).toFixed(2);
  }

  async function getLatestSeedPersonalityProfile(seed) {
    const profiles = await store.list('seed_personality_profiles', profile => Number(profile.seed) === Number(seed));
    return profiles.sort((a, b) => (b.analyzed_at || '').localeCompare(a.analyzed_at || ''))[0] || null;
  }

  async function resolveFramePreview(sourceId) {
    const frameDir = join(framesRoot, sourceId);
    if (!existsSync(frameDir)) return null;
    const files = await readdir(frameDir);
    const contactSheet = files.find(filename => filename.startsWith('contact_sheet'));
    if (contactSheet) {
      return { source_id: sourceId, filename: contactSheet, url: `/api/frames/${sourceId}/${contactSheet}` };
    }
    const frame = files.filter(filename => /^frame_\d{3}\.png$/.test(filename)).sort()[0];
    if (!frame) return null;
    return { source_id: sourceId, filename: frame, url: `/api/frames/${sourceId}/${frame}` };
  }

  async function buildSeedPersonalityProfile(seed, maxSamples) {
    const clips = await store.list('clips');
    const clipById = Object.fromEntries(clips.map(clip => [clip.id, clip]));
    const branches = await store.list('branches', branch => Number(branch.seed) === seed);
    const branchById = Object.fromEntries(branches.map(branch => [branch.id, branch]));
    const branchIds = new Set(branches.map(branch => branch.id));
    const iterations = await store.list('iterations', iteration => iteration.branch_id && branchIds.has(iteration.branch_id));
    const seedScreens = await store.list('seed_screens', screen => Number(screen.seed) === seed);

    const samples = [];
    for (const iteration of iterations) {
      samples.push({
        source_type: 'iteration',
        source_id: iteration.id,
        clip_id: iteration.clip_id,
        branch_id: iteration.branch_id,
        prompt: iteration.json_contents?.prompt || '',
        negative_prompt: iteration.json_contents?.negative_prompt || '',
        iteration_number: iteration.iteration_number || null
      });
    }
    for (const screen of seedScreens) {
      samples.push({
        source_type: 'screening',
        source_id: screen.id,
        clip_id: screen.clip_id,
        branch_id: screen.branch_id || null,
        prompt: '',
        negative_prompt: '',
        iteration_number: null
      });
    }

    const scoredSamples = [];
    const traitDefinitions = [
      { key: 'age_regression', label: 'Age regression tendency', keywords: ['younger', 'age', 'youth', 'teen', 'child'] },
      { key: 'body_drift', label: 'Body-type drift tendency', keywords: ['body', 'weight', 'heavier', 'lean', 'muscle', 'build'] },
      { key: 'accessory_generation', label: 'Accessory generation tendency', keywords: ['accessory', 'hat', 'glasses', 'jewelry', 'necklace', 'earring'] },
      { key: 'identity_drift', label: 'Identity drift tendency', keywords: ['identity', 'off-model', 'off model', 'drift', 'face mismatch'] }
    ];
    const traitCounts = Object.fromEntries(traitDefinitions.map(def => [def.key, 0]));

    const sortedSamples = samples
      .sort((a, b) => (b.iteration_number || 0) - (a.iteration_number || 0))
      .slice(0, maxSamples);

    for (const sample of sortedSamples) {
      const frameDir = join(framesRoot, sample.source_id);
      if (!existsSync(frameDir)) continue;
      const files = await readdir(frameDir);
      const contactSheet = files.find(filename => filename.startsWith('contact_sheet'));
      const frameFiles = files.filter(filename => /^frame_\d{3}\.png$/.test(filename)).sort();
      const framePaths = contactSheet
        ? [join(frameDir, contactSheet)]
        : frameFiles.slice(0, 4).map(filename => join(frameDir, filename));
      if (framePaths.length === 0) continue;

      const clip = clipById[sample.clip_id];
      const branch = sample.branch_id ? branchById[sample.branch_id] : null;
      const context = {
        prompt: sample.prompt,
        negativePrompt: sample.negative_prompt,
        iterationNumber: sample.iteration_number || undefined,
        changeFromParent: sample.source_type === 'screening' ? 'Seed screening sample' : undefined
      };
      const result = await scoreFrames(framePaths, context);
      const notesBlob = `${result.qualitative_notes || ''} ${result.attribution?.lowest_element || ''}`.toLowerCase();
      for (const traitDef of traitDefinitions) {
        if (traitDef.keywords.some(keyword => notesBlob.includes(keyword))) {
          traitCounts[traitDef.key] += 1;
        }
      }
      scoredSamples.push({
        source_type: sample.source_type,
        source_id: sample.source_id,
        clip_id: sample.clip_id,
        clip_name: clip?.name || 'Unknown clip',
        branch_name: branch?.name || null,
        score: result.grand_total,
        frame_consistency: result.scores?.identity?.frame_consistency ?? null,
        lowest_element: result.attribution?.lowest_element || null,
        qualitative_notes: result.qualitative_notes || '',
        cache_hit: !!result.cache_hit,
        tokens_used: result.tokens_used || null
      });
    }

    if (scoredSamples.length === 0) {
      throw new Error('No extracted frames found for this seed. Extract seed-screen or iteration frames first.');
    }

    const grandScores = scoredSamples.map(sample => sample.score).filter(score => score != null);
    const frameConsistencyScores = scoredSamples.map(sample => sample.frame_consistency).filter(score => score != null);
    const traitSignals = traitDefinitions
      .map(def => {
        const count = traitCounts[def.key] || 0;
        const prevalence = scoredSamples.length > 0 ? +((count / scoredSamples.length) * 100).toFixed(0) : 0;
        let confidence = 'low';
        if (count >= 4 || prevalence >= 60) confidence = 'high';
        else if (count >= 2 || prevalence >= 35) confidence = 'medium';
        return { key: def.key, label: def.label, count, prevalence, confidence };
      })
      .filter(signal => signal.count > 0)
      .sort((a, b) => b.prevalence - a.prevalence);

    const tokensSummary = scoredSamples.reduce((acc, sample) => {
      acc.input += sample.tokens_used?.input || 0;
      acc.output += sample.tokens_used?.output || 0;
      acc.cache_read += sample.tokens_used?.cache_read || 0;
      acc.cache_write += sample.tokens_used?.cache_write || 0;
      return acc;
    }, { input: 0, output: 0, cache_read: 0, cache_write: 0 });

    const profilePayload = {
      seed,
      analyzed_at: new Date().toISOString(),
      sample_count: scoredSamples.length,
      max_samples: maxSamples,
      avg_grand_score: grandScores.length > 0 ? +(grandScores.reduce((sum, score) => sum + score, 0) / grandScores.length).toFixed(1) : null,
      grand_score_stddev: stddev(grandScores),
      avg_frame_consistency: frameConsistencyScores.length > 0 ? +(frameConsistencyScores.reduce((sum, score) => sum + score, 0) / frameConsistencyScores.length).toFixed(2) : null,
      trait_signals: traitSignals,
      tokens_used: tokensSummary,
      cache_hits: scoredSamples.filter(sample => sample.cache_hit).length,
      samples: scoredSamples
    };

    const latest = await getLatestSeedPersonalityProfile(seed);
    return latest
      ? await store.update('seed_personality_profiles', latest.id, profilePayload)
      : await store.create('seed_personality_profiles', profilePayload);
  }

  /**
   * GET /api/analytics/branches/:clipId
   *
   * Returns comprehensive cross-branch analytics for a clip:
   * - branches: all branches with iteration chains and score progressions
   * - seedRanking: seeds ranked by best score
   * - settingsCorrelation: which settings changes had the most positive impact
   * - winningSummary: aggregated settings from top-scoring iterations
   */
  router.get('/branches/:clipId', async (req, res) => {
    try {
      const clipId = req.params.clipId;

      // Load all branches and iterations for this clip
      const branches = await store.list('branches', b => b.clip_id === clipId);
      const allIterations = await store.list('iterations', i => i.clip_id === clipId);

      // Load all evaluations for these iterations
      const evaluationCache = {};
      for (const iter of allIterations) {
        if (iter.evaluation_id) {
          try {
            evaluationCache[iter.evaluation_id] = await store.get('evaluations', iter.evaluation_id);
          } catch { /* evaluation may have been deleted */ }
        }
      }

      // Build per-branch data with score progressions
      const branchData = branches.map(branch => {
        const branchIters = allIterations
          .filter(i => i.branch_id === branch.id)
          .sort((a, b) => a.iteration_number - b.iteration_number);

        const scoreProgression = [];
        let bestScore = null;
        let bestIterationId = null;
        let bestIteration = null;

        for (const iter of branchIters) {
          const evaluation = iter.evaluation_id ? evaluationCache[iter.evaluation_id] : null;
          const grandTotal = evaluation?.scores?.grand_total ?? null;

          scoreProgression.push({
            iteration_number: iter.iteration_number,
            iteration_id: iter.id,
            score: grandTotal,
            status: iter.status
          });

          if (grandTotal !== null && (bestScore === null || grandTotal > bestScore)) {
            bestScore = grandTotal;
            bestIterationId = iter.id;
            bestIteration = iter;
          }
        }

        return {
          id: branch.id,
          name: branch.name,
          seed: branch.seed,
          status: branch.status,
          created_from: branch.created_from,
          iteration_count: branchIters.length,
          best_score: bestScore,
          best_iteration_id: bestIterationId,
          best_settings: bestIteration?.json_contents || null,
          score_progression: scoreProgression
        };
      });

      // Sort branches by best score descending (nulls last)
      branchData.sort((a, b) => {
        if (a.best_score === null && b.best_score === null) return 0;
        if (a.best_score === null) return 1;
        if (b.best_score === null) return -1;
        return b.best_score - a.best_score;
      });

      // Seed effectiveness ranking — group by seed, find best score per seed
      const seedMap = new Map();
      for (const branch of branchData) {
        const seed = branch.seed;
        if (!seedMap.has(seed)) {
          seedMap.set(seed, { seed, best_score: null, branch_count: 0, total_iterations: 0 });
        }
        const entry = seedMap.get(seed);
        entry.branch_count++;
        entry.total_iterations += branch.iteration_count;
        if (branch.best_score !== null && (entry.best_score === null || branch.best_score > entry.best_score)) {
          entry.best_score = branch.best_score;
        }
      }
      const seedRanking = [...seedMap.values()]
        .sort((a, b) => {
          if (a.best_score === null && b.best_score === null) return 0;
          if (a.best_score === null) return 1;
          if (b.best_score === null) return -1;
          return b.best_score - a.best_score;
        });

      // Settings correlation — analyse which rope changes had positive score impacts
      // Look at consecutive iterations within each branch and correlate attributed ropes
      // with score changes
      const ropeImpacts = {};
      for (const branch of branches) {
        const branchIters = allIterations
          .filter(i => i.branch_id === branch.id)
          .sort((a, b) => a.iteration_number - b.iteration_number);

        for (let idx = 1; idx < branchIters.length; idx++) {
          const prev = branchIters[idx - 1];
          const curr = branchIters[idx];
          const prevEval = prev.evaluation_id ? evaluationCache[prev.evaluation_id] : null;
          const currEval = curr.evaluation_id ? evaluationCache[curr.evaluation_id] : null;

          if (!prevEval?.scores?.grand_total || !currEval?.scores?.grand_total) continue;

          const delta = currEval.scores.grand_total - prevEval.scores.grand_total;
          const rope = currEval.attribution?.rope || prev.change_from_parent || 'unknown';

          if (!ropeImpacts[rope]) {
            ropeImpacts[rope] = { rope, count: 0, total_delta: 0, positive_count: 0, negative_count: 0, deltas: [] };
          }
          ropeImpacts[rope].count++;
          ropeImpacts[rope].total_delta += delta;
          ropeImpacts[rope].deltas.push(delta);
          if (delta > 0) ropeImpacts[rope].positive_count++;
          if (delta < 0) ropeImpacts[rope].negative_count++;
        }
      }

      // Compute averages and sort by average delta
      const settingsCorrelation = Object.values(ropeImpacts)
        .map(r => ({
          ...r,
          avg_delta: r.count > 0 ? +(r.total_delta / r.count).toFixed(2) : 0,
          success_rate: r.count > 0 ? +(r.positive_count / r.count * 100).toFixed(0) : 0
        }))
        .sort((a, b) => b.avg_delta - a.avg_delta);

      // Winning settings summary — aggregate settings from the top 3 scoring iterations
      const evaluatedIters = allIterations
        .filter(i => {
          const ev = i.evaluation_id ? evaluationCache[i.evaluation_id] : null;
          return ev?.scores?.grand_total != null;
        })
        .sort((a, b) => {
          const scoreA = evaluationCache[a.evaluation_id]?.scores?.grand_total || 0;
          const scoreB = evaluationCache[b.evaluation_id]?.scores?.grand_total || 0;
          return scoreB - scoreA;
        });

      const topIters = evaluatedIters.slice(0, 3);
      const winningSummary = {};
      const settingsKeys = [
        'guidance_scale', 'guidance2_scale', 'loras_multipliers',
        'flow_shift', 'NAG_scale', 'num_inference_steps',
        'film_grain_intensity', 'film_grain_saturation',
        'skip_steps_cache_type', 'sample_solver', 'seed'
      ];

      for (const key of settingsKeys) {
        const values = topIters
          .map(i => i.json_contents?.[key])
          .filter(v => v !== undefined && v !== null);

        if (values.length > 0) {
          // For numeric values, compute average. For strings, find most common.
          if (typeof values[0] === 'number') {
            winningSummary[key] = {
              avg: +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(3),
              min: Math.min(...values),
              max: Math.max(...values),
              values
            };
          } else {
            // Most common value
            const counts = {};
            for (const v of values) {
              const sv = String(v);
              counts[sv] = (counts[sv] || 0) + 1;
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            winningSummary[key] = {
              most_common: sorted[0][0],
              values
            };
          }
        }
      }

      res.json({
        clip_id: clipId,
        branch_count: branches.length,
        total_iterations: allIterations.length,
        branches: branchData,
        seedRanking,
        settingsCorrelation,
        winningSummary
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/branches/:clipId/compare?branches=id1,id2
   *
   * Side-by-side comparison of two branches: best iterations, full score
   * breakdown with deltas, and settings diff between the two best iterations.
   */
  router.get('/branches/:clipId/compare', async (req, res) => {
    try {
      const clipId = req.params.clipId;
      const branchIds = (req.query.branches || '').split(',').filter(Boolean);

      if (branchIds.length !== 2) {
        return res.status(400).json({ error: 'Provide exactly 2 branch IDs via ?branches=id1,id2' });
      }

      const results = [];

      for (const branchId of branchIds) {
        const branch = await store.get('branches', branchId);
        if (branch.clip_id !== clipId) {
          return res.status(400).json({ error: `Branch ${branchId} does not belong to clip ${clipId}` });
        }

        const iterations = await store.list('iterations', i => i.branch_id === branchId);
        iterations.sort((a, b) => a.iteration_number - b.iteration_number);

        // Find best iteration by score
        let bestIter = null;
        let bestScore = null;
        let bestEval = null;

        for (const iter of iterations) {
          if (iter.evaluation_id) {
            try {
              const evaluation = await store.get('evaluations', iter.evaluation_id);
              if (evaluation.scores?.grand_total != null) {
                if (bestScore === null || evaluation.scores.grand_total > bestScore) {
                  bestScore = evaluation.scores.grand_total;
                  bestIter = iter;
                  bestEval = evaluation;
                }
              }
            } catch { /* missing eval */ }
          }
        }

        // Score progression
        const scoreProgression = [];
        for (const iter of iterations) {
          if (iter.evaluation_id) {
            try {
              const ev = await store.get('evaluations', iter.evaluation_id);
              scoreProgression.push({
                iteration_number: iter.iteration_number,
                score: ev.scores?.grand_total ?? null
              });
            } catch {
              scoreProgression.push({ iteration_number: iter.iteration_number, score: null });
            }
          }
        }

        results.push({
          branch: {
            id: branch.id,
            name: branch.name,
            seed: branch.seed,
            status: branch.status,
            iteration_count: iterations.length
          },
          best_iteration: bestIter ? {
            id: bestIter.id,
            iteration_number: bestIter.iteration_number,
            json_contents: bestIter.json_contents,
            seed_used: bestIter.seed_used
          } : null,
          best_score: bestScore,
          scores: bestEval?.scores || null,
          attribution: bestEval?.attribution || null,
          score_progression: scoreProgression
        });
      }

      // Compute settings diff between the two best iterations
      const leftSettings = results[0].best_iteration?.json_contents || {};
      const rightSettings = results[1].best_iteration?.json_contents || {};
      const allKeys = new Set([...Object.keys(leftSettings), ...Object.keys(rightSettings)]);
      const settingsDiff = [];

      for (const key of allKeys) {
        const lv = leftSettings[key];
        const rv = rightSettings[key];
        if (JSON.stringify(lv) !== JSON.stringify(rv)) {
          settingsDiff.push({ field: key, left: lv ?? null, right: rv ?? null });
        }
      }

      // Score deltas per field
      const leftScores = results[0].scores || {};
      const rightScores = results[1].scores || {};
      const scoreDeltas = {
        grand_total: (rightScores.grand_total ?? 0) - (leftScores.grand_total ?? 0),
        identity: (rightScores.identity?.total ?? 0) - (leftScores.identity?.total ?? 0),
        location: (rightScores.location?.total ?? 0) - (leftScores.location?.total ?? 0),
        motion: (rightScores.motion?.total ?? 0) - (leftScores.motion?.total ?? 0)
      };

      res.json({
        clip_id: clipId,
        left: results[0],
        right: results[1],
        settingsDiff,
        scoreDeltas
      });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/overview
   *
   * Aggregates cross-clip analytics: summary counts, per-clip data with stall detection,
   * per-character performance, rope effectiveness, and score distribution histogram.
   *
   * Stall detection rules:
   * - PLATEAU: best score on active branches unchanged for last 4+ scored iterations
   * - NO_EVALS: active branches have 3+ iterations with zero evaluations
   * - Locked clips (locked_iteration_id set) are excluded from stall detection
   * - Abandoned/archived branches are excluded from stall detection
   */
  router.get('/overview', async (req, res) => {
    try {
      const clips = await store.list('clips');
      const allBranches = await store.list('branches');
      const allIterations = await store.list('iterations');
      const allEvaluations = await store.list('evaluations');

      // Build lookup maps for O(1) access
      const evalById = Object.fromEntries(allEvaluations.map(e => [e.id, e]));

      // Group iterations and branches by clip_id
      const itersByClip = {};
      for (const iter of allIterations) {
        if (!itersByClip[iter.clip_id]) itersByClip[iter.clip_id] = [];
        itersByClip[iter.clip_id].push(iter);
      }
      const branchesByClip = {};
      for (const branch of allBranches) {
        if (!branchesByClip[branch.clip_id]) branchesByClip[branch.clip_id] = [];
        branchesByClip[branch.clip_id].push(branch);
      }

      // Score distribution buckets: [0-15, 15-30, 30-45, 45-60, 60-75]
      const buckets = [0, 0, 0, 0, 0];
      const allScores = [];
      let evaluatedCount = 0;
      let lockedCount = 0;
      let stallingCount = 0;

      const clipData = clips.map(clip => {
        const clipIters = itersByClip[clip.id] || [];
        const clipBranches = branchesByClip[clip.id] || [];

        // Evaluated iterations
        const evaluatedIters = clipIters.filter(i => i.evaluation_id && evalById[i.evaluation_id]);
        evaluatedCount += evaluatedIters.length;

        // Best score + histogram population
        let bestScore = null;
        for (const iter of evaluatedIters) {
          const score = evalById[iter.evaluation_id]?.scores?.grand_total;
          if (score != null) {
            allScores.push(score);
            buckets[Math.min(Math.floor(score / 15), 4)]++;
            if (bestScore === null || score > bestScore) bestScore = score;
          }
        }

        if (clip.locked_iteration_id) lockedCount++;

        // Stall detection — skip locked clips
        let stall = null;
        if (!clip.locked_iteration_id) {
          const INACTIVE = new Set(['abandoned', 'archived']);
          const activeBranches = clipBranches.filter(b => !INACTIVE.has(b.status));
          const activeBranchIds = new Set(activeBranches.map(b => b.id));
          const excludedBranchCount = clipBranches.length - activeBranches.length;

          const activeIters = clipIters.filter(i => activeBranchIds.has(i.branch_id));

          // PLATEAU: last 4 scored iters on active branches haven't improved on the prior best
          const scoredActiveIters = activeIters
            .filter(i => i.evaluation_id && evalById[i.evaluation_id]?.scores?.grand_total != null)
            .sort((a, b) => a.iteration_number - b.iteration_number);

          if (scoredActiveIters.length >= 5) {
            const last4 = scoredActiveIters.slice(-4);
            const earlier = scoredActiveIters.slice(0, -4);
            const overallBest = Math.max(...scoredActiveIters.map(i => evalById[i.evaluation_id].scores.grand_total));
            const preBest = Math.max(...earlier.map(i => evalById[i.evaluation_id].scores.grand_total));
            const last4Max = Math.max(...last4.map(i => evalById[i.evaluation_id].scores.grand_total));
            if (preBest >= last4Max) {
              stall = {
                type: 'plateau',
                detail: `best score ${overallBest} unchanged for 4+ iters`,
                excluded_branch_count: excludedBranchCount
              };
            }
          }

          // NO_EVALS: active branches have 3+ iters and zero evaluations
          if (!stall && activeIters.length >= 3) {
            const evaledCount = activeIters.filter(i => i.evaluation_id && evalById[i.evaluation_id]).length;
            if (evaledCount === 0) {
              stall = {
                type: 'no_evals',
                detail: `${activeIters.length} iterations with no evaluations`,
                excluded_branch_count: excludedBranchCount
              };
            }
          }

          if (stall) stallingCount++;
        }

        return {
          id: clip.id,
          name: clip.name,
          characters: clip.characters || [],
          status: clip.status,
          locked_iteration_id: clip.locked_iteration_id || null,
          best_score: bestScore,
          iteration_count: clipIters.length,
          evaluated_count: evaluatedIters.length,
          stall
        };
      });

      // Sort: stalling first → by best score desc → zero-iter clips last
      clipData.sort((a, b) => {
        if (a.stall && !b.stall) return -1;
        if (!a.stall && b.stall) return 1;
        if (a.best_score === null && b.best_score === null) return 0;
        if (a.best_score === null) return 1;
        if (b.best_score === null) return -1;
        return b.best_score - a.best_score;
      });

      // Per-character aggregation
      const charMap = new Map();
      for (const clip of clips) {
        for (const char of (clip.characters || [])) {
          if (!charMap.has(char)) charMap.set(char, { name: char, clip_count: 0, total_iterations: 0, best_score: null, _scores: [] });
          const entry = charMap.get(char);
          entry.clip_count++;
          const clipIters = itersByClip[clip.id] || [];
          entry.total_iterations += clipIters.length;
          for (const iter of clipIters) {
            const score = iter.evaluation_id ? evalById[iter.evaluation_id]?.scores?.grand_total : null;
            if (score != null) {
              entry._scores.push(score);
              if (entry.best_score === null || score > entry.best_score) entry.best_score = score;
            }
          }
        }
      }
      const characters = [...charMap.values()]
        .map(({ _scores, ...c }) => ({
          ...c,
          avg_score: _scores.length > 0 ? +(_scores.reduce((s, v) => s + v, 0) / _scores.length).toFixed(1) : null
        }))
        .sort((a, b) => {
          if (a.best_score === null && b.best_score === null) return 0;
          if (a.best_score === null) return 1;
          if (b.best_score === null) return -1;
          return b.best_score - a.best_score;
        });

      // Rope effectiveness — consecutive pairs within each active branch
      const ropeImpacts = {};
      for (const branch of allBranches) {
        if (['abandoned', 'archived'].includes(branch.status)) continue;
        const branchIters = (itersByClip[branch.clip_id] || [])
          .filter(i => i.branch_id === branch.id)
          .sort((a, b) => a.iteration_number - b.iteration_number);

        for (let idx = 1; idx < branchIters.length; idx++) {
          const prev = branchIters[idx - 1];
          const curr = branchIters[idx];
          const prevScore = prev.evaluation_id ? evalById[prev.evaluation_id]?.scores?.grand_total : null;
          const currScore = curr.evaluation_id ? evalById[curr.evaluation_id]?.scores?.grand_total : null;
          if (prevScore == null || currScore == null) continue;

          const rope = (curr.evaluation_id ? evalById[curr.evaluation_id]?.attribution?.rope : null) || 'unknown';
          const delta = currScore - prevScore;

          if (!ropeImpacts[rope]) ropeImpacts[rope] = { rope, count: 0, total_delta: 0, positive_count: 0 };
          ropeImpacts[rope].count++;
          ropeImpacts[rope].total_delta += delta;
          if (delta > 0) ropeImpacts[rope].positive_count++;
        }
      }

      const ROPE_LABELS = {
        rope_1_prompt_position: 'Rope 1 — Prompt Position',
        rope_2_attention_weighting: 'Rope 2 — Attention Weighting',
        rope_3_lora_multipliers: 'Rope 3 — LoRA Multipliers',
        rope_4a_cfg_high: 'Rope 4a — CFG High Noise',
        rope_4b_cfg_low: 'Rope 4b — CFG Low Noise',
        rope_5_steps_skipping: 'Rope 5 — Steps Skipping',
        rope_6_alt_prompt: 'Rope 6 — Alt Prompt',
        bonus_flow_shift: 'Bonus — flow_shift',
        bonus_nag_scale: 'Bonus — NAG_scale',
        bonus_sample_solver: 'Bonus — sample_solver',
        multiple: 'Multiple ropes',
      };

      const ropes = Object.values(ropeImpacts)
        .map(r => ({
          rope: r.rope,
          label: ROPE_LABELS[r.rope] || r.rope,
          count: r.count,
          avg_delta: r.count > 0 ? +(r.total_delta / r.count).toFixed(2) : 0,
          success_rate: r.count > 0 ? +(r.positive_count / r.count * 100).toFixed(0) : 0
        }))
        .sort((a, b) => b.avg_delta - a.avg_delta);

      // Score distribution stats
      const sortedScores = [...allScores].sort((a, b) => a - b);
      const median = sortedScores.length > 0
        ? sortedScores.length % 2 === 1
          ? sortedScores[Math.floor(sortedScores.length / 2)]
          : +((sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2).toFixed(1)
        : null;
      const mean = sortedScores.length > 0 ? +(sortedScores.reduce((s, v) => s + v, 0) / sortedScores.length).toFixed(1) : null;
      const high = sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : null;

      res.json({
        summary: {
          clip_count: clips.length,
          iteration_count: allIterations.length,
          evaluated_count: evaluatedCount,
          locked_count: lockedCount,
          stalling_count: stallingCount
        },
        clips: clipData,
        characters,
        ropes,
        score_distribution: {
          buckets: [
            { range: '0–15', count: buckets[0] },
            { range: '15–30', count: buckets[1] },
            { range: '30–45', count: buckets[2] },
            { range: '45–60', count: buckets[3] },
            { range: '60–75', count: buckets[4] }
          ],
          median,
          mean,
          high
        }
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/clips/:clipId/seed-thumbnails
   *
   * Batched thumbnail resolver for Seed HQ to avoid per-row frame fetch fan-out.
   */
  router.get('/clips/:clipId/seed-thumbnails', async (req, res) => {
    try {
      const clipId = req.params.clipId;
      const branches = await store.list('branches', branch => branch.clip_id === clipId);
      const seedScreens = await store.list('seed_screens', screen => screen.clip_id === clipId);
      const iterations = await store.list('iterations', iteration => iteration.clip_id === clipId);

      const seedIndex = new Map();
      function ensureSeed(seedValue) {
        const key = String(seedValue);
        if (!seedIndex.has(key)) {
          seedIndex.set(key, { seed: Number(seedValue), thumbnail: null });
        }
        return seedIndex.get(key);
      }

      for (const screen of seedScreens) {
        if (screen.seed == null) continue;
        const entry = ensureSeed(screen.seed);
        if (entry.thumbnail) continue;
        const preview = await resolveFramePreview(screen.id);
        if (preview) {
          entry.thumbnail = { ...preview, source_type: 'screening' };
        }
      }

      const branchesBySeed = {};
      for (const branch of branches) {
        if (branch.seed == null || branch.seed === -1 || branch.seed === '-1') continue;
        const key = String(branch.seed);
        if (!branchesBySeed[key]) branchesBySeed[key] = [];
        branchesBySeed[key].push(branch);
        ensureSeed(branch.seed);
      }

      const iterByBranch = {};
      for (const iteration of iterations) {
        if (!iteration.branch_id) continue;
        if (!iterByBranch[iteration.branch_id]) iterByBranch[iteration.branch_id] = [];
        iterByBranch[iteration.branch_id].push(iteration);
      }

      for (const [seedKey, seedBranches] of Object.entries(branchesBySeed)) {
        const entry = seedIndex.get(seedKey);
        if (!entry || entry.thumbnail) continue;

        const orderedBranches = [...seedBranches].sort((a, b) => {
          const aScore = a.best_score ?? -1;
          const bScore = b.best_score ?? -1;
          if (bScore !== aScore) return bScore - aScore;
          return (b.updated_at || '').localeCompare(a.updated_at || '');
        });

        for (const branch of orderedBranches) {
          const branchIters = (iterByBranch[branch.id] || [])
            .sort((a, b) => a.iteration_number - b.iteration_number);
          for (const iteration of branchIters) {
            const preview = await resolveFramePreview(iteration.id);
            if (preview) {
              entry.thumbnail = { ...preview, source_type: 'iteration', branch_id: branch.id };
              break;
            }
          }
          if (entry.thumbnail) break;
        }
      }

      const seeds = [...seedIndex.values()]
        .sort((a, b) => a.seed - b.seed);

      res.json({ clip_id: clipId, seeds });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/seeds
   *
   * Aggregates per-seed performance across all local work:
   * - clips/characters the seed has been used on
   * - branch and iteration counts
   * - evaluated count, best score, average score
   * - screening selections/ratings and locked usage counts
   *
   * This is intentionally observational, not predictive.
   */
  router.get('/seeds', async (req, res) => {
    try {
      const clips = await store.list('clips');
      const branches = await store.list('branches');
      const iterations = await store.list('iterations');
      const evaluations = await store.list('evaluations');
      const seedScreens = await store.list('seed_screens');

      const evalById = Object.fromEntries(evaluations.map(e => [e.id, e]));
      const clipById = Object.fromEntries(clips.map(c => [c.id, c]));

      const itersByBranch = {};
      for (const iter of iterations) {
        if (!iter.branch_id) continue;
        if (!itersByBranch[iter.branch_id]) itersByBranch[iter.branch_id] = [];
        itersByBranch[iter.branch_id].push(iter);
      }

      const screensBySeed = {};
      for (const screen of seedScreens) {
        const key = String(screen.seed);
        if (!screensBySeed[key]) screensBySeed[key] = [];
        screensBySeed[key].push(screen);
      }

      const seedMap = new Map();

      function ensureSeed(seed) {
        const key = String(seed);
        if (!seedMap.has(key)) {
          seedMap.set(key, {
            seed,
            branch_count: 0,
            clip_ids: new Set(),
            character_names: new Set(),
            iteration_count: 0,
            evaluated_count: 0,
            total_score: 0,
            best_score: null,
            selected_count: 0,
            locked_count: 0,
            screening_ratings: [],
            latest_used_at: null,
            clips: new Map()
          });
        }
        return seedMap.get(key);
      }

      for (const branch of branches) {
        if (branch.seed == null || branch.seed === -1 || branch.seed === '-1') continue;
        const entry = ensureSeed(branch.seed);
        entry.branch_count++;

        const clip = clipById[branch.clip_id];
        if (clip) {
          entry.clip_ids.add(clip.id);
          for (const char of (clip.characters || [])) entry.character_names.add(char);
          const clipSummary = entry.clips.get(clip.id) || {
            clip_id: clip.id,
            clip_name: clip.name,
            characters: [...(clip.characters || [])],
            best_score: null,
            iteration_count: 0,
            evaluated_count: 0,
            statuses: new Set()
          };
          clipSummary.statuses.add(clip.status);
          entry.clips.set(clip.id, clipSummary);
        }

        if (branch.status === 'locked') entry.locked_count++;

        const branchIters = (itersByBranch[branch.id] || []).sort((a, b) => a.iteration_number - b.iteration_number);
        for (const iter of branchIters) {
          entry.iteration_count++;
          const timestamp = iter.updated_at || iter.created_at || null;
          if (timestamp && (!entry.latest_used_at || timestamp > entry.latest_used_at)) {
            entry.latest_used_at = timestamp;
          }

          const clipSummary = entry.clips.get(iter.clip_id);
          if (clipSummary) {
            clipSummary.iteration_count++;
          }

          const score = iter.evaluation_id ? evalById[iter.evaluation_id]?.scores?.grand_total : null;
          if (score != null) {
            entry.evaluated_count++;
            entry.total_score += score;
            if (entry.best_score == null || score > entry.best_score) entry.best_score = score;

            if (clipSummary) {
              clipSummary.evaluated_count++;
              if (clipSummary.best_score == null || score > clipSummary.best_score) {
                clipSummary.best_score = score;
              }
            }
          }
        }
      }

      for (const [seedKey, screens] of Object.entries(screensBySeed)) {
        const entry = ensureSeed(Number(seedKey));
        for (const screen of screens) {
          if (screen.selected) entry.selected_count++;
          if (screen.rating != null) entry.screening_ratings.push(screen.rating);

          const timestamp = screen.updated_at || screen.created_at || null;
          if (timestamp && (!entry.latest_used_at || timestamp > entry.latest_used_at)) {
            entry.latest_used_at = timestamp;
          }

          const clip = clipById[screen.clip_id];
          if (clip) {
            entry.clip_ids.add(clip.id);
            for (const char of (clip.characters || [])) entry.character_names.add(char);
            if (!entry.clips.has(clip.id)) {
              entry.clips.set(clip.id, {
                clip_id: clip.id,
                clip_name: clip.name,
                characters: [...(clip.characters || [])],
                best_score: null,
                iteration_count: 0,
                evaluated_count: 0,
                statuses: new Set([clip.status])
              });
            }
          }
        }
      }

      const seeds = [...seedMap.values()]
        .map(entry => {
          const screening_rating_avg = entry.screening_ratings.length > 0
            ? +(entry.screening_ratings.reduce((sum, rating) => sum + rating, 0) / entry.screening_ratings.length).toFixed(1)
            : null;

          const clips = [...entry.clips.values()]
            .map(clip => ({
              ...clip,
              statuses: [...clip.statuses].sort()
            }))
            .sort((a, b) => {
              if (a.best_score == null && b.best_score == null) return a.clip_name.localeCompare(b.clip_name);
              if (a.best_score == null) return 1;
              if (b.best_score == null) return -1;
              return b.best_score - a.best_score;
            });

          return {
            seed: entry.seed,
            branch_count: entry.branch_count,
            clip_count: entry.clip_ids.size,
            character_names: [...entry.character_names].sort(),
            iteration_count: entry.iteration_count,
            evaluated_count: entry.evaluated_count,
            best_score: entry.best_score,
            avg_score: entry.evaluated_count > 0 ? +(entry.total_score / entry.evaluated_count).toFixed(1) : null,
            selected_count: entry.selected_count,
            locked_count: entry.locked_count,
            screening_rating_avg,
            latest_used_at: entry.latest_used_at,
            clips
          };
        })
        .sort((a, b) => {
          if (a.best_score == null && b.best_score == null) {
            if (b.evaluated_count !== a.evaluated_count) return b.evaluated_count - a.evaluated_count;
            return b.branch_count - a.branch_count;
          }
          if (a.best_score == null) return 1;
          if (b.best_score == null) return -1;
          if (b.best_score !== a.best_score) return b.best_score - a.best_score;
          if ((b.avg_score ?? -1) !== (a.avg_score ?? -1)) return (b.avg_score ?? -1) - (a.avg_score ?? -1);
          return b.evaluated_count - a.evaluated_count;
        });

      res.json({
        summary: {
          seed_count: seeds.length,
          evaluated_seed_count: seeds.filter(seed => seed.evaluated_count > 0).length,
          proven_seed_count: seeds.filter(seed => (seed.best_score ?? 0) >= 65 || seed.locked_count > 0).length,
          selected_seed_count: seeds.filter(seed => seed.selected_count > 0).length
        },
        seeds
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/seeds/:seed
   *
   * Detailed drilldown for one seed:
   * - branch-level performance
   * - clip coverage
   * - score progression by branch
   * - rope effectiveness from evaluated consecutive pairs
   * - screening history summary
   */
  router.get('/seeds/:seed', async (req, res) => {
    try {
      const seed = Number(req.params.seed);
      if (!Number.isFinite(seed)) {
        return res.status(400).json({ error: 'Seed must be a number' });
      }

      const clips = await store.list('clips');
      const branches = await store.list('branches', b => Number(b.seed) === seed);
      const iterations = await store.list('iterations');
      const evaluations = await store.list('evaluations');
      const seedScreens = await store.list('seed_screens', s => Number(s.seed) === seed);

      const activeBranches = branches.filter(b => b.seed !== -1 && b.seed !== '-1');
      if (activeBranches.length === 0 && seedScreens.length === 0) {
        return res.status(404).json({ error: `No data found for seed ${seed}` });
      }

      const evalById = Object.fromEntries(evaluations.map(e => [e.id, e]));
      const clipById = Object.fromEntries(clips.map(c => [c.id, c]));
      const branchIds = new Set(activeBranches.map(b => b.id));

      const branchIterations = iterations
        .filter(i => i.branch_id && branchIds.has(i.branch_id))
        .sort((a, b) => a.iteration_number - b.iteration_number);

      const itersByBranch = {};
      for (const iter of branchIterations) {
        if (!itersByBranch[iter.branch_id]) itersByBranch[iter.branch_id] = [];
        itersByBranch[iter.branch_id].push(iter);
      }

      const clipMap = new Map();
      const characterSet = new Set();

      for (const branch of activeBranches) {
        const clip = clipById[branch.clip_id];
        if (!clip) continue;
        for (const char of (clip.characters || [])) characterSet.add(char);
        if (!clipMap.has(clip.id)) {
          clipMap.set(clip.id, {
            clip_id: clip.id,
            clip_name: clip.name,
            characters: [...(clip.characters || [])],
            statuses: new Set([clip.status]),
            branch_count: 0,
            iteration_count: 0,
            evaluated_count: 0,
            best_score: null
          });
        }
        const entry = clipMap.get(clip.id);
        entry.branch_count++;
      }

      for (const screen of seedScreens) {
        const clip = clipById[screen.clip_id];
        if (!clip) continue;
        for (const char of (clip.characters || [])) characterSet.add(char);
        if (!clipMap.has(clip.id)) {
          clipMap.set(clip.id, {
            clip_id: clip.id,
            clip_name: clip.name,
            characters: [...(clip.characters || [])],
            statuses: new Set([clip.status]),
            branch_count: 0,
            iteration_count: 0,
            evaluated_count: 0,
            best_score: null
          });
        } else {
          clipMap.get(clip.id).statuses.add(clip.status);
        }
      }

      let bestScore = null;
      let totalScore = 0;
      let evaluatedCount = 0;
      let latestUsedAt = null;
      const grandScores = [];
      const identityScores = [];
      const locationScores = [];
      const motionScores = [];
      const dimensionTotals = {
        identity: { sum: 0, count: 0 },
        location: { sum: 0, count: 0 },
        motion: { sum: 0, count: 0 }
      };
      const traitDefinitions = [
        { key: 'age_regression', label: 'Age regression tendency', keywords: ['younger', 'age', 'youth', 'teen', 'child'] },
        { key: 'body_drift', label: 'Body-type drift tendency', keywords: ['body', 'weight', 'heavier', 'lean', 'muscle', 'build'] },
        { key: 'accessory_generation', label: 'Accessory generation tendency', keywords: ['accessory', 'hat', 'glasses', 'jewelry', 'necklace', 'earring'] },
        { key: 'identity_drift', label: 'Identity drift tendency', keywords: ['identity', 'off-model', 'off model', 'drift', 'face mismatch'] }
      ];
      const traitCounts = Object.fromEntries(traitDefinitions.map(def => [def.key, 0]));

      const branchesDetail = activeBranches.map(branch => {
        const branchIters = (itersByBranch[branch.id] || []).sort((a, b) => a.iteration_number - b.iteration_number);
        const clip = clipById[branch.clip_id];
        let branchBest = null;
        let branchTotal = 0;
        let branchEvalCount = 0;
        let lastScore = null;
        let lastIterationNumber = null;
        let branchLatestAt = branch.updated_at || branch.created_at || null;

        for (const iter of branchIters) {
          const clipEntry = clipMap.get(iter.clip_id);
          if (clipEntry) clipEntry.iteration_count++;

          const ts = iter.updated_at || iter.created_at || null;
          if (ts && (!latestUsedAt || ts > latestUsedAt)) latestUsedAt = ts;
          if (ts && (!branchLatestAt || ts > branchLatestAt)) branchLatestAt = ts;

          const score = iter.evaluation_id ? evalById[iter.evaluation_id]?.scores?.grand_total : null;
          if (score != null) {
            const evalRecord = evalById[iter.evaluation_id];
            evaluatedCount++;
            totalScore += score;
            grandScores.push(score);
            if (bestScore == null || score > bestScore) bestScore = score;
            if (branchBest == null || score > branchBest) branchBest = score;
            branchTotal += score;
            branchEvalCount++;
            lastScore = score;
            lastIterationNumber = iter.iteration_number;

            const identity = evalRecord?.scores?.identity?.total;
            const location = evalRecord?.scores?.location?.total;
            const motion = evalRecord?.scores?.motion?.total;
            if (identity != null) {
              dimensionTotals.identity.sum += identity;
              dimensionTotals.identity.count++;
              identityScores.push(identity);
            }
            if (location != null) {
              dimensionTotals.location.sum += location;
              dimensionTotals.location.count++;
              locationScores.push(location);
            }
            if (motion != null) {
              dimensionTotals.motion.sum += motion;
              dimensionTotals.motion.count++;
              motionScores.push(motion);
            }

            const noteBlob = [
              evalRecord?.qualitative_notes || '',
              evalRecord?.attribution?.lowest_element || '',
              evalRecord?.attribution?.next_change_description || ''
            ].join(' ').toLowerCase();
            for (const traitDef of traitDefinitions) {
              if (traitDef.keywords.some(keyword => noteBlob.includes(keyword))) {
                traitCounts[traitDef.key] += 1;
              }
            }

            if (clipEntry) {
              clipEntry.evaluated_count++;
              if (clipEntry.best_score == null || score > clipEntry.best_score) {
                clipEntry.best_score = score;
              }
            }
          }
        }

        return {
          branch_id: branch.id,
          branch_name: branch.name,
          clip_id: branch.clip_id,
          clip_name: clip?.name || 'Unknown clip',
          status: branch.status,
          created_from: branch.created_from,
          iteration_count: branchIters.length,
          evaluated_count: branchEvalCount,
          best_score: branchBest,
          avg_score: branchEvalCount > 0 ? +(branchTotal / branchEvalCount).toFixed(1) : null,
          last_score: lastScore,
          last_iteration_number: lastIterationNumber,
          last_used_at: branchLatestAt
        };
      }).sort((a, b) => {
        if (a.best_score == null && b.best_score == null) return a.branch_name.localeCompare(b.branch_name);
        if (a.best_score == null) return 1;
        if (b.best_score == null) return -1;
        return b.best_score - a.best_score;
      });

      const scoreProgression = branchesDetail.map(branch => {
        const points = (itersByBranch[branch.branch_id] || [])
          .map(iter => ({
            iteration_number: iter.iteration_number,
            score: iter.evaluation_id ? evalById[iter.evaluation_id]?.scores?.grand_total ?? null : null
          }));
        return {
          branch_id: branch.branch_id,
          branch_name: branch.branch_name,
          clip_name: branch.clip_name,
          points
        };
      });

      const ropeImpacts = {};
      for (const branchIters of Object.values(itersByBranch)) {
        const ordered = [...branchIters].sort((a, b) => a.iteration_number - b.iteration_number);
        for (let idx = 1; idx < ordered.length; idx++) {
          const prev = ordered[idx - 1];
          const curr = ordered[idx];
          const prevScore = prev.evaluation_id ? evalById[prev.evaluation_id]?.scores?.grand_total : null;
          const currScore = curr.evaluation_id ? evalById[curr.evaluation_id]?.scores?.grand_total : null;
          if (prevScore == null || currScore == null) continue;
          const rope = curr.evaluation_id ? evalById[curr.evaluation_id]?.attribution?.rope || 'unknown' : 'unknown';
          const delta = currScore - prevScore;
          if (!ropeImpacts[rope]) {
            ropeImpacts[rope] = { rope, count: 0, total_delta: 0, positive_count: 0 };
          }
          ropeImpacts[rope].count++;
          ropeImpacts[rope].total_delta += delta;
          if (delta > 0) ropeImpacts[rope].positive_count++;
        }
      }

      const ROPE_LABELS = {
        rope_1_prompt_position: 'Rope 1 - Prompt Position',
        rope_2_attention_weighting: 'Rope 2 - Attention Weighting',
        rope_3_lora_multipliers: 'Rope 3 - LoRA Multipliers',
        rope_4a_cfg_high: 'Rope 4a - CFG High Noise',
        rope_4b_cfg_low: 'Rope 4b - CFG Low Noise',
        rope_5_steps_skipping: 'Rope 5 - Steps Skipping',
        rope_6_alt_prompt: 'Rope 6 - Alt Prompt',
        bonus_flow_shift: 'Bonus - flow_shift',
        bonus_nag_scale: 'Bonus - NAG_scale',
        bonus_sample_solver: 'Bonus - sample_solver',
        multiple: 'Multiple ropes'
      };

      const ropeEffectiveness = Object.values(ropeImpacts)
        .map(item => ({
          rope: item.rope,
          label: ROPE_LABELS[item.rope] || item.rope,
          count: item.count,
          avg_delta: item.count > 0 ? +(item.total_delta / item.count).toFixed(2) : 0,
          success_rate: item.count > 0 ? +((item.positive_count / item.count) * 100).toFixed(0) : 0
        }))
        .sort((a, b) => b.avg_delta - a.avg_delta);

      const screening = {
        count: seedScreens.length,
        selected_count: seedScreens.filter(s => s.selected).length,
        rating_avg: seedScreens.filter(s => s.rating != null).length > 0
          ? +(
            seedScreens.filter(s => s.rating != null).reduce((sum, screen) => sum + screen.rating, 0) /
            seedScreens.filter(s => s.rating != null).length
          ).toFixed(1)
          : null,
        screens: seedScreens
          .map(screen => ({
            id: screen.id,
            clip_id: screen.clip_id,
            clip_name: clipById[screen.clip_id]?.name || 'Unknown clip',
            selected: !!screen.selected,
            rating: screen.rating ?? null,
            created_at: screen.created_at ?? null
          }))
          .sort((a, b) => {
            if (a.selected && !b.selected) return -1;
            if (!a.selected && b.selected) return 1;
            return (b.created_at || '').localeCompare(a.created_at || '');
          })
      };

      const dimensionAverages = {
        identity: dimensionTotals.identity.count > 0 ? +(dimensionTotals.identity.sum / dimensionTotals.identity.count).toFixed(1) : null,
        location: dimensionTotals.location.count > 0 ? +(dimensionTotals.location.sum / dimensionTotals.location.count).toFixed(1) : null,
        motion: dimensionTotals.motion.count > 0 ? +(dimensionTotals.motion.sum / dimensionTotals.motion.count).toFixed(1) : null
      };

      const traitSignals = traitDefinitions
        .map(def => {
          const count = traitCounts[def.key] || 0;
          const prevalence = evaluatedCount > 0 ? +((count / evaluatedCount) * 100).toFixed(0) : 0;
          let confidence = 'low';
          if (count >= 4 || prevalence >= 60) confidence = 'high';
          else if (count >= 2 || prevalence >= 35) confidence = 'medium';
          return {
            key: def.key,
            label: def.label,
            count,
            prevalence,
            confidence
          };
        })
        .filter(signal => signal.count > 0)
        .sort((a, b) => b.prevalence - a.prevalence);

      const stability = {
        grand_stddev: stddev(grandScores),
        identity_stddev: stddev(identityScores),
        location_stddev: stddev(locationScores),
        motion_stddev: stddev(motionScores)
      };

      const topRope = ropeEffectiveness[0] || null;
      let recommendation = 'Keep collecting evidence on this seed before committing more iteration budget.';
      if (evaluatedCount === 0) {
        recommendation = 'Run at least one evaluated branch to establish a reliable baseline for this seed.';
      } else if ((bestScore ?? 0) >= 65) {
        recommendation = 'This seed is already producing lock-level outcomes; prioritize rollout on similar clips.';
      } else if (topRope && topRope.avg_delta > 0) {
        recommendation = `Best observed lever so far is ${topRope.label} (${topRope.avg_delta > 0 ? '+' : ''}${topRope.avg_delta} avg delta).`;
      } else if (screening.selected_count > 0) {
        recommendation = 'This seed wins screenings but has weak iteration gains; test an alternate rope strategy before retiring it.';
      }

      const clipsDetail = [...clipMap.values()]
        .map(clip => ({ ...clip, statuses: [...clip.statuses].sort() }))
        .sort((a, b) => {
          if (a.best_score == null && b.best_score == null) return a.clip_name.localeCompare(b.clip_name);
          if (a.best_score == null) return 1;
          if (b.best_score == null) return -1;
          return b.best_score - a.best_score;
        });
      const personalityProfile = await getLatestSeedPersonalityProfile(seed);

      res.json({
        seed,
        summary: {
          branch_count: activeBranches.length,
          clip_count: clipsDetail.length,
          character_names: [...characterSet].sort(),
          iteration_count: branchIterations.length,
          evaluated_count: evaluatedCount,
          best_score: bestScore,
          avg_score: evaluatedCount > 0 ? +(totalScore / evaluatedCount).toFixed(1) : null,
          dimension_averages: dimensionAverages,
          locked_count: activeBranches.filter(b => b.status === 'locked').length,
          latest_used_at: latestUsedAt
        },
        clips: clipsDetail,
        branches: branchesDetail,
        rope_effectiveness: ropeEffectiveness,
        score_progression: scoreProgression,
        screening,
        personality_profile: personalityProfile,
        insights: {
          recommendation,
          top_rope: topRope,
          trait_signals: traitSignals,
          stability
        }
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * GET /api/analytics/seeds/:seed/personality-profile/status
   *
   * Returns async job state plus latest persisted profile (if any).
   */
  router.get('/seeds/:seed/personality-profile/status', async (req, res) => {
    try {
      const seed = Number(req.params.seed);
      if (!Number.isFinite(seed)) {
        return res.status(400).json({ error: 'Seed must be a number' });
      }

      const job = seedPersonalityJobs.get(seed) || null;
      const profile = await getLatestSeedPersonalityProfile(seed);
      if (!job && !profile) {
        return res.status(404).json({ error: `No profile job or profile found for seed ${seed}` });
      }

      res.json({
        seed,
        job,
        profile,
        status: job?.status || (profile ? 'completed' : 'idle')
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * POST /api/analytics/seeds/:seed/personality-profile
   *
   * Starts an async Vision-powered profiling job over seed-screen outputs.
   * Returns quickly with job metadata; clients poll the status endpoint.
   * Fast path: returns cached profile immediately when force=false.
   */
  router.post('/seeds/:seed/personality-profile', async (req, res) => {
    try {
      const seed = Number(req.params.seed);
      if (!Number.isFinite(seed)) {
        return res.status(400).json({ error: 'Seed must be a number' });
      }

      const force = !!req.body?.force;
      const maxSamples = Math.min(Math.max(Number(req.body?.max_samples) || 6, 1), 12);

      if (!force) {
        const latest = await getLatestSeedPersonalityProfile(seed);
        if (latest) {
          return res.json({
            seed,
            cached: true,
            status: 'completed',
            profile: latest
          });
        }
      }

      const existingJob = seedPersonalityJobs.get(seed);
      if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
        return res.status(202).json({
          seed,
          queued: false,
          status: existingJob.status,
          job: existingJob
        });
      }

      const visionStatus = await checkVisionApi();
      if (!visionStatus.available) {
        return res.status(503).json({ error: `Vision API unavailable: ${visionStatus.reason || 'not configured'}` });
      }

      const job = {
        id: `seed-profile-${seed}-${Date.now()}`,
        seed,
        status: 'queued',
        force,
        max_samples: maxSamples,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        error: null,
        profile_id: null
      };
      seedPersonalityJobs.set(seed, job);

      void (async () => {
        try {
          job.status = 'running';
          job.started_at = new Date().toISOString();
          const profile = await buildSeedPersonalityProfile(seed, maxSamples);
          job.status = 'completed';
          job.completed_at = new Date().toISOString();
          job.profile_id = profile.id;
        } catch (err) {
          job.status = 'failed';
          job.completed_at = new Date().toISOString();
          job.error = err.message;
        }
      })();

      res.status(202).json({
        seed,
        queued: true,
        status: job.status,
        job
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}

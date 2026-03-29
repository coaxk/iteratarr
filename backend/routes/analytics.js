import { Router } from 'express';

/**
 * Analytics routes — cross-branch analysis for a clip.
 *
 * Provides aggregated views across all branches: score progressions,
 * seed effectiveness rankings, settings correlations, and side-by-side
 * branch comparisons. All data is derived from existing iteration and
 * evaluation records — no new collections needed.
 */
export function createAnalyticsRoutes(store) {
  const router = Router();

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

  return router;
}

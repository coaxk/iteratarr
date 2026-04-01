/**
 * Iteration History — builds ancestor chains and analyzes scoring patterns.
 *
 * Used by chain-aware Vision scoring (#40) to inject iteration history
 * into the scoring prompt, enabling the model to avoid repeating failed
 * strategies and diversify rope selection.
 */

/**
 * Walk the parent_iteration_id chain from a given iteration back to the root.
 * Returns an ordered array (oldest first) of ancestor records with evaluations loaded.
 *
 * @param {object} store — data store instance
 * @param {string} iterationId — starting iteration ID
 * @param {number} maxDepth — maximum chain depth (default 30)
 * @returns {Array} — ancestor chain, oldest first
 */
export async function buildAncestorChain(store, iterationId, maxDepth = 30) {
  const chain = [];
  let currentId = iterationId;
  const seen = new Set();

  while (currentId && chain.length < maxDepth) {
    if (seen.has(currentId)) break; // circular reference guard
    seen.add(currentId);

    try {
      const iter = await store.get('iterations', currentId);
      const entry = {
        id: iter.id,
        iteration_number: iter.iteration_number,
        change_from_parent: iter.change_from_parent || null,
        seed: iter.json_contents?.seed || null,
        evaluation: null
      };

      // Load evaluation if exists
      if (iter.evaluation) {
        entry.evaluation = iter.evaluation;
      } else if (iter.evaluation_id) {
        try {
          entry.evaluation = await store.get('evaluations', iter.evaluation_id);
        } catch {}
      }

      chain.unshift(entry); // prepend — building oldest-first order
      currentId = iter.parent_iteration_id;
    } catch {
      break; // iteration not found
    }
  }

  return chain;
}

/**
 * Analyze an ancestor chain for scoring patterns.
 *
 * Detects: stuck fields, oscillating fields, rope distribution,
 * underused ropes, score trends.
 *
 * @param {Array} chain — ancestor chain from buildAncestorChain (oldest first)
 * @returns {object} — pattern analysis
 */
export function analyzeHistory(chain) {
  const summary = [];
  let prevScore = null;

  for (const entry of chain) {
    if (!entry.evaluation?.scores) continue;

    const scores = entry.evaluation.scores;
    const grandTotal =
      Object.values(scores.identity || {}).reduce((s, v) => s + v, 0) +
      Object.values(scores.location || {}).reduce((s, v) => s + v, 0) +
      Object.values(scores.motion || {}).reduce((s, v) => s + v, 0);

    const attr = entry.evaluation.attribution || {};
    const target = attr.lowest_element || null;
    const rope = attr.rope || null;
    const delta = prevScore !== null ? grandTotal - prevScore : null;

    summary.push({
      iter: entry.iteration_number,
      id: entry.id,
      score: grandTotal,
      target,
      rope,
      delta,
      change: entry.change_from_parent
    });

    prevScore = grandTotal;
  }

  if (summary.length === 0) return { summary: [], patterns: null };

  // Detect stuck fields: same field targeted 2+ consecutive times without improvement
  const stuckFields = [];
  let runField = null;
  let runRopes = [];
  let runStart = 0;
  let runStartScore = 0;

  for (let i = 0; i < summary.length; i++) {
    const s = summary[i];
    if (s.target === runField && runField !== null) {
      runRopes.push(s.rope);
      // Check if stuck: field hasn't improved from run start
      if (i === summary.length - 1 || summary[i + 1]?.target !== runField) {
        const attempts = i - runStart + 1;
        if (attempts >= 2) {
          // Find the field's score at start and end of the run
          const fieldScoreNow = getFieldScore(chain[i]?.evaluation?.scores, runField);
          const fieldScoreStart = getFieldScore(chain[runStart]?.evaluation?.scores, runField);
          const improved = fieldScoreNow !== null && fieldScoreStart !== null && fieldScoreNow > fieldScoreStart;
          if (!improved) {
            stuckFields.push({
              field: runField,
              attempts,
              ropes_tried: [...runRopes],
              net_score_delta: s.score - runStartScore
            });
          }
        }
      }
    } else {
      runField = s.target;
      runRopes = [s.rope];
      runStart = i;
      runStartScore = s.score;
    }
  }

  // Detect oscillating fields: fields that go up-down-up across the chain
  const allFields = [
    'face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency',
    'location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct',
    'action_executed', 'smoothness', 'camera_movement'
  ];
  const oscillatingFields = [];
  for (const field of allFields) {
    const fieldScores = chain
      .filter(e => e.evaluation?.scores)
      .map(e => getFieldScore(e.evaluation.scores, field))
      .filter(v => v !== null);
    if (fieldScores.length >= 3) {
      let directionChanges = 0;
      for (let i = 1; i < fieldScores.length - 1; i++) {
        const prev = fieldScores[i] - fieldScores[i - 1];
        const next = fieldScores[i + 1] - fieldScores[i];
        if ((prev > 0 && next < 0) || (prev < 0 && next > 0)) directionChanges++;
      }
      if (directionChanges >= 2) {
        oscillatingFields.push({ field, scores: fieldScores, changes: directionChanges });
      }
    }
  }

  // Rope distribution
  const ropeDistribution = {};
  const allRopes = ['rope_1', 'rope_2a', 'rope_2b', 'rope_3', 'rope_4', 'rope_4a', 'rope_4b', 'rope_5', 'rope_6'];
  for (const r of allRopes) ropeDistribution[r] = 0;
  for (const s of summary) {
    if (s.rope) {
      // Normalize rope names
      const normalized = s.rope.replace(/_prompt_position|_attention_weighting|_negative_prompt|_lora_multipliers|_cfg_high|_cfg_low|_steps_skipping|_alt_prompt/, '');
      ropeDistribution[normalized] = (ropeDistribution[normalized] || 0) + 1;
    }
  }
  const underusedRopes = allRopes.filter(r => (ropeDistribution[r] || 0) === 0 && !['rope_2a', 'rope_2b'].includes(r));

  // Score trend (last 3)
  const recentScores = summary.slice(-3).map(s => s.score);
  let scoreTrend = 'unknown';
  if (recentScores.length >= 3) {
    const range = Math.max(...recentScores) - Math.min(...recentScores);
    if (range <= 1) scoreTrend = 'plateau';
    else if (recentScores[2] > recentScores[0]) scoreTrend = 'improving';
    else scoreTrend = 'declining';
  }

  const bestEntry = summary.reduce((best, s) => s.score > (best?.score || 0) ? s : best, null);

  return {
    summary,
    patterns: {
      stuck_fields: stuckFields,
      oscillating_fields: oscillatingFields,
      rope_distribution: ropeDistribution,
      underused_ropes: underusedRopes,
      score_trend: scoreTrend,
      best_score: bestEntry ? { iter: bestEntry.iter, score: bestEntry.score } : null,
      current_score: summary.length > 0 ? summary[summary.length - 1].score : null,
      total_iterations: summary.length
    }
  };
}

/**
 * Format iteration history for injection into the Vision scoring prompt.
 * Kept compact to minimize token usage (~450 tokens for 15 iterations).
 *
 * @param {object} history — output of analyzeHistory()
 * @returns {string} — formatted prompt text
 */
export function formatHistoryForPrompt(history) {
  if (!history?.summary?.length) return '';

  const lines = [];

  // Iteration summary (last 10 max to control token budget)
  const recent = history.summary.slice(-10);
  lines.push('Previous iterations (oldest first):');
  for (const s of recent) {
    const delta = s.delta !== null ? (s.delta >= 0 ? `+${s.delta}` : `${s.delta}`) : 'baseline';
    const ropeShort = s.rope ? s.rope.replace(/_prompt_position|_attention_weighting|_negative_prompt|_lora_multipliers|_cfg_high|_cfg_low|_steps_skipping|_alt_prompt/, '') : '?';
    lines.push(`  #${s.iter}: ${s.score}/75, targeted ${s.target || 'none'} via ${ropeShort} → ${delta}`);
  }

  // Warnings (conditional)
  const warnings = [];
  const p = history.patterns;

  if (p?.stuck_fields?.length > 0) {
    for (const sf of p.stuck_fields) {
      const ropesUsed = [...new Set(sf.ropes_tried.map(r => r?.replace(/_prompt_position|_attention_weighting|_negative_prompt|_lora_multipliers|_cfg_high|_cfg_low|_steps_skipping|_alt_prompt/, '') || '?'))].join(', ');
      warnings.push(`STUCK: ${sf.field} targeted ${sf.attempts}x via ${ropesUsed} with no improvement. Try a DIFFERENT rope or a DIFFERENT field.`);
    }
  }

  if (p?.underused_ropes?.length > 0) {
    const ropeLabels = {
      rope_3: 'LoRA multipliers', rope_4: 'guidance scale',
      rope_4a: 'CFG high', rope_4b: 'CFG low',
      rope_5: 'seed change', rope_6: 'alt prompt'
    };
    const labels = p.underused_ropes.map(r => `${r} (${ropeLabels[r] || r})`).join(', ');
    warnings.push(`UNDERUSED ROPES: ${labels} have never been tried.`);
  }

  if (p?.score_trend === 'plateau') {
    warnings.push('PLATEAU: Score has been flat for 3+ iterations. Consider targeting a different field or using a different rope entirely.');
  }

  if (p?.oscillating_fields?.length > 0) {
    const names = p.oscillating_fields.map(f => f.field).join(', ');
    warnings.push(`OSCILLATING: ${names} — scores fluctuating without consistent improvement. May need a structural change (different rope category) rather than incremental prompt tweaks.`);
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('WARNINGS:');
    for (const w of warnings) lines.push(`- ${w}`);
  }

  // Always include guidance when history has 3+ entries
  if (history.summary.length >= 3) {
    lines.push('');
    lines.push('GUIDANCE: When a field+rope combination has been attempted 2+ times without improvement, you MUST recommend either a different rope for the same field OR a different target field. Diversify your approach. Do not repeat failed strategies.');
  }

  return lines.join('\n');
}

/** Helper: extract a field score from a scores object */
function getFieldScore(scores, field) {
  if (!scores) return null;
  for (const group of ['identity', 'location', 'motion']) {
    if (scores[group]?.[field] !== undefined) return scores[group][field];
  }
  return null;
}

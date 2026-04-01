/**
 * Prompt Intelligence — phrase-level diffing, score delta computation,
 * and phrase effectiveness aggregation across iteration chains.
 */

/**
 * Tokenize a prompt string into normalized phrases.
 * Prompts are comma-delimited phrase lists: "token, description, action"
 */
function tokenize(prompt) {
  if (!prompt) return [];
  return prompt.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Compute phrase-level diff between two prompt strings.
 * Returns { added: string[], removed: string[], unchanged: string[] }
 */
export function diffPrompts(oldPrompt, newPrompt) {
  const oldPhrases = tokenize(oldPrompt);
  const newPhrases = tokenize(newPrompt);
  const oldSet = new Set(oldPhrases);
  const newSet = new Set(newPhrases);

  return {
    added: newPhrases.filter(p => !oldSet.has(p)),
    removed: oldPhrases.filter(p => !newSet.has(p)),
    unchanged: newPhrases.filter(p => oldSet.has(p))
  };
}

// --- Score Delta ---

const ALL_FIELDS = [
  'face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow',
  'skin_texture', 'hair', 'frame_consistency',
  'location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct',
  'action_executed', 'smoothness', 'camera_movement'
];

const CATEGORY_MAP = {
  face_match: 'identity', head_shape: 'identity', jaw: 'identity',
  cheekbones: 'identity', eyes_brow: 'identity', skin_texture: 'identity',
  hair: 'identity', frame_consistency: 'identity',
  location_correct: 'location', lighting_correct: 'location',
  wardrobe_correct: 'location', geometry_correct: 'location',
  action_executed: 'motion', smoothness: 'motion', camera_movement: 'motion'
};

/**
 * Compute per-field score deltas between parent and child evaluations.
 * Returns { field_deltas: { [field]: number }, grand_total_delta: number } or null.
 */
export function computeFieldDeltas(parentEval, childEval) {
  if (!parentEval?.scores || !childEval?.scores) return null;

  const field_deltas = {};
  for (const field of ALL_FIELDS) {
    const cat = CATEGORY_MAP[field];
    const parentVal = parentEval.scores[cat]?.[field] ?? 0;
    const childVal = childEval.scores[cat]?.[field] ?? 0;
    field_deltas[field] = childVal - parentVal;
  }

  const parentTotal = parentEval.scores.grand_total ?? 0;
  const childTotal = childEval.scores.grand_total ?? 0;

  return { field_deltas, grand_total_delta: childTotal - parentTotal };
}

// --- Phrase Effectiveness Aggregation ---

const PROMPT_ROPES = new Set([
  'rope_1', 'rope_1_prompt_position',
  'rope_2a_attention_weighting',
  'rope_2b_negative_prompt',
  'rope_6_alt_prompt'
]);

/**
 * Aggregate prompt phrase effectiveness across an iteration chain.
 * Chain must be sorted by iteration_number ascending.
 */
export function aggregatePhraseEffectiveness(chain) {
  const iterations = [];
  const phraseMap = new Map();

  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1];
    const child = chain[i];

    const promptDiff = diffPrompts(
      parent.json_contents?.prompt,
      child.json_contents?.prompt
    );
    const negativeDiff = diffPrompts(
      parent.json_contents?.negative_prompt,
      child.json_contents?.negative_prompt
    );

    const scoreDelta = computeFieldDeltas(parent.evaluation, child.evaluation);
    const rope = child.evaluation?.attribution?.rope;
    const isPromptRope = PROMPT_ROPES.has(rope);
    const hasPromptChange = promptDiff.added.length > 0 || promptDiff.removed.length > 0 ||
                            negativeDiff.added.length > 0 || negativeDiff.removed.length > 0;

    let confidence = 'high';
    if (!isPromptRope && hasPromptChange) confidence = 'mixed';
    if (!hasPromptChange) confidence = 'no_prompt_change';

    iterations.push({
      iteration_number: child.iteration_number,
      iteration_id: child.id,
      prompt_diff: promptDiff,
      negative_diff: negativeDiff,
      field_deltas: scoreDelta?.field_deltas || null,
      grand_total_delta: scoreDelta?.grand_total_delta ?? null,
      rope,
      confidence
    });

    const trackPhrases = (diff, field) => {
      for (const phrase of diff.added) {
        if (!phraseMap.has(`${field}:${phrase}`)) {
          phraseMap.set(`${field}:${phrase}`, {
            phrase,
            field,
            added_at_iteration: child.iteration_number,
            score_delta_on_add: scoreDelta?.grand_total_delta ?? 0,
            field_deltas_on_add: scoreDelta?.field_deltas || {}
          });
        }
      }
    };
    trackPhrases(promptDiff, 'prompt');
    trackPhrases(negativeDiff, 'negative_prompt');
  }

  const phrases = [];
  for (const [, data] of phraseMap) {
    const correlations = [];
    for (const [field, delta] of Object.entries(data.field_deltas_on_add)) {
      if (delta !== 0) correlations.push({ field, delta });
    }
    correlations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    phrases.push({
      phrase: data.phrase,
      field: data.field,
      added_at_iteration: data.added_at_iteration,
      avg_score_delta_on_add: data.score_delta_on_add,
      field_correlations: correlations.slice(0, 5)
    });
  }

  phrases.sort((a, b) => Math.abs(b.avg_score_delta_on_add) - Math.abs(a.avg_score_delta_on_add));

  return { iterations, phrases };
}

import { describe, it, expect } from 'vitest';
import { diffPrompts, computeFieldDeltas, aggregatePhraseEffectiveness } from '../prompt-diff.js';

describe('diffPrompts', () => {
  it('returns empty diff for identical prompts', () => {
    const result = diffPrompts('a, b, c', 'a, b, c');
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toEqual(['a', 'b', 'c']);
  });

  it('detects added phrases', () => {
    const result = diffPrompts('a, b', 'a, b, c, d');
    expect(result.added).toEqual(['c', 'd']);
    expect(result.removed).toEqual([]);
    expect(result.unchanged).toEqual(['a', 'b']);
  });

  it('detects removed phrases', () => {
    const result = diffPrompts('a, b, c', 'a, c');
    expect(result.removed).toEqual(['b']);
    expect(result.added).toEqual([]);
  });

  it('detects both added and removed', () => {
    const result = diffPrompts('a, b, c', 'a, c, d');
    expect(result.added).toEqual(['d']);
    expect(result.removed).toEqual(['b']);
  });

  it('handles empty strings', () => {
    expect(diffPrompts('', '').added).toEqual([]);
    expect(diffPrompts('', 'a, b').added).toEqual(['a', 'b']);
    expect(diffPrompts('a, b', '').removed).toEqual(['a', 'b']);
  });

  it('handles null/undefined', () => {
    expect(diffPrompts(null, 'a').added).toEqual(['a']);
    expect(diffPrompts('a', undefined).removed).toEqual(['a']);
  });

  it('trims whitespace from phrases', () => {
    const result = diffPrompts('a , b,  c', 'a, b, c, d');
    expect(result.added).toEqual(['d']);
    expect(result.removed).toEqual([]);
  });
});

describe('computeFieldDeltas', () => {
  const parentEval = {
    scores: {
      identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 3, eyes_brow: 4, skin_texture: 3, hair: 4, frame_consistency: 4 },
      location: { location_correct: 3, lighting_correct: 4, wardrobe_correct: 3, geometry_correct: 4 },
      motion: { action_executed: 3, smoothness: 4, camera_movement: 3 },
      grand_total: 54
    }
  };

  const childEval = {
    scores: {
      identity: { face_match: 5, head_shape: 3, jaw: 4, cheekbones: 3, eyes_brow: 4, skin_texture: 3, hair: 4, frame_consistency: 4 },
      location: { location_correct: 3, lighting_correct: 4, wardrobe_correct: 4, geometry_correct: 4 },
      motion: { action_executed: 3, smoothness: 4, camera_movement: 3 },
      grand_total: 56
    }
  };

  it('computes per-field deltas', () => {
    const result = computeFieldDeltas(parentEval, childEval);
    expect(result.field_deltas.face_match).toBe(1);
    expect(result.field_deltas.wardrobe_correct).toBe(1);
    expect(result.field_deltas.camera_movement).toBe(0);
    expect(result.grand_total_delta).toBe(2);
  });

  it('returns null when parent has no evaluation', () => {
    const result = computeFieldDeltas(null, childEval);
    expect(result).toBeNull();
  });

  it('returns null when child has no evaluation', () => {
    const result = computeFieldDeltas(parentEval, null);
    expect(result).toBeNull();
  });
});

describe('aggregatePhraseEffectiveness', () => {
  const chain = [
    {
      id: 'iter1',
      iteration_number: 1,
      json_contents: { prompt: 'mckdhn, older man, balcony', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 3 }, location: {}, motion: {}, grand_total: 50 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: null
    },
    {
      id: 'iter2',
      iteration_number: 2,
      json_contents: { prompt: 'mckdhn, older man, balcony, natural expression', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 4 }, location: {}, motion: {}, grand_total: 53 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: 'iter1'
    },
    {
      id: 'iter3',
      iteration_number: 3,
      json_contents: { prompt: 'mckdhn, older man, balcony, natural expression, outdoor light', negative_prompt: 'blurry' },
      evaluation: {
        scores: { identity: { face_match: 5 }, location: {}, motion: {}, grand_total: 55 },
        attribution: { rope: 'rope_1' }
      },
      parent_iteration_id: 'iter2'
    }
  ];

  it('tracks phrase additions and score deltas', () => {
    const result = aggregatePhraseEffectiveness(chain);
    const natExp = result.phrases.find(p => p.phrase === 'natural expression');
    expect(natExp).toBeDefined();
    expect(natExp.added_at_iteration).toBe(2);
    expect(natExp.avg_score_delta_on_add).toBe(3);
  });

  it('returns empty for single iteration', () => {
    const result = aggregatePhraseEffectiveness([chain[0]]);
    expect(result.phrases).toEqual([]);
  });

  it('flags confidence based on rope', () => {
    const result = aggregatePhraseEffectiveness(chain);
    expect(result.iterations[0].confidence).toBe('high');
  });

  it('flags non-prompt rope changes as mixed', () => {
    const mixedChain = [
      chain[0],
      {
        ...chain[1],
        evaluation: {
          ...chain[1].evaluation,
          attribution: { rope: 'rope_3_lora_multipliers' }
        }
      }
    ];
    const result = aggregatePhraseEffectiveness(mixedChain);
    expect(result.iterations[0].confidence).toBe('mixed');
  });

  it('flags no prompt change iterations', () => {
    const noChangeChain = [
      chain[0],
      {
        ...chain[1],
        json_contents: { ...chain[0].json_contents }
      }
    ];
    const result = aggregatePhraseEffectiveness(noChangeChain);
    expect(result.iterations[0].confidence).toBe('no_prompt_change');
  });
});

import { describe, it, expect } from 'vitest';
import { validateProject, validateClip, validateEvaluation, validateCharacter } from '../store/validators.js';

describe('Validators', () => {
  it('validates a project', () => {
    expect(() => validateProject({ name: 'Test' })).not.toThrow();
    expect(() => validateProject({})).toThrow('name is required');
  });

  it('validates a clip', () => {
    expect(() => validateClip({ scene_id: 's1', name: 'Clip 1' })).not.toThrow();
    expect(() => validateClip({ name: 'Clip 1' })).toThrow('scene_id is required');
  });

  it('validates clip status values', () => {
    expect(() => validateClip({ scene_id: 's1', name: 'C', status: 'locked' })).not.toThrow();
    expect(() => validateClip({ scene_id: 's1', name: 'C', status: 'invalid' })).toThrow('Invalid status');
  });

  it('validates evaluation scores are 1-5', () => {
    const valid = {
      iteration_id: 'i1',
      scores: {
        identity: { face_match: 4, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      }
    };
    expect(() => validateEvaluation(valid)).not.toThrow();
  });

  it('rejects evaluation scores outside 1-5', () => {
    const invalid = {
      iteration_id: 'i1',
      scores: {
        identity: { face_match: 6, head_shape: 3, jaw: 4, cheekbones: 4, eyes_brow: 4, skin_texture: 3, hair: 3, frame_consistency: 2 },
        location: { location_correct: 4, lighting_correct: 4, wardrobe_correct: 5, geometry_correct: 3 },
        motion: { action_executed: 3, smoothness: 4, camera_movement: 2 }
      }
    };
    expect(() => validateEvaluation(invalid)).toThrow();
  });

  it('validates a character', () => {
    expect(() => validateCharacter({ name: 'Mick', trigger_word: 'mckdhn' })).not.toThrow();
    expect(() => validateCharacter({ name: 'Mick' })).toThrow('trigger_word is required');
  });
});

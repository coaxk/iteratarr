const CLIP_STATUSES = ['not_started', 'screening', 'in_progress', 'evaluating', 'locked', 'in_queue'];
const MODEL_TYPES = [
  'wan2.2_t2v_14B',
  'wan2.1_t2v_14B',
  'hunyuan_video',
  'ltx_2',
  'flux',
  'other'
];
const IDENTITY_FIELDS = ['face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency'];
const LOCATION_FIELDS = ['location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct'];
const MOTION_FIELDS = ['action_executed', 'smoothness', 'camera_movement'];

function requireField(obj, field, label) {
  if (!obj[field] && obj[field] !== 0) throw new Error(`${label || field} is required`);
}

function validateScoreRange(scores, fields, group) {
  for (const field of fields) {
    const val = scores[field];
    if (val !== undefined && (val < 1 || val > 5)) {
      throw new Error(`${group}.${field} must be between 1 and 5, got ${val}`);
    }
  }
}

export function validateProject(data) {
  requireField(data, 'name', 'name');
}

export function validateClip(data) {
  requireField(data, 'scene_id', 'scene_id');
  requireField(data, 'name', 'name');
  if (data.status && !CLIP_STATUSES.includes(data.status)) {
    throw new Error(`Invalid status: ${data.status}. Must be one of: ${CLIP_STATUSES.join(', ')}`);
  }
}

export function validateIteration(data) {
  requireField(data, 'clip_id', 'clip_id');
}

export function validateEvaluation(data) {
  requireField(data, 'iteration_id', 'iteration_id');
  requireField(data, 'scores', 'scores');
  const { scores } = data;
  if (scores.identity) validateScoreRange(scores.identity, IDENTITY_FIELDS, 'identity');
  if (scores.location) validateScoreRange(scores.location, LOCATION_FIELDS, 'location');
  if (scores.motion) validateScoreRange(scores.motion, MOTION_FIELDS, 'motion');
}

export function validateCharacter(data) {
  requireField(data, 'name', 'name');
  requireField(data, 'trigger_word', 'trigger_word');
}

export { CLIP_STATUSES, IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, MODEL_TYPES };

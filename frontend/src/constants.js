// Ropes — the levers that control Wan2GP output quality.
// Each rope maps to a specific JSON field in the generation parameters.
export const ROPES = [
  { id: 'rope_1_prompt_position', label: 'Rope 1 — Prompt Position', field: 'prompt', description: 'Identity block must appear before location. Every additional word dilutes attention.' },
  { id: 'rope_2_attention_weighting', label: 'Rope 2 — Attention Weighting', field: 'prompt', description: 'Boost identity tokens: (mckdhn:1.3). Reduce competing: (Monaco:0.9). Range: 0.5-1.5' },
  { id: 'rope_3_lora_multipliers', label: 'Rope 3 — LoRA Multipliers', field: 'loras_multipliers', description: 'Phase-aware: "high;low high;low". First=high noise LoRA, second=low noise LoRA.' },
  { id: 'rope_4a_cfg_high', label: 'Rope 4a — CFG High Noise', field: 'guidance_scale', description: 'Prompt adherence in composition pass. Sweet spot: 5.9-6.2' },
  { id: 'rope_4b_cfg_low', label: 'Rope 4b — CFG Low Noise', field: 'guidance2_scale', description: 'Prompt adherence in identity refinement. Default 3, untested above 4.' },
  { id: 'rope_5_steps_skipping', label: 'Rope 5 — Steps Skipping', field: 'skip_steps_cache_type', description: 'Taylor2 for iteration speed. Off for production.' },
  { id: 'rope_6_alt_prompt', label: 'Rope 6 — Alt Prompt', field: 'alt_prompt', description: 'Low noise phase only. Pure identity block when location competes.' },
  { id: 'bonus_flow_shift', label: 'Bonus — flow_shift', field: 'flow_shift', description: 'Temporal coherence. Higher = more stable. Default 12, range 1-20.' },
  { id: 'bonus_nag_scale', label: 'Bonus — NAG_scale', field: 'NAG_scale', description: 'Normalised Attention Guidance. Default 1, range 1-3.' },
  { id: 'bonus_sample_solver', label: 'Bonus — sample_solver', field: 'sample_solver', description: 'Solver algorithm selection.' },
  { id: 'multiple', label: 'Multiple ropes', field: null, description: 'Multiple parameters changed.' }
];

// Score fields — grouped by category for the evaluation panel.
export const IDENTITY_FIELDS = [
  { key: 'face_match', label: 'Face Match Overall' },
  { key: 'head_shape', label: 'Head Shape' },
  { key: 'jaw', label: 'Jaw Line' },
  { key: 'cheekbones', label: 'Cheekbones' },
  { key: 'eyes_brow', label: 'Eyes / Brow' },
  { key: 'skin_texture', label: 'Skin Texture / Age' },
  { key: 'hair', label: 'Hair' },
  { key: 'frame_consistency', label: 'Frame Consistency' }
];

export const LOCATION_FIELDS = [
  { key: 'location_correct', label: 'Location Correct' },
  { key: 'lighting_correct', label: 'Lighting Correct' },
  { key: 'wardrobe_correct', label: 'Wardrobe Correct' },
  { key: 'geometry_correct', label: 'Geometry Correct' }
];

export const MOTION_FIELDS = [
  { key: 'action_executed', label: 'Action Executed' },
  { key: 'smoothness', label: 'Smoothness' },
  { key: 'camera_movement', label: 'Camera Movement' }
];

// Clip statuses with display labels and Tailwind colour classes.
export const CLIP_STATUSES = {
  not_started: { label: 'Not Started', color: 'bg-status-red' },
  in_progress: { label: 'In Progress', color: 'bg-status-yellow' },
  evaluating: { label: 'Evaluating', color: 'bg-status-yellow' },
  locked: { label: 'Locked', color: 'bg-status-green' },
  in_queue: { label: 'In Queue', color: 'bg-status-blue' }
};

// Scoring thresholds
export const SCORE_LOCK_THRESHOLD = 65;
export const GRAND_MAX = 75;

// Settings tiers — which Wan2GP JSON fields to surface at each visibility level.
// Tier 1: always visible in evaluation panel. Directly affect output quality.
// Tier 2: collapsed accordion. Power users reach for these when Tier 1 isn't enough.
// Tier 3: everything else. Preserved silently in JSON generation, never shown.
export const SETTINGS_TIERS = {
  tier1: [
    { key: 'prompt', label: 'Prompt', type: 'text' },
    { key: 'alt_prompt', label: 'Alt Prompt', type: 'text' },
    { key: 'negative_prompt', label: 'Negative Prompt', type: 'text' },
    { key: 'loras_multipliers', label: 'LoRA Multipliers', type: 'text', hint: 'Phase-aware: "high;low high;low"' },
    { key: 'guidance_scale', label: 'CFG High Noise', type: 'number', step: 0.1, hint: 'Sweet spot: 5.9-6.2' },
    { key: 'guidance2_scale', label: 'CFG Low Noise', type: 'number', step: 0.1, hint: 'Default 3' },
    { key: 'film_grain_intensity', label: 'Film Grain', type: 'number', step: 0.01 },
    { key: 'film_grain_saturation', label: 'Grain Saturation', type: 'number', step: 0.1 },
    { key: 'video_length', label: 'Video Length', type: 'number', step: 1, hint: '32 iteration, 81 production' },
    { key: 'seed', label: 'Seed', type: 'number', step: 1 },
    { key: 'num_inference_steps', label: 'Steps', type: 'number', step: 1 },
    { key: 'resolution', label: 'Resolution', type: 'text' },
    { key: 'skip_steps_cache_type', label: 'Steps Skipping', type: 'text', hint: '"Taylor2" for speed, empty for quality' }
  ],
  tier2: [
    { key: 'flow_shift', label: 'Flow Shift', type: 'number', step: 1, hint: 'Temporal coherence. Higher=stable. Default 12, range 1-20' },
    { key: 'NAG_scale', label: 'NAG Scale', type: 'number', step: 0.1, hint: 'Normalised Attention Guidance. Default 1, range 1-3' },
    { key: 'NAG_tau', label: 'NAG Tau', type: 'number', step: 0.1 },
    { key: 'NAG_alpha', label: 'NAG Alpha', type: 'number', step: 0.1 },
    { key: 'sample_solver', label: 'Sample Solver', type: 'text', hint: 'unipc, euler, dpmpp' },
    { key: 'switch_threshold', label: 'Switch Threshold', type: 'number', step: 1 },
    { key: 'perturbation_switch', label: 'Perturbation', type: 'number', step: 1 },
    { key: 'RIFLEx_setting', label: 'RIFLEx', type: 'number', step: 1 },
    { key: 'cfg_star_switch', label: 'CFG Star', type: 'number', step: 1 },
    { key: 'cfg_zero_step', label: 'CFG Zero Step', type: 'number', step: 1 },
    { key: 'apg_switch', label: 'APG Switch', type: 'number', step: 1 }
  ]
  // Tier 3 = everything else. Not listed, preserved silently in JSON generation.
};

// Rope → primary category map — which scoring category each rope primarily affects.
// Used by regression detection to flag unexpected side effects in non-targeted categories.
// 'all' means the rope affects everything (no regression check applies).
export const ROPE_CATEGORY_MAP = {
  rope_1_prompt_position: 'identity',
  rope_2_attention_weighting: 'identity',
  rope_3_lora_multipliers: 'identity',
  rope_4a_cfg_high: 'location',
  rope_4b_cfg_low: 'identity',
  rope_5_steps_skipping: 'all',
  rope_6_alt_prompt: 'identity',
  bonus_flow_shift: 'motion',
  bonus_nag_scale: 'all',
  bonus_sample_solver: 'all',
  multiple: 'all'
};

// Smart rope guidance — maps low-scoring elements to likely rope fixes.
// When a score element is low, these suggestions help users pick the right rope.
export const ROPE_GUIDANCE = {
  // Identity elements
  face_match: [
    { rope: 'rope_2_attention_weighting', hint: 'Boost trigger word weight — e.g. (mckdhn:1.4)' },
    { rope: 'rope_6_alt_prompt', hint: 'Move identity block to alt_prompt so low noise pass focuses entirely on face' },
    { rope: 'rope_3_lora_multipliers', hint: 'Increase low noise LoRA weight for stronger identity lock' }
  ],
  head_shape: [
    { rope: 'rope_3_lora_multipliers', hint: 'Increase high noise LoRA — head shape is set in the composition pass' },
    { rope: 'rope_1_prompt_position', hint: 'Move physical descriptors earlier in prompt for more attention weight' }
  ],
  jaw: [
    { rope: 'rope_3_lora_multipliers', hint: 'Low noise LoRA refines facial structure — increase its weight' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost jaw descriptor weight — e.g. (sharp jaw:1.3)' }
  ],
  cheekbones: [
    { rope: 'rope_3_lora_multipliers', hint: 'Low noise LoRA handles facial detail refinement' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost cheekbone descriptor weight' }
  ],
  eyes_brow: [
    { rope: 'rope_3_lora_multipliers', hint: 'Eye/brow detail is low noise territory — increase low LoRA weight' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost eye descriptors — e.g. (deep set dark eyes:1.3)' },
    { rope: 'rope_6_alt_prompt', hint: 'Dedicate alt_prompt to identity so eye detail gets full low noise attention' }
  ],
  skin_texture: [
    { rope: 'rope_6_alt_prompt', hint: 'Skin detail lives in low noise pass — alt_prompt focuses it on identity' },
    { rope: 'rope_3_lora_multipliers', hint: 'Increase low noise LoRA weight for skin texture refinement' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost age/skin descriptors — e.g. (weathered tanned skin:1.3)' },
    { rope: 'rope_4b_cfg_low', hint: 'Increase low noise CFG for stronger prompt adherence on skin details' }
  ],
  hair: [
    { rope: 'rope_2_attention_weighting', hint: 'Boost hair descriptors — e.g. (short silver grey hair:1.2)' },
    { rope: 'rope_3_lora_multipliers', hint: 'Hair texture is refined in low noise pass — increase low LoRA' },
    { rope: 'rope_1_prompt_position', hint: 'Move hair description closer to trigger word for more attention' }
  ],
  frame_consistency: [
    { rope: 'rope_3_lora_multipliers', hint: 'Stronger LoRA weights lock identity across frames' },
    { rope: 'rope_6_alt_prompt', hint: 'Alt prompt reinforces identity every frame in the low noise pass' },
    { rope: 'bonus_flow_shift', hint: 'Higher flow_shift = more temporal coherence (but less dynamic motion)' },
    { rope: 'rope_4b_cfg_low', hint: 'Higher low noise CFG = more consistent identity refinement per frame' }
  ],
  // Location elements
  location_correct: [
    { rope: 'rope_1_prompt_position', hint: 'Location description may be too far back in prompt — move it forward' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost location tokens — but be careful not to compete with identity' },
    { rope: 'rope_4a_cfg_high', hint: 'Higher CFG = stronger prompt adherence in composition pass (where location is set)' }
  ],
  lighting_correct: [
    { rope: 'rope_2_attention_weighting', hint: 'Boost lighting descriptor weight' },
    { rope: 'rope_4a_cfg_high', hint: 'Lighting is set in composition pass — higher CFG for more adherence' }
  ],
  wardrobe_correct: [
    { rope: 'rope_2_attention_weighting', hint: 'Boost wardrobe descriptor weight' },
    { rope: 'rope_1_prompt_position', hint: 'Move wardrobe description closer to character trigger' }
  ],
  geometry_correct: [
    { rope: 'rope_4a_cfg_high', hint: 'Spatial geometry is composition pass — higher CFG for accuracy' },
    { rope: 'rope_1_prompt_position', hint: 'Ensure spatial descriptors are prominent in prompt' }
  ],
  // Motion elements
  action_executed: [
    { rope: 'rope_1_prompt_position', hint: 'Action description may need more prominence in prompt' },
    { rope: 'rope_4a_cfg_high', hint: 'Higher CFG for stronger action adherence in composition' },
    { rope: 'rope_2_attention_weighting', hint: 'Boost action tokens for more attention' }
  ],
  smoothness: [
    { rope: 'bonus_flow_shift', hint: 'Higher flow_shift = smoother motion (range 1-20, default 12)' },
    { rope: 'bonus_sample_solver', hint: 'Try different solver — unipc vs euler vs dpmpp' }
  ],
  camera_movement: [
    { rope: 'rope_1_prompt_position', hint: 'Camera direction often gets buried — make it prominent' },
    { rope: 'rope_4a_cfg_high', hint: 'Camera movement set in composition — higher CFG helps' }
  ]
};

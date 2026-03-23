/**
 * Telemetry Anonymizer — strips PII from telemetry exports.
 *
 * Keeps: scores, score_deltas, ai_scores, attribution (rope, confidence,
 * lowest_element), scoring_source, model_type, guidance_scale, guidance2_scale,
 * loras_multipliers pattern (not filenames), video_length, seed, flow_shift,
 * NAG_scale, iteration_number, event_type, timestamp, app_version.
 *
 * Removes: all file paths, prompt text, alt_prompt text, negative_prompt text.
 * Replaces: character names with anonymous IDs (character_001, character_002).
 */

// Fields that must never appear in exported telemetry
const PATH_FIELDS = [
  'json_path', 'render_path', 'video_path', 'production_json_path',
  'sidecar_path', 'locked_dir', 'save_path', 'output_dir', 'lora_dir',
  'json_filename', 'output_filename'
];

const PROMPT_FIELDS = [
  'prompt', 'alt_prompt', 'negative_prompt', 'qualitative_notes',
  'locked_identity_block', 'locked_negative_block'
];

// Safe numeric/structural fields that are kept in exports
const SAFE_PAYLOAD_FIELDS = new Set([
  'scores', 'ai_scores', 'score_deltas', 'attribution', 'scoring_source',
  'model_type', 'guidance_scale', 'guidance2_scale', 'loras_multipliers',
  'video_length', 'seed', 'flow_shift', 'NAG_scale', 'iteration_number',
  'production_ready', 'grand_total', 'grand_max', 'event_type',
  'timestamp', 'app_version', 'status', 'change_from_parent',
  // Environment fields
  'platform', 'os_version', 'arch', 'ram_total_gb', 'cpu_model', 'cpu_cores',
  'node_version', 'collected_at', 'gpu_model', 'gpu_vram_mb', 'gpu_driver',
  // Render duration fields
  'render_duration_seconds', 'detected_at'
]);

/**
 * Builds a character name -> anonymous ID mapping from a set of events.
 * Returns a Map<string, string> e.g. "McKenzie" -> "character_001"
 */
function buildCharacterMap(events) {
  const names = new Set();
  for (const event of events) {
    const payload = event.payload || {};
    if (payload.character_name) names.add(payload.character_name);
    if (payload.character) names.add(payload.character);
    if (payload.characters) {
      for (const c of payload.characters) {
        if (typeof c === 'string') names.add(c);
        else if (c?.name) names.add(c.name);
      }
    }
  }
  const map = new Map();
  let idx = 1;
  for (const name of names) {
    if (name) {
      map.set(name, `character_${String(idx).padStart(3, '0')}`);
      idx++;
    }
  }
  return map;
}

/**
 * Anonymizes environment-specific fields:
 * - os_version: strip to major version ("10.0.26200" -> "10")
 * - cpu_model: strip to brand ("AMD Ryzen 9 5900X" -> "AMD Ryzen")
 * GPU model, VRAM, and driver are kept as-is (valuable segmentation data).
 */
function anonymizeEnvironmentField(key, value) {
  if (key === 'os_version' && typeof value === 'string') {
    return value.split('.')[0];
  }
  if (key === 'cpu_model' && typeof value === 'string') {
    // Extract brand family: "AMD Ryzen 9 5900X" -> "AMD Ryzen"
    // "Intel(R) Core(TM) i9-13900K" -> "Intel Core"
    const cleaned = value.replace(/\(R\)/gi, '').replace(/\(TM\)/gi, '').trim();
    const words = cleaned.split(/\s+/);
    // Take brand + family (first two meaningful words)
    if (words.length >= 2) {
      return `${words[0]} ${words[1]}`;
    }
    return words[0] || 'unknown';
  }
  return value;
}

/**
 * Deep-cleans a value, stripping paths and prompts recursively.
 */
function cleanValue(key, value, characterMap) {
  if (value === null || value === undefined) return value;

  // Strip known path fields
  if (PATH_FIELDS.includes(key)) return undefined;

  // Strip known prompt fields
  if (PROMPT_FIELDS.includes(key)) return undefined;

  // Anonymize environment fields
  if (key === 'os_version' || key === 'cpu_model') {
    return anonymizeEnvironmentField(key, value);
  }

  // Anonymize character names
  if ((key === 'character_name' || key === 'character') && typeof value === 'string') {
    return characterMap.get(value) || 'character_unknown';
  }

  // Anonymize character arrays
  if (key === 'characters' && Array.isArray(value)) {
    return value.map(c => {
      if (typeof c === 'string') return characterMap.get(c) || 'character_unknown';
      if (c?.name) return { ...cleanObject(c, characterMap), name: characterMap.get(c.name) || 'character_unknown' };
      return c;
    });
  }

  // Strip lora filenames from activated_loras but keep count
  if (key === 'activated_loras' && Array.isArray(value)) {
    return { count: value.length };
  }

  // Strip lora_files (filenames)
  if (key === 'lora_files' && Array.isArray(value)) {
    return { count: value.length };
  }

  // Recursively clean objects
  if (typeof value === 'object' && !Array.isArray(value)) {
    return cleanObject(value, characterMap);
  }

  // Recursively clean arrays
  if (Array.isArray(value)) {
    return value.map((item, i) => cleanValue(String(i), item, characterMap));
  }

  // Detect path-like strings that slipped through (heuristic)
  if (typeof value === 'string' && (value.includes('/') || value.includes('\\'))) {
    // Check if it looks like a filesystem path
    if (value.match(/^[A-Z]:[/\\]/i) || value.match(/^\/[a-z]/i) || value.match(/\.(json|mp4|safetensors|txt|png)$/i)) {
      return undefined;
    }
  }

  return value;
}

/**
 * Cleans an entire object, removing PII fields.
 */
function cleanObject(obj, characterMap) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const result = cleanValue(key, value, characterMap);
    if (result !== undefined) {
      cleaned[key] = result;
    }
  }
  return cleaned;
}

/**
 * Anonymizes an array of telemetry events for export.
 * Returns a new array with all PII stripped.
 */
export function anonymizeEvents(events) {
  const characterMap = buildCharacterMap(events);

  return events.map(event => ({
    event_type: event.event_type,
    timestamp: event.timestamp,
    app_version: event.app_version,
    payload: cleanObject(event.payload || {}, characterMap)
  }));
}

export { buildCharacterMap, cleanObject, cleanValue, anonymizeEnvironmentField, PATH_FIELDS, PROMPT_FIELDS };

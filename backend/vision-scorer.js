/**
 * Vision Scorer — uses Claude API to auto-score rendered frames.
 *
 * Sends contact sheet or individual frames to Claude with the
 * 15-field scoring rubric. Returns structured scores matching
 * the manual evaluation format.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import config from './config.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL = config.vision_model;

/**
 * The scoring rubric — sent as system prompt to Claude Vision.
 * Matches the 15-field scoring system used in manual evaluation.
 */
const SCORING_RUBRIC = `You are an expert evaluator for AI-generated video character renders. You will be shown frames from a rendered video and must score them on 15 criteria.

SCORING SCALE: 1 (poor) to 5 (excellent) for each field.

IDENTITY (8 fields, max 40):
- face_match: Overall face resemblance to the target character
- head_shape: Head shape accuracy (round, oval, angular, etc.)
- jaw: Jawline accuracy
- cheekbones: Cheekbone definition and placement
- eyes_brow: Eye shape, brow thickness, spacing accuracy
- skin_texture: Skin texture, age representation, complexion
- hair: Hair style, colour, length, texture accuracy
- frame_consistency: Does the face stay consistent across frames?

LOCATION (4 fields, max 20):
- location_correct: Does the setting match what was requested?
- lighting_correct: Is lighting natural and appropriate?
- wardrobe_correct: Is clothing/wardrobe appropriate?
- geometry_correct: Are proportions and spatial relationships realistic?

MOTION (3 fields, max 15):
- action_executed: Does the character perform the requested action?
- smoothness: Is the motion smooth without jitter or artifacts?
- camera_movement: Is camera movement natural and intentional?

IMPORTANT GUIDELINES:
- Score based on what you SEE, not what you think should be there
- A score of 3 means "acceptable but room for improvement"
- A score of 5 means "indistinguishable from professional quality"
- A score of 1 means "clearly wrong or broken"
- Be specific in your qualitative notes about what's working and what needs improvement
- Suggest which "rope" (aspect) to adjust: Rope 1 (prompt wording), Rope 2 (negative prompt), Rope 3 (LoRA multipliers), Rope 4 (guidance scale), Rope 5 (seed), Rope 6 (alt prompt)

You MUST respond with ONLY a valid JSON object in this exact format, no other text:
{
  "scores": {
    "identity": { "face_match": N, "head_shape": N, "jaw": N, "cheekbones": N, "eyes_brow": N, "skin_texture": N, "hair": N, "frame_consistency": N },
    "location": { "location_correct": N, "lighting_correct": N, "wardrobe_correct": N, "geometry_correct": N },
    "motion": { "action_executed": N, "smoothness": N, "camera_movement": N }
  },
  "attribution": {
    "lowest_element": "the_key_of_the_lowest_scoring_field",
    "rope": "rope_N",
    "confidence": "low|medium|high",
    "next_change_description": "Specific description of what single change to make next",
    "next_change_value": "The LITERAL value to place in that JSON field. Rules by rope: Rope 1/6 = prompt text string only (NO quality/negative terms — those belong in negative_prompt only). Rope 2 = negative_prompt text string. Rope 3 = a single decimal number as a string e.g. '1.0' or '1.1' (NOT prose, NOT 'increase to X'). Rope 4 = a single decimal number e.g. '6.5'. Rope 5 = a new integer seed. Always output the raw value, never a description of the value."
  },
  "qualitative_notes": "REQUIRED — 2-3 sentences about what you observed. Must never be empty."
}`;

/**
 * Get the API key from environment
 */
function getApiKey() {
  return (
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_KEY ||
    config.anthropic_api_key ||
    config.anthropic_key ||
    config.api_keys?.anthropic ||
    null
  );
}

/**
 * Load an image file as base64, converting to WebP if it exceeds Claude's 5MB base64 limit.
 * Base64 encoding adds ~33% overhead, so raw files >3.75MB will exceed the limit.
 * Conversion is lossless in resolution — no spatial downsampling — preserving detail for scoring.
 * Returns { data, media_type } so callers always get the correct MIME type.
 */
async function loadImageBase64(filePath) {
  let buffer = await readFile(filePath);
  let media_type = filePath.toLowerCase().endsWith('.png') ? 'image/png'
    : filePath.toLowerCase().endsWith('.webp') ? 'image/webp'
    : 'image/jpeg';

  // Claude API limit: 5MB base64 string (~3.75MB raw file).
  // Convert to WebP q90 (no spatial resize) — shrinks 4MB PNG to ~1.2MB while preserving
  // full resolution so Claude can still evaluate fine facial details accurately.
  if (buffer.length > 3_750_000) {
    buffer = await sharp(buffer, { limitInputPixels: false })
      .webp({ quality: 90 })
      .toBuffer();
    media_type = 'image/webp';
  }

  return { data: buffer.toString('base64'), media_type };
}

/**
 * Score frames using Claude Vision API.
 *
 * @param {string[]} framePaths — paths to frame image files
 * @param {object} context — additional context for scoring
 * @param {string} context.prompt — the generation prompt
 * @param {string} context.characterDescription — character identity description
 * @param {string} context.negativePrompt — negative prompt used
 * @param {number} context.iterationNumber — which iteration this is
 * @param {string} context.changeFromParent — what was changed from previous iteration
 * @returns {object} — scores in the standard evaluation format
 */
export async function scoreFrames(framePaths, context = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Add it to your environment variables.');
  }

  // Load frames as base64 (auto-resize if over Claude's 5MB base64 limit)
  const images = [];
  for (const fp of framePaths) {
    if (!existsSync(fp)) continue;
    const { data, media_type } = await loadImageBase64(fp);
    images.push({ type: 'image', source: { type: 'base64', media_type, data } });
  }

  if (images.length === 0) {
    throw new Error('No valid frame images found');
  }

  // Load reference images if provided (LoRA training photos for ground truth comparison)
  const referenceImages = [];
  if (context.referenceImagePaths?.length > 0) {
    for (const refPath of context.referenceImagePaths.slice(0, 3)) { // max 3 reference photos
      try {
        if (existsSync(refPath)) {
          const { data, media_type } = await loadImageBase64(refPath);
          referenceImages.push({ type: 'image', source: { type: 'base64', media_type, data } });
        }
      } catch {}
    }
  }

  // Build the user message with context
  let userPrompt = 'Score these frames from an AI-generated video render.';
  if (referenceImages.length > 0) {
    userPrompt += `\n\nREFERENCE PHOTOS: I have included ${referenceImages.length} real photo(s) of the target character. Compare the rendered frames against these reference photos for identity accuracy. The render should look like THIS person.`;
  }
  if (context.characterDescription) {
    userPrompt += `\n\nTARGET CHARACTER: ${context.characterDescription}`;
  }
  if (context.prompt) {
    userPrompt += `\n\nGENERATION PROMPT: ${context.prompt}`;
  }
  if (context.negativePrompt) {
    userPrompt += `\n\nNEGATIVE PROMPT: ${context.negativePrompt}`;
  }
  if (context.iterationNumber) {
    userPrompt += `\n\nThis is iteration #${context.iterationNumber}.`;
  }
  if (context.changeFromParent) {
    userPrompt += `\nChange from previous iteration: ${context.changeFromParent}`;
  }

  // Call Claude API — system prompt uses prompt caching so repeated evaluations
  // in the same session only pay rubric tokens once (cache TTL: 5 minutes).
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: SCORING_RUBRIC, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          ...referenceImages,
          ...(referenceImages.length > 0 ? [{ type: 'text', text: 'Above: reference photos of the real person. Below: AI-generated video frames to score.' }] : []),
          ...images,
          { type: 'text', text: userPrompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let humanMessage;
    if (response.status === 529 || response.status === 503 || response.status === 502) {
      humanMessage = 'Claude API is temporarily unavailable (gateway error) — try again in a moment';
    } else if (response.status === 429) {
      humanMessage = 'Claude API rate limit hit — try again in a moment';
    } else if (response.status === 401) {
      humanMessage = 'API key is invalid or missing';
    } else {
      try {
        const parsed = JSON.parse(errText);
        humanMessage = parsed?.error?.message || `Claude API error ${response.status}`;
      } catch {
        humanMessage = `Claude API error ${response.status}`;
      }
    }
    throw new Error(humanMessage);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text;

  if (!text) {
    throw new Error('Empty response from Claude API');
  }

  // Parse the JSON response
  try {
    // Handle potential markdown code blocks
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.scores?.identity || !parsed.scores?.location || !parsed.scores?.motion) {
      throw new Error('Invalid score structure returned');
    }

    // Known score field keys — strip anything else (total, max, etc.)
    const validFields = {
      identity: ['face_match', 'head_shape', 'jaw', 'cheekbones', 'eyes_brow', 'skin_texture', 'hair', 'frame_consistency'],
      location: ['location_correct', 'lighting_correct', 'wardrobe_correct', 'geometry_correct'],
      motion: ['action_executed', 'smoothness', 'camera_movement']
    };

    // Strip junk fields and clamp scores to 1-5
    for (const group of ['identity', 'location', 'motion']) {
      const cleaned = {};
      for (const key of validFields[group]) {
        const val = parsed.scores[group][key];
        cleaned[key] = val != null ? Math.max(1, Math.min(5, Math.round(val))) : 3;
      }
      parsed.scores[group] = cleaned;
    }

    // Compute grand total
    const grandTotal =
      Object.values(parsed.scores.identity).reduce((s, v) => s + v, 0) +
      Object.values(parsed.scores.location).reduce((s, v) => s + v, 0) +
      Object.values(parsed.scores.motion).reduce((s, v) => s + v, 0);

    const usage = result.usage || {};
    return {
      scores: parsed.scores,
      attribution: parsed.attribution || {},
      qualitative_notes: parsed.qualitative_notes || '',
      scoring_source: 'vision_api',
      grand_total: grandTotal,
      model_used: VISION_MODEL,
      scored_at: new Date().toISOString(),
      cache_hit: (usage.cache_read_input_tokens || 0) > 0,
      tokens_used: {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cache_read: usage.cache_read_input_tokens || 0,
        cache_write: usage.cache_creation_input_tokens || 0
      }
    };
  } catch (parseErr) {
    throw new Error(`Failed to parse Claude response: ${parseErr.message}. Raw: ${text.substring(0, 200)}`);
  }
}

/**
 * Check if the Vision API is configured and reachable
 */
export async function checkVisionApi() {
  const apiKey = getApiKey();
  // Key presence is sufficient — no need to ping the API.
  // A real call here burned tokens on every frontend status check.
  if (!apiKey) return { available: false, reason: 'ANTHROPIC_API_KEY not set' };
  return { available: true, model: VISION_MODEL };
}

export default { scoreFrames, checkVisionApi };

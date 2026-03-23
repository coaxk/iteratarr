import { Router } from 'express';
import { WAN2GP_FIELDS } from './iterations.js';

/**
 * Template routes for the Prompt Template Library.
 *
 * Templates are reusable prompt structures with placeholders. When a user
 * starts a new clip, they pick a template, select a character, fill in
 * location + action, and the generate endpoint produces a complete Wan2GP
 * JSON with the character's locked identity block and proven settings
 * auto-populated.
 *
 * Placeholder tokens in prompt_template / alt_prompt_template / negative_prompt_template:
 *   {{trigger}}            — character.trigger_word
 *   {{identity_condensed}} — first sentence of locked_identity_block
 *   {{identity_full}}      — full locked_identity_block
 *   {{wardrobe}}           — wardrobe portion (extracted or from action context)
 *   {{negative_block}}     — character.locked_negative_block
 *   {{location}}           — user-supplied location string
 *   {{action}}             — user-supplied action string
 */

/** Extracts a condensed identity from the full block — first sentence or first 120 chars */
function condenseIdentity(fullBlock) {
  if (!fullBlock) return '';
  // First sentence: up to first period followed by space or end
  const firstSentence = fullBlock.match(/^[^.]+\./);
  if (firstSentence && firstSentence[0].length <= 150) return firstSentence[0].trim();
  // Fallback: first 120 chars, break at word boundary
  if (fullBlock.length <= 120) return fullBlock;
  return fullBlock.slice(0, 120).replace(/\s+\S*$/, '').trim();
}

/** Replaces all {{placeholder}} tokens in a template string */
function fillPlaceholders(template, values) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

function validateTemplate(data) {
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('Template name is required');
  }
  if (!data.prompt_template || typeof data.prompt_template !== 'string' || !data.prompt_template.trim()) {
    throw new Error('prompt_template is required');
  }
}

export function createTemplateRoutes(store) {
  const router = Router();

  // GET / — list all templates
  router.get('/', async (req, res) => {
    const templates = await store.list('templates');
    // Sort by created_at descending (newest first)
    templates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(templates);
  });

  // POST / — create a new template
  router.post('/', async (req, res) => {
    try {
      validateTemplate(req.body);
      const template = await store.create('templates', {
        name: req.body.name.trim(),
        description: req.body.description || '',
        prompt_template: req.body.prompt_template.trim(),
        alt_prompt_template: req.body.alt_prompt_template || '',
        negative_prompt_template: req.body.negative_prompt_template || '',
        default_settings: req.body.default_settings || {}
      });
      res.status(201).json(template);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // GET /:id — get a single template
  router.get('/:id', async (req, res) => {
    try {
      const template = await store.get('templates', req.params.id);
      res.json(template);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // DELETE /:id — delete a template
  router.delete('/:id', async (req, res) => {
    try {
      // Verify it exists first
      await store.get('templates', req.params.id);
      await store.delete('templates', req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // POST /:id/generate — generate a starter Wan2GP JSON from template + character + location
  router.post('/:id/generate', async (req, res) => {
    try {
      const { character_id, location, action } = req.body;

      if (!character_id) {
        return res.status(400).json({ error: 'character_id is required' });
      }

      const template = await store.get('templates', req.params.id);
      const character = await store.get('characters', character_id);

      // Build placeholder values from character + user input
      const placeholders = {
        trigger: character.trigger_word || '',
        identity_condensed: condenseIdentity(character.locked_identity_block),
        identity_full: character.locked_identity_block || '',
        wardrobe: '', // Can be extended later — for now, user puts it in action or prompt
        negative_block: character.locked_negative_block || '',
        location: location || '',
        action: action || ''
      };

      // Fill prompt templates
      const prompt = fillPlaceholders(template.prompt_template, placeholders);
      const alt_prompt = fillPlaceholders(template.alt_prompt_template, placeholders);
      const negative_prompt = fillPlaceholders(template.negative_prompt_template, placeholders);

      // Build the Wan2GP JSON: template defaults < character proven settings < generation overrides
      const generatedJson = {
        // Sensible base defaults
        video_length: 32,
        seed: -1,
        num_inference_steps: 30,
        guidance_scale: 6.0,
        guidance2_scale: 3.0,
        film_grain_intensity: 0.01,
        // Layer on template defaults
        ...template.default_settings,
        // Layer on character's proven settings (these are the gold standard)
        ...(character.proven_settings || {}),
        // Always override seed to -1 for new clips (fresh exploration)
        seed: -1,
        // Always iteration mode
        video_length: 32,
        // Populated prompts
        prompt,
        alt_prompt,
        negative_prompt,
        // LoRA configuration from character
        activated_loras: character.lora_files || [],
        // Output filename placeholder — caller can rename
        output_filename: `${character.trigger_word}_${(location || 'scene').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`
      };

      // Strip any fields not in the Wan2GP whitelist
      const cleanJson = {};
      for (const [key, value] of Object.entries(generatedJson)) {
        if (WAN2GP_FIELDS.has(key)) {
          cleanJson[key] = value;
        }
      }

      res.json({
        generated_json: cleanJson,
        character_name: character.name,
        template_name: template.name,
        placeholders_used: placeholders
      });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  return router;
}

// Export for testing
export { condenseIdentity, fillPlaceholders };

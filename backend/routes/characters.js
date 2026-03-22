import { Router } from 'express';
import { validateCharacter } from '../store/validators.js';
import { EVENTS } from '../telemetry/index.js';

export function createCharacterRoutes(store, telemetry = null) {
  const router = Router();

  router.get('/', async (req, res) => {
    const characters = await store.list('characters');
    res.json(characters);
  });

  router.post('/', async (req, res) => {
    try {
      validateCharacter(req.body);
      const character = await store.create('characters', {
        name: req.body.name,
        trigger_word: req.body.trigger_word,
        lora_files: req.body.lora_files || [],
        locked_identity_block: req.body.locked_identity_block || '',
        locked_negative_block: req.body.locked_negative_block || '',
        proven_settings: req.body.proven_settings || {},
        best_iteration_id: null,
        notes: req.body.notes || ''
      });
      // Telemetry: record character creation (name anonymized on export)
      if (telemetry) {
        telemetry.record(EVENTS.CHARACTER_CREATED, {
          character_name: character.name,
          lora_count: (character.lora_files || []).length,
          has_identity_block: !!character.locked_identity_block,
          has_negative_block: !!character.locked_negative_block,
          has_proven_settings: Object.keys(character.proven_settings || {}).length > 0
        });
      }

      res.status(201).json(character);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const character = await store.get('characters', req.params.id);
      res.json(character);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const updated = await store.update('characters', req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  });

  return router;
}

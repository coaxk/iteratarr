/**
 * Seed the template library with proven prompt architectures.
 *
 * Run: node seed-templates.js
 *
 * This is idempotent — it checks for existing templates by name and
 * only creates ones that don't already exist.
 */
import { createStore } from './store/index.js';
import config from './config.js';

const store = createStore(config.iteratarr_data_dir);

const SEED_TEMPLATES = [
  {
    name: 'Character at Location — Proven Architecture',
    description: 'Identity anchor + location + action. Condensed identity in prompt with attention weighting, full identity in alt_prompt for reinforcement. Standard negative block plus motion/artifact suppression. Based on the proven Monaco balcony architecture.',
    prompt_template: '({{trigger}}:1.3), ({{identity_condensed}}:1.1), {{action}}, ({{location}}:0.9), cinematic documentary, film grain',
    alt_prompt_template: '{{identity_full}}',
    negative_prompt_template: '{{negative_block}}, jittery motion, watermark, text overlay, logo',
    default_settings: {
      guidance_scale: 6.1,
      guidance2_scale: 3,
      loras_multipliers: '',
      video_length: 32,
      num_inference_steps: 30,
      film_grain_intensity: 0.01
    }
  }
];

async function seed() {
  const existing = await store.list('templates');
  const existingNames = new Set(existing.map(t => t.name));

  let created = 0;
  for (const tmpl of SEED_TEMPLATES) {
    if (existingNames.has(tmpl.name)) {
      console.log(`[skip] "${tmpl.name}" already exists`);
      continue;
    }
    await store.create('templates', tmpl);
    console.log(`[created] "${tmpl.name}"`);
    created++;
  }

  console.log(`\nDone. ${created} template(s) created, ${SEED_TEMPLATES.length - created} skipped.`);
  store.close();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

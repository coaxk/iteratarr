import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaults = {
  wan2gp_json_dir: 'C:/pinokio/api/wan2gp.git/app',
  iteration_save_dir: 'C:/Projects/kebbin-shop',
  production_lock_dir: 'C:/Projects/kebbin-shop/finals',
  production_queue_dir: 'C:/Projects/kebbin-shop/queue',
  iteratarr_data_dir: resolve(__dirname, 'data'),
  score_lock_threshold: 65,
  iteration_frame_count: 32,
  production_frame_count: 81,
  telemetry_enabled: false,
  port: 3847,
  project_base_dir: 'C:/Projects/kebbin-shop',
  wan2gp_lora_dir: 'C:/pinokio/api/wan2gp.git/app/loras/wan',
  wan2gp_output_dir: 'C:/pinokio/api/wan2gp.git/app/outputs',
  anthropic_api_key: null,
  anthropic_key: null,
  api_keys: {}
};

let userConfig = {};
try {
  const raw = readFileSync(resolve(__dirname, 'config.json'), 'utf-8');
  userConfig = JSON.parse(raw);
} catch {
  // config.json missing or invalid — use defaults
}

const config = { ...defaults, ...userConfig };

// Resolve relative data dir to absolute
if (!config.iteratarr_data_dir.startsWith('/') && !config.iteratarr_data_dir.match(/^[A-Z]:/i)) {
  config.iteratarr_data_dir = resolve(__dirname, config.iteratarr_data_dir);
}

export default config;

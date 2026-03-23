/**
 * Wan2GP Bridge — submits generation jobs to Wan2GP via CLI headless mode.
 *
 * Uses `python wgp.py --process <json_path> --output-dir <output_dir>`
 * to render videos without manual interaction.
 *
 * Three modes:
 * 1. renderSingle(jsonPath) — render one iteration JSON
 * 2. renderBatch(jsonPaths) — render multiple JSONs sequentially
 * 3. renderQueue(queueZipPath) — process a saved queue zip
 */

import { execFile } from 'child_process';
import { join, resolve } from 'path';
import config from './config.js';

const WAN2GP_ROOT = config.wan2gp_json_dir; // e.g. C:/pinokio/api/wan2gp.git/app
const WAN2GP_SCRIPT = join(WAN2GP_ROOT, 'wgp.py');
const WAN2GP_PYTHON = join(WAN2GP_ROOT, 'env', 'Scripts', 'python.exe'); // Pinokio's Python env
const OUTPUT_DIR = config.wan2gp_output_dir;

/**
 * Render a single JSON file via Wan2GP headless mode.
 * Returns a promise that resolves when rendering completes.
 */
export function renderSingle(jsonPath, options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;
  const verbose = options.verbose || 0;

  return new Promise((resolve, reject) => {
    const args = [
      WAN2GP_SCRIPT,
      '--process', jsonPath,
      '--output-dir', outputDir,
      '--verbose', String(verbose)
    ];

    // Add optional performance flags
    if (options.attention) args.push('--attention', options.attention);
    if (options.profile) args.push('--profile', String(options.profile));

    console.log(`[Wan2GP Bridge] Rendering: ${jsonPath}`);

    const proc = execFile(WAN2GP_PYTHON, args, {
      cwd: WAN2GP_ROOT,
      timeout: options.timeout || 1800000, // 30 min default timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB stdout buffer
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Wan2GP Bridge] Error:`, error.message);
        reject(new Error(`Wan2GP render failed: ${error.message}`));
        return;
      }
      console.log(`[Wan2GP Bridge] Complete: ${jsonPath}`);
      resolve({ stdout, stderr, jsonPath });
    });

    // Stream output for progress monitoring
    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line && verbose > 0) console.log(`[Wan2GP] ${line}`);
      });
    }
  });
}

/**
 * Render multiple JSON files sequentially.
 * Returns array of results.
 */
export async function renderBatch(jsonPaths, options = {}) {
  const results = [];
  for (const jsonPath of jsonPaths) {
    try {
      const result = await renderSingle(jsonPath, options);
      results.push({ ...result, success: true });
    } catch (err) {
      results.push({ jsonPath, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Generate a multi-task queue JSON for batch processing.
 * Takes an array of settings objects and writes a queue file.
 * Process with: python wgp.py --process queue.json
 */
export async function createQueueFile(tasks, outputPath) {
  const { writeFile } = await import('fs/promises');
  const queue = { tasks };
  await writeFile(outputPath, JSON.stringify(queue, null, 2));
  return outputPath;
}

/**
 * Render a queue of multiple tasks in one headless call.
 * Much more efficient than calling renderSingle for each.
 */
export function renderQueue(queueJsonPath, options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;

  return new Promise((resolve, reject) => {
    const args = [
      WAN2GP_SCRIPT,
      '--process', queueJsonPath,
      '--output-dir', outputDir,
      '--verbose', String(options.verbose || 1)
    ];

    if (options.attention) args.push('--attention', options.attention);
    if (options.profile) args.push('--profile', String(options.profile));

    console.log(`[Wan2GP Bridge] Processing queue: ${queueJsonPath}`);

    execFile(WAN2GP_PYTHON, args, {
      cwd: WAN2GP_ROOT,
      timeout: options.timeout || 7200000, // 2 hour default for batch
      maxBuffer: 50 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Wan2GP Bridge] Queue error:`, error.message);
        reject(new Error(`Wan2GP queue failed: ${error.message}`));
        return;
      }
      console.log(`[Wan2GP Bridge] Queue complete: ${queueJsonPath}`);
      resolve({ stdout, stderr, queueJsonPath });
    });
  });
}

/**
 * Check if Wan2GP is accessible at the configured path.
 */
export function checkWan2GP() {
  return new Promise((resolve) => {
    execFile(WAN2GP_PYTHON, [WAN2GP_SCRIPT, '--help'], {
      cwd: WAN2GP_ROOT,
      timeout: 30000
    }, (error) => {
      resolve(!error);
    });
  });
}

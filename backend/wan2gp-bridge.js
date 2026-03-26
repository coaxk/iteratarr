/**
 * Wan2GP Bridge — submits generation jobs to Wan2GP via CLI headless mode.
 *
 * Uses `python wgp.py --process <json_path> --output-dir <output_dir>`
 * to render videos without manual interaction.
 *
 * Error handling:
 * - Process crash/timeout: caught and reported, never crashes Iteratarr backend
 * - Queue abort: detected via stdout parsing, marked as failed
 * - RAM/VRAM exhaustion: detected via stderr patterns
 * - All errors surfaced to the render status tracking
 */

import { execFile, spawn } from 'child_process';
import { join } from 'path';
import config from './config.js';

const WAN2GP_ROOT = config.wan2gp_json_dir;
const WAN2GP_SCRIPT = join(WAN2GP_ROOT, 'wgp.py');
const WAN2GP_PYTHON = join(WAN2GP_ROOT, 'env', 'Scripts', 'python.exe');
const OUTPUT_DIR = config.wan2gp_output_dir;

// Progress callback registry — render routes can subscribe
const progressCallbacks = new Map();
export function onProgress(renderId, callback) {
  progressCallbacks.set(renderId, callback);
}
export function offProgress(renderId) {
  progressCallbacks.delete(renderId);
}

function emitProgress(renderId, data) {
  const cb = progressCallbacks.get(renderId);
  if (cb) cb(data);
}

/**
 * Parse Wan2GP stdout for progress information.
 * Returns: { type: 'progress'|'abort'|'complete'|'error'|'info', ... }
 */
function parseOutput(line) {
  if (!line || !line.trim()) return null;
  const trimmed = line.trim();

  // Step progress: "  10%|████| 3/30 [02:10<19:38, 43.64s/steps]"
  const stepMatch = trimmed.match(/(\d+)%\|.*?\|\s*(\d+)\/(\d+)\s*\[([^\]]+)\]/);
  if (stepMatch) {
    const [, pct, current, total, timing] = stepMatch;
    const secMatch = timing.match(/([\d.]+)s\/steps/);
    return {
      type: 'progress',
      percent: parseInt(pct),
      step: parseInt(current),
      totalSteps: parseInt(total),
      secsPerStep: secMatch ? parseFloat(secMatch[1]) : null
    };
  }

  // Queue abort
  if (trimmed.includes('Clear Queue') || trimmed.includes('Signalling abort')) {
    return { type: 'abort', message: trimmed };
  }

  // Model loading
  if (trimmed.startsWith("Loading Model") || trimmed.startsWith("Loading Text Encoder")) {
    return { type: 'info', phase: 'loading_model', message: trimmed };
  }

  // LoRA loading
  if (trimmed.includes("Lora") && trimmed.includes("was loaded")) {
    return { type: 'info', phase: 'loading_lora', message: trimmed };
  }

  // RAM warning
  if (trimmed.includes('Unable to pin') || trimmed.includes('no reserved RAM left')) {
    return { type: 'warning', message: trimmed };
  }

  // Task loaded
  if (trimmed.includes('task(s) ready') || trimmed.includes('Task 1/1 ready')) {
    return { type: 'info', phase: 'task_ready', message: trimmed };
  }

  // Phase indicator: "Phase 1/2 High Noise" or "Phase 2/2 Low Noise"
  const phaseMatch = trimmed.match(/Phase\s+(\d+)\/(\d+)\s+(.*)/i);
  if (phaseMatch) {
    return { type: 'info', phase: 'denoise_phase', currentPhase: parseInt(phaseMatch[1]), totalPhases: parseInt(phaseMatch[2]), phaseLabel: phaseMatch[3].trim(), message: trimmed };
  }

  // Denoising / VAE Decoding stage labels
  if (trimmed.includes('Denoising')) {
    return { type: 'info', phase: 'denoising', message: trimmed };
  }
  if (trimmed.includes('VAE Decoding') || trimmed.includes('VAE decoding')) {
    return { type: 'info', phase: 'vae_decoding', message: 'VAE Decoding — generating video frames' };
  }

  // Video saved
  if (trimmed.includes('Video saved')) {
    return { type: 'info', phase: 'video_saved', message: trimmed };
  }

  // Task completed
  const taskCompleteMatch = trimmed.match(/Task\s+(\d+)\s+completed/i);
  if (taskCompleteMatch) {
    return { type: 'info', phase: 'task_complete', taskNumber: parseInt(taskCompleteMatch[1]), message: trimmed };
  }

  // Queue completed summary
  const queueCompleteMatch = trimmed.match(/Queue completed.*?(\d+)\/(\d+)\s+tasks?\s+in\s+(.*)/i);
  if (queueCompleteMatch) {
    return { type: 'info', phase: 'queue_complete', completed: parseInt(queueCompleteMatch[1]), total: parseInt(queueCompleteMatch[2]), duration: queueCompleteMatch[3], message: trimmed };
  }

  return null;
}

/**
 * Render a single JSON file via Wan2GP headless mode.
 * Uses spawn for real-time stdout parsing instead of execFile.
 */
export function renderSingle(jsonPath, options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;
  const renderId = options.renderId || null;

  return new Promise((resolve, reject) => {
    const args = [
      WAN2GP_SCRIPT,
      '--process', jsonPath,
      '--output-dir', outputDir
    ];

    if (options.attention) args.push('--attention', options.attention);
    if (options.profile) args.push('--profile', String(options.profile));

    console.log(`[Wan2GP Bridge] Rendering: ${jsonPath}`);
    let aborted = false;
    let lastProgress = null;
    let allOutput = '';

    const proc = spawn(WAN2GP_PYTHON, args, {
      cwd: WAN2GP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    // Timeout — kill process if it takes too long
    const timeout = options.timeout || 2400000; // 40 min default (generous for 3060)
    const timer = setTimeout(() => {
      console.error(`[Wan2GP Bridge] Timeout after ${timeout / 1000}s — killing process`);
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }, timeout);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        allOutput += line + '\n';
        const parsed = parseOutput(line);
        if (!parsed) continue;

        if (parsed.type === 'abort') {
          aborted = true;
          console.error(`[Wan2GP Bridge] ABORT detected: ${parsed.message}`);
          if (renderId) emitProgress(renderId, { type: 'abort', message: parsed.message });
        } else if (parsed.type === 'progress') {
          lastProgress = parsed;
          if (renderId) emitProgress(renderId, parsed);
          // Log progress every 10%
          if (parsed.percent % 10 === 0) {
            console.log(`[Wan2GP Bridge] ${parsed.percent}% (${parsed.step}/${parsed.totalSteps}) ${parsed.secsPerStep ? parsed.secsPerStep + 's/step' : ''}`);
          }
        } else if (parsed.type === 'warning') {
          console.warn(`[Wan2GP Bridge] ${parsed.message}`);
          if (renderId) emitProgress(renderId, parsed);
        } else if (parsed.type === 'info') {
          console.log(`[Wan2GP Bridge] ${parsed.phase}: ${parsed.message}`);
          if (renderId) emitProgress(renderId, parsed);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        allOutput += text + '\n';
        // Parse stderr for progress (tqdm outputs to stderr)
        const parsed = parseOutput(text);
        if (parsed) {
          if (parsed.type === 'progress') {
            lastProgress = parsed;
            if (renderId) emitProgress(renderId, parsed);
            if (parsed.percent % 10 === 0) {
              console.log(`[Wan2GP Bridge] ${parsed.percent}% (${parsed.step}/${parsed.totalSteps}) ${parsed.secsPerStep ? parsed.secsPerStep + 's/step' : ''}`);
            }
          }
        } else if (!text.includes('UserWarning') && !text.includes('FutureWarning')) {
          console.error(`[Wan2GP Bridge] stderr: ${text.substring(0, 200)}`);
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (renderId) offProgress(renderId);

      if (aborted) {
        reject(new Error('Wan2GP queue was aborted — check if another process cleared the queue'));
      } else if (code !== 0 && code !== null) {
        reject(new Error(`Wan2GP exited with code ${code}`));
      } else {
        console.log(`[Wan2GP Bridge] Complete: ${jsonPath}`);
        resolve({ jsonPath, lastProgress, exitCode: code });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (renderId) offProgress(renderId);
      console.error(`[Wan2GP Bridge] Process error: ${err.message}`);
      reject(new Error(`Failed to start Wan2GP: ${err.message}`));
    });
  });
}

/**
 * Render multiple JSON files sequentially.
 * Each render gets its own process (model loads fresh each time).
 * Returns array of results — never throws, captures errors per render.
 */
export async function renderBatch(jsonPaths, options = {}) {
  const results = [];
  for (let i = 0; i < jsonPaths.length; i++) {
    const jsonPath = jsonPaths[i];
    console.log(`[Wan2GP Bridge] Batch ${i + 1}/${jsonPaths.length}: ${jsonPath}`);
    try {
      const result = await renderSingle(jsonPath, {
        ...options,
        renderId: options.renderIds?.[i] || null
      });
      results.push({ ...result, success: true });
    } catch (err) {
      console.error(`[Wan2GP Bridge] Batch ${i + 1}/${jsonPaths.length} failed: ${err.message}`);
      results.push({ jsonPath, success: false, error: err.message });
      // Continue with next render — don't let one failure stop the batch
    }
  }
  return results;
}

/**
 * Generate a multi-task queue JSON for batch processing.
 */
export async function createQueueFile(tasks, outputPath) {
  const { writeFile } = await import('fs/promises');
  const queue = { tasks };
  await writeFile(outputPath, JSON.stringify(queue, null, 2));
  return outputPath;
}

/**
 * Render a queue via single headless call (all tasks in one process).
 * More efficient than renderBatch (model loaded once) but no per-task error isolation.
 */
export function renderQueue(queueJsonPath, options = {}) {
  return renderSingle(queueJsonPath, {
    ...options,
    timeout: options.timeout || 7200000 // 2 hour default for multi-task queues
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

/**
 * Environment Fingerprint Collection — Iteratarr Telemetry
 *
 * Collects hardware/software environment info for segmentation analytics.
 * Used to correlate GPU class with iteration count, render times, and
 * score trajectories. No PII — just system specs.
 *
 * Collected once on first telemetry record (or on setEnabled(true)),
 * then cached for the session.
 */

import os from 'os';
import { execFileSync } from 'child_process';

/**
 * Collects the current system environment fingerprint.
 * GPU detection is best-effort — falls back gracefully if nvidia-smi
 * is unavailable (integrated GPU, AMD, or no GPU at all).
 *
 * @returns {object} Environment record with platform, CPU, RAM, GPU, and Node version
 */
export function collectEnvironment() {
  const env = {
    platform: os.platform(),
    os_version: os.release(),
    arch: os.arch(),
    ram_total_gb: Math.round(os.totalmem() / (1024 ** 3)),
    cpu_model: os.cpus()[0]?.model || 'unknown',
    cpu_cores: os.cpus().length,
    node_version: process.version,
    collected_at: new Date().toISOString()
  };

  // Try to detect GPU via nvidia-smi (safe: no user input, hardcoded args)
  try {
    const nvidiaSmi = execFileSync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits'
    ], { timeout: 5000 }).toString().trim();
    if (nvidiaSmi) {
      const parts = nvidiaSmi.split(',').map(s => s.trim());
      env.gpu_model = parts[0] || 'unknown';
      env.gpu_vram_mb = parseInt(parts[1]) || 0;
      env.gpu_driver = parts[2] || 'unknown';
    }
  } catch {
    env.gpu_model = 'not detected';
    env.gpu_vram_mb = 0;
    env.gpu_driver = 'unknown';
  }

  return env;
}

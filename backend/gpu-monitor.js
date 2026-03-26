import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// nvidia-smi path — on Windows it's typically in System32 or on PATH
const NVIDIA_SMI = process.platform === 'win32'
  ? 'C:\\Windows\\System32\\nvidia-smi.exe'
  : 'nvidia-smi';

/**
 * Query GPU stats via nvidia-smi.
 * Returns a structured object with GPU name, memory, utilization, temp, power.
 * Returns null on any error (missing driver, no GPU, etc).
 */
export async function getGpuStatus() {
  try {
    const { stdout } = await execFileAsync(NVIDIA_SMI, [
      '--query-gpu=name,memory.used,memory.total,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit',
      '--format=csv,nounits,noheader'
    ], { timeout: 5000 });

    const line = stdout.trim().split('\n')[0]; // First GPU only
    if (!line) return null;

    const parts = line.split(',').map(s => s.trim());
    if (parts.length < 9) return null;

    const gpu = {
      name: parts[0],
      memory: {
        used: parseFloat(parts[1]),
        total: parseFloat(parts[2]),
        free: parseFloat(parts[3]),
        unit: 'MiB'
      },
      utilization: {
        gpu: parseFloat(parts[4]),
        memory: parseFloat(parts[5])
      },
      temperature: parseFloat(parts[6]),
      power: {
        draw: parseFloat(parts[7]),
        limit: parseFloat(parts[8])
      }
    };

    // Get running processes
    let processes = [];
    try {
      const { stdout: procOut } = await execFileAsync(NVIDIA_SMI, [
        '--query-compute-apps=pid,name,used_memory',
        '--format=csv,nounits,noheader'
      ], { timeout: 5000 });

      const procLines = procOut.trim().split('\n').filter(l => l.trim());
      processes = procLines.map(l => {
        const p = l.split(',').map(s => s.trim());
        return {
          pid: parseInt(p[0], 10),
          name: p[1] || 'Unknown',
          memoryUsed: parseFloat(p[2]) || 0
        };
      }).filter(p => !isNaN(p.pid));
    } catch {
      // No compute processes or query failed — not critical
    }

    return { ...gpu, processes, online: true };
  } catch (err) {
    // nvidia-smi not found, GPU not available, etc.
    return {
      online: false,
      error: err.code === 'ENOENT' ? 'nvidia-smi not found' : err.message
    };
  }
}

/**
 * GPU history ring buffer — keeps last 60 samples (5s interval = 5 minutes).
 * Stores only utilization + memory used + temperature for sparkline rendering.
 */
const GPU_HISTORY_MAX = 60;
const GPU_POLL_INTERVAL = 5000;
const gpuHistory = [];
let pollTimer = null;

async function sampleGpu() {
  const status = await getGpuStatus();
  if (status?.online) {
    gpuHistory.push({
      timestamp: Date.now(),
      gpuUtil: status.utilization.gpu,
      memUtil: status.utilization.memory,
      memUsed: status.memory.used,
      temperature: status.temperature,
      powerDraw: status.power.draw
    });
    if (gpuHistory.length > GPU_HISTORY_MAX) {
      gpuHistory.shift();
    }
  }
}

export function startGpuPolling() {
  if (pollTimer) return;
  // Take an immediate sample, then poll
  sampleGpu();
  pollTimer = setInterval(sampleGpu, GPU_POLL_INTERVAL);
}

export function stopGpuPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function getGpuHistory() {
  return [...gpuHistory];
}

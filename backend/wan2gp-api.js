/**
 * Wan2GP Gradio API client — controls the running Wan2GP instance.
 *
 * Uses Wan2GP's Gradio API at localhost:42003 for operations that
 * control the running app (release VRAM, abort, pause, resume, status).
 *
 * Render submission still uses the CLI bridge (wgp.py --process)
 * because the Gradio API requires internal state for generation.
 *
 * Port discovery: checks common ports, falls back to 42003.
 */

const DEFAULT_PORT = 42003;
const API_PREFIX = '/gradio_api';

let cachedPort = null;

/**
 * Find the Wan2GP Gradio port by scanning common ports.
 * Caches the result after first successful discovery.
 */
async function findPort() {
  if (cachedPort) {
    // Verify cached port still works
    try {
      const res = await fetch(`http://localhost:${cachedPort}${API_PREFIX}/info`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return cachedPort;
    } catch {}
    cachedPort = null;
  }

  // Scan ports
  const ports = [42003, 7860, 7861, 7862, 7863, 7870];
  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}${API_PREFIX}/info`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        // Verify it's actually Wan2GP by checking for known endpoints
        const eps = { ...data.named_endpoints, ...data.unnamed_endpoints };
        if (eps['/release_ram_and_notify'] || eps['/process_tasks']) {
          cachedPort = port;
          console.log(`[Wan2GP API] Found at port ${port}`);
          return port;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Call a Gradio API endpoint. Returns the event_id on success.
 * Gradio endpoints are async — they return an event_id, and results
 * come via SSE stream. For fire-and-forget operations (abort, release),
 * we just need the event_id confirmation.
 */
async function callEndpoint(endpoint, data = []) {
  const port = await findPort();
  if (!port) throw new Error('Wan2GP is not running');

  const url = `http://localhost:${port}${API_PREFIX}/call${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`Wan2GP API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Call an endpoint and wait for the result via SSE stream.
 * Used for endpoints that return data (like status).
 */
async function callAndWait(endpoint, data = [], timeoutMs = 10000) {
  const port = await findPort();
  if (!port) throw new Error('Wan2GP is not running');

  const url = `http://localhost:${port}${API_PREFIX}/call${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) throw new Error(`Wan2GP API error: ${res.status}`);

  const { event_id } = await res.json();
  if (!event_id) throw new Error('No event_id returned');

  // Read SSE result
  const resultUrl = `http://localhost:${port}${API_PREFIX}/call${endpoint}/${event_id}`;
  const sseRes = await fetch(resultUrl, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await sseRes.text();

  // Parse SSE format: "event: complete\ndata: [...]"
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.substring(6));
      } catch {
        return line.substring(6);
      }
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────

/** Check if Wan2GP Gradio API is reachable */
export async function isAvailable() {
  const port = await findPort();
  return port !== null;
}

/** Get the discovered port */
export async function getPort() {
  return findPort();
}

/** Release VRAM — unload models from GPU memory */
export async function releaseVram() {
  return callEndpoint('/release_ram_and_notify', [null]);
}

/** Abort current generation */
export async function abortGeneration() {
  return callEndpoint('/abort_generation', [null]);
}

/** Pause current generation (can resume later) */
export async function pauseGeneration() {
  return callEndpoint('/pause_generation', [null]);
}

/** Resume paused generation */
export async function resumeGeneration() {
  return callEndpoint('/resume_generation', [null]);
}

/** Clear Wan2GP's internal queue */
export async function clearQueue() {
  return callEndpoint('/clear_queue_action', [null]);
}

/** Get current status from Wan2GP */
export async function getStatus() {
  try {
    const result = await callAndWait('/refresh_status_async', [], 5000);
    return { online: true, status: result };
  } catch {
    return { online: false, status: null };
  }
}

/** Get list of available LoRA files */
export async function refreshLoraList() {
  try {
    return await callEndpoint('/refresh_lora_list', ['', []]);
  } catch {
    return null;
  }
}

export default {
  isAvailable,
  getPort,
  releaseVram,
  abortGeneration,
  pauseGeneration,
  resumeGeneration,
  clearQueue,
  getStatus,
  refreshLoraList,
  findPort
};

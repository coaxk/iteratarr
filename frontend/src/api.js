const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: data }),
  getProject: (id) => request(`/projects/${id}`),
  createScene: (projectId, data) => request(`/projects/${projectId}/scenes`, { method: 'POST', body: data }),

  // Clips
  listClips: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/clips${qs ? `?${qs}` : ''}`);
  },
  createClip: (data) => request('/clips', { method: 'POST', body: data }),
  updateClip: (id, data) => request(`/clips/${id}`, { method: 'PATCH', body: data }),
  getClipIterations: (id) => request(`/clips/${id}/iterations`),

  // Iterations
  createIteration: (data) => request('/iterations', { method: 'POST', body: data }),
  getIteration: (id) => request(`/iterations/${id}`),
  updateIteration: (id, data) => request(`/iterations/${id}`, { method: 'PATCH', body: data }),
  evaluate: (id, data) => request(`/iterations/${id}/evaluate`, { method: 'POST', body: data }),
  lock: (id) => request(`/iterations/${id}/lock`, { method: 'POST' }),
  generateNext: (id) => request(`/iterations/${id}/next`, { method: 'POST' }),

  // Characters
  listCharacters: () => request('/characters'),
  createCharacter: (data) => request('/characters', { method: 'POST', body: data }),
  getCharacter: (id) => request(`/characters/${id}`),
  updateCharacter: (id, data) => request(`/characters/${id}`, { method: 'PATCH', body: data }),

  // Production Queue
  listQueue: () => request('/queue'),

  // Config
  getConfigPaths: () => request('/config/paths'),

  // File Browser
  browseFiles: (path) => request(`/browser?path=${encodeURIComponent(path || '')}`),

  // Frames
  listFrames: (iterationId) => request(`/frames/${iterationId}`),
  extractFrames: (videoPath, iterationId, count = 4) =>
    request('/frames/extract', { method: 'POST', body: { video_path: videoPath, iteration_id: iterationId, count } }),

  // Telemetry
  getTelemetryStatus: () => request('/telemetry/status'),
  toggleTelemetry: (enabled) => request('/telemetry/toggle', { method: 'POST', body: { enabled } }),
  exportTelemetry: () => request('/telemetry/export'),

  // Render tracking
  renderComplete: (id, detectedAt) => request(`/iterations/${id}/render-complete`, { method: 'POST', body: { detected_at: detectedAt } }),

  // Templates
  listTemplates: () => request('/templates'),
  createTemplate: (data) => request('/templates', { method: 'POST', body: data }),
  getTemplate: (id) => request(`/templates/${id}`),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  generateFromTemplate: (id, data) => request(`/templates/${id}/generate`, { method: 'POST', body: data }),
};

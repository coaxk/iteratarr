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
  deleteClip: (id, force = false) => request(`/clips/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
  getClipIterations: (id, branchId) => request(`/clips/${id}/iterations${branchId ? `?branch_id=${branchId}` : ''}`),

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
  deleteCharacter: (id) => request(`/characters/${id}`, { method: 'DELETE' }),
  getCharacterPhotos: (id) => request(`/characters/${id}/photos`),
  uploadCharacterPhotos: (id, photos) => request(`/characters/${id}/photos`, { method: 'POST', body: { photos } }),
  deleteCharacterPhoto: (id, filename) => request(`/characters/${id}/photos/${filename}`, { method: 'DELETE' }),
  generateBaselineJson: (id, seed) => request(`/characters/${id}/baseline-json`, { method: 'POST', body: { seed } }),
  testCharacter: (id) => request(`/characters/${id}/test`, { method: 'POST' }),

  // Production Queue (legacy — locked iterations)
  listProductionQueue: () => request('/production-queue'),

  // Render Queue (queue manager)
  listQueue: () => request('/queue'),
  addToQueue: (data) => request('/queue', { method: 'POST', body: data }),
  removeFromQueue: (id) => request(`/queue/${id}`, { method: 'DELETE' }),
  getIterationQueueStatus: (iterationId) => request(`/queue/iteration/${iterationId}`),
  retryQueueItem: (id) => request(`/queue/retry/${id}`, { method: 'POST' }),
  updateQueueItem: (id, data) => request(`/queue/${id}`, { method: 'PATCH', body: data }),
  reorderQueue: (order) => request('/queue/reorder', { method: 'POST', body: { order } }),
  startQueue: async () => {
    const status = await request('/render/status');
    if (!status.available) throw new Error('Wan2GP is not running. Open Pinokio → start Wan2GP before starting the queue.');
    return request('/queue/start', { method: 'POST' });
  },
  pauseQueue: () => request('/queue/pause', { method: 'POST' }),
  getQueueStatus: () => request('/queue/status'),
  clearCompletedQueue: () => request('/queue/clear-completed', { method: 'POST' }),

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

  // Wan2GP render bridge
  getRenderStatus: () => request('/render/status'),
  submitRender: async (jsonPath) => {
    const status = await request('/render/status');
    if (!status.available) throw new Error('Wan2GP is not running. Open Pinokio → start Wan2GP, then try again.');
    return request('/render/single', { method: 'POST', body: { json_path: jsonPath } });
  },
  submitBatchRender: async (data) => {
    const status = await request('/render/status');
    if (!status.available) throw new Error('Wan2GP is not running. Open Pinokio → start Wan2GP, then try again.');
    return request('/render/batch', { method: 'POST', body: data });
  },
  submitBatchPaths: async (paths) => {
    const status = await request('/render/status');
    if (!status.available) throw new Error('Wan2GP is not running. Open Pinokio → start Wan2GP, then try again.');
    return request('/render/batch', { method: 'POST', body: { json_paths: paths } });
  },

  // Seed Screening
  generateSeedScreen: (clipId, data) => request(`/clips/${clipId}/seed-screen`, { method: 'POST', body: data }),
  getSeedScreen: (clipId) => request(`/clips/${clipId}/seed-screen`),
  updateSeedScreen: (clipId, screenId, data) => request(`/clips/${clipId}/seed-screen/${screenId}`, { method: 'PATCH', body: data }),
  deleteSeedScreen: (clipId, screenId) => request(`/clips/${clipId}/seed-screen/${screenId}`, { method: 'DELETE' }),
  selectSeed: (clipId, data) => request(`/clips/${clipId}/select-seed`, { method: 'POST', body: data }),

  // Branches
  listBranches: (clipId) => request(`/clips/${clipId}/branches`),
  createBranch: (clipId, data) => request(`/clips/${clipId}/branches`, { method: 'POST', body: data }),
  getBranch: (clipId, branchId) => request(`/clips/${clipId}/branches/${branchId}`),
  updateBranch: (clipId, branchId, data) => request(`/clips/${clipId}/branches/${branchId}`, { method: 'PATCH', body: data }),
  deleteBranch: (clipId, branchId) => request(`/clips/${clipId}/branches/${branchId}`, { method: 'DELETE' }),
  getBranchIterations: (branchId) => request(`/branches/${branchId}/iterations`),
  forkBranch: (clipId, data) => request(`/clips/${clipId}/fork`, { method: 'POST', body: data }),

  // Analytics
  getBranchAnalytics: (clipId) => request(`/analytics/branches/${clipId}`),
  compareBranches: (clipId, branchId1, branchId2) =>
    request(`/analytics/branches/${clipId}/compare?branches=${branchId1},${branchId2}`),

  // GPU Monitoring
  gpuStatus: () => request('/gpu/status'),
  gpuHistory: () => request('/gpu/history'),
  releaseVram: () => request('/gpu/release-vram', { method: 'POST' }),
  abortRender: () => request('/gpu/abort', { method: 'POST' }),
  pauseRender: () => request('/gpu/pause', { method: 'POST' }),
  resumeRender: () => request('/gpu/resume', { method: 'POST' }),
  wan2gpInfo: () => request('/gpu/wan2gp'),

  // Vision API auto-scoring
  visionStatus: () => request('/vision/status'),
  visionScore: (iterationId, characterName, useFrames = false) => request('/vision/score', { method: 'POST', body: { iteration_id: iterationId, character_name: characterName, use_frames: useFrames } }),
  visionEstimate: (iterationId) => request(`/vision/estimate/${iterationId}`),
  visionBatch: (iterationIds, characterName) => request('/vision/batch', { method: 'POST', body: { iteration_ids: iterationIds, character_name: characterName } }),

  // Contact Sheets
  createContactSheet: (data) => request('/contactsheet', { method: 'POST', body: data }),

  // Templates
  listTemplates: () => request('/templates'),
  createTemplate: (data) => request('/templates', { method: 'POST', body: data }),
  getTemplate: (id) => request(`/templates/${id}`),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
  generateFromTemplate: (id, data) => request(`/templates/${id}/generate`, { method: 'POST', body: data }),
};

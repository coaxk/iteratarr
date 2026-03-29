/**
 * Shared TanStack Query hooks — centralised data fetching with automatic deduplication.
 *
 * Multiple components can call the same hook (e.g., useQueueStatus) and TanStack Query
 * will make ONE API call shared between all of them. No more 8-10 overlapping setIntervals.
 *
 * Polling is conditional: fast when data is actively changing, stops when idle.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// ─── Queue ────────────────────────────────────────────────

/** Queue status — shared by QueueBadge, ProductionQueue sidebar, EvaluationPanel */
export function useQueueStatus(options = {}) {
  return useQuery({
    queryKey: ['queue', 'status'],
    queryFn: api.getQueueStatus,
    refetchInterval: (query) => {
      const data = query.state.data;
      const active = (data?.counts?.queued || 0) + (data?.counts?.rendering || 0);
      return active > 0 ? 10000 : 30000; // 10s when active, 30s when idle
    },
    staleTime: 5000,
    ...options
  });
}

/** Full queue list — shared by QueueManager, ProductionQueue sidebar */
export function useQueueList(options = {}) {
  return useQuery({
    queryKey: ['queue', 'list'],
    queryFn: api.listQueue,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some(i => i.status === 'queued' || i.status === 'rendering');
      return hasActive ? 15000 : 60000; // 15s when active, 60s when idle
    },
    staleTime: 10000,
    ...options
  });
}

/** Queue status for a specific iteration */
export function useIterationQueueStatus(iterationId, options = {}) {
  return useQuery({
    queryKey: ['queue', 'iteration', iterationId],
    queryFn: () => api.getIterationQueueStatus(iterationId),
    enabled: !!iterationId,
    staleTime: 5000,
    ...options
  });
}

// ─── GPU ──────────────────────────────────────────────────

/** GPU status — shared by GpuStatus widget */
export function useGpuStatus(options = {}) {
  return useQuery({
    queryKey: ['gpu', 'status'],
    queryFn: api.gpuStatus,
    refetchInterval: 10000, // 10s always — GPU changes are continuous
    staleTime: 5000,
    ...options
  });
}

/** GPU history for sparkline */
export function useGpuHistory(options = {}) {
  return useQuery({
    queryKey: ['gpu', 'history'],
    queryFn: api.gpuHistory,
    refetchInterval: 10000,
    staleTime: 5000,
    ...options
  });
}

// ─── Render ───────────────────────────────────────────────

/** Render status — shared by RenderStatus, EvaluationPanel */
export function useRenderStatus(options = {}) {
  return useQuery({
    queryKey: ['render', 'status'],
    queryFn: api.getRenderStatus,
    refetchInterval: (query) => {
      const data = query.state.data;
      const active = data?.queue?.active > 0;
      return active ? 10000 : 60000; // 10s when rendering, 60s when idle
    },
    staleTime: 5000,
    ...options
  });
}

// ─── Vision API ───────────────────────────────────────────

/** Vision API availability — cached for session */
export function useVisionStatus(options = {}) {
  return useQuery({
    queryKey: ['vision', 'status'],
    queryFn: api.visionStatus,
    staleTime: 5 * 60000, // 5 min cache — API key doesn't change mid-session
    refetchInterval: false, // no polling
    ...options
  });
}

// ─── Clips & Characters ──────────────────────────────────

/** All clips — shared by EpisodeTracker, character filter */
export function useClips(options = {}) {
  return useQuery({
    queryKey: ['clips'],
    queryFn: api.listClips,
    staleTime: 15000,
    ...options
  });
}

/** Characters list */
export function useCharacters(options = {}) {
  return useQuery({
    queryKey: ['characters'],
    queryFn: api.listCharacters,
    staleTime: 15000,
    ...options
  });
}

/** Production queue (legacy locked items) */
export function useProductionQueue(options = {}) {
  return useQuery({
    queryKey: ['production-queue'],
    queryFn: api.listProductionQueue,
    staleTime: 30000,
    refetchInterval: false,
    ...options
  });
}

// ─── Invalidation helpers ─────────────────────────────────

/** Call after queue mutations (add, remove, retry, start, pause) */
export function useInvalidateQueue() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['queue'] });
  };
}

/** Call after iteration mutations (evaluate, generate, lock) */
export function useInvalidateIterations() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['clips'] });
    qc.invalidateQueries({ queryKey: ['queue'] });
  };
}

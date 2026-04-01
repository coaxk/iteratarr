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
    staleTime: Infinity, // API key doesn't change — never re-check after first load
    refetchInterval: false,
    refetchOnWindowFocus: false,
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

/** Templates list */
export function useTemplates(options = {}) {
  return useQuery({
    queryKey: ['templates'],
    queryFn: api.listTemplates,
    staleTime: 30000,
    ...options
  });
}

/** Iterations for a clip — optionally filtered by branch. Lightweight (no json_contents). */
export function useClipIterations(clipId, branchId, options = {}) {
  return useQuery({
    queryKey: ['iterations', clipId, branchId || 'all'],
    queryFn: () => api.getClipIterations(clipId, branchId),
    enabled: !!clipId,
    staleTime: 10000,
    ...options
  });
}

/** Single iteration with full data (includes json_contents) */
export function useIteration(iterationId, options = {}) {
  return useQuery({
    queryKey: ['iteration', iterationId],
    queryFn: () => api.getIteration(iterationId),
    enabled: !!iterationId,
    staleTime: 30000,
    ...options
  });
}

/** Branches for a clip */
export function useClipBranches(clipId, options = {}) {
  return useQuery({
    queryKey: ['branches', clipId],
    queryFn: () => api.listBranches(clipId),
    enabled: !!clipId,
    staleTime: 10000,
    ...options
  });
}

/** Seed screen records for a clip */
export function useSeedScreens(clipId, options = {}) {
  return useQuery({
    queryKey: ['seed-screens', clipId],
    queryFn: () => api.getSeedScreen(clipId),
    enabled: !!clipId,
    staleTime: 15000,
    ...options
  });
}

/** Branch analytics */
export function useBranchAnalytics(clipId, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'branches', clipId],
    queryFn: () => api.getBranchAnalytics(clipId),
    enabled: !!clipId,
    staleTime: 30000,
    ...options
  });
}

/** Cross-branch comparison */
export function useBranchComparison(clipId, branchIds, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'compare', clipId, branchIds],
    queryFn: () => api.compareBranches(clipId, branchIds),
    enabled: !!clipId && branchIds?.length === 2,
    staleTime: 30000,
    ...options
  });
}

/** Cross-clip overview analytics — used by CrossClipDashboard */
export function useOverviewAnalytics(options = {}) {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.getOverviewAnalytics(),
    staleTime: 60_000,   // 1 min — not real-time data
    gcTime: 5 * 60_000,
    ...options
  });
}

/** Seed analytics — used by the analytics dashboard Seeds tab */
export function useSeedsAnalytics(options = {}) {
  return useQuery({
    queryKey: ['analytics', 'seeds'],
    queryFn: () => api.getSeedsAnalytics(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    ...options
  });
}

/** Detailed analytics for a specific seed */
export function useSeedAnalytics(seed, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'seed', seed],
    queryFn: () => api.getSeedAnalytics(seed),
    enabled: Number.isFinite(Number(seed)),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    ...options
  });
}

/** Batched seed thumbnails for Seed HQ to avoid per-row frame requests */
export function useSeedThumbnails(clipId, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'seed-thumbnails', clipId],
    queryFn: () => api.getSeedThumbnails(clipId),
    enabled: !!clipId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    ...options
  });
}

/** Async personality profile job status for a seed */
export function useSeedPersonalityProfileStatus(seed, options = {}) {
  return useQuery({
    queryKey: ['analytics', 'seed-profile-job', seed],
    queryFn: () => api.getSeedPersonalityProfileStatus(seed),
    enabled: Number.isFinite(Number(seed)),
    staleTime: 2_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'queued' || status === 'running' ? 2000 : false;
    },
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

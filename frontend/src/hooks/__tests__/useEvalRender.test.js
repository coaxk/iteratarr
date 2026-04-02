import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEvalRender } from '../useEvalRender';
import { useIterationQueueStatus, useRenderStatus } from '../useQueries';

vi.mock('../useQueries', () => ({
  useIterationQueueStatus: vi.fn(() => ({ data: null })),
  useRenderStatus: vi.fn(() => ({ data: null })),
}));

vi.mock('../../api', () => ({
  api: {
    updateIteration: vi.fn(() => Promise.resolve({}))
  }
}));

function buildIteration(overrides = {}) {
  return {
    id: 'iter-1',
    status: 'pending',
    render_path: null,
    json_path: '/tmp/iter-1.json',
    ...overrides
  };
}

describe('useEvalRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() => Promise.resolve({ ok: false }));
    useIterationQueueStatus.mockReturnValue({ data: null });
    useRenderStatus.mockReturnValue({ data: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks pending iteration as pending', () => {
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'pending' })));
    expect(result.current.isPending).toBe(true);
  });

  it('marks failed iteration as pending', () => {
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'failed' })));
    expect(result.current.isPending).toBe(true);
  });

  it('marks rendered iteration as not pending', () => {
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'rendered' })));
    expect(result.current.isPending).toBe(false);
  });

  it('resets internal state when iteration id changes', () => {
    const { result, rerender } = renderHook(({ iter }) => useEvalRender(iter), {
      initialProps: { iter: buildIteration({ id: 'iter-1' }) }
    });

    act(() => {
      result.current.setQueueAdded('queued');
      result.current.setRenderStatus('rendering');
      result.current.setRenderProgress({ percent: 20 });
    });
    expect(result.current.queueAdded).toBe('queued');

    rerender({ iter: buildIteration({ id: 'iter-2' }) });
    expect(result.current.queueAdded).toBe(false);
    expect(result.current.renderStatus).toBeNull();
    expect(result.current.renderProgress).toBeNull();
  });

  it('fires HEAD check for pending iteration with render_path and sets complete on success', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'pending', render_path: '/render.mp4' })));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/video?path=%2Frender.mp4', { method: 'HEAD' });
      expect(result.current.renderStatus).toBe('complete');
    });
  });

  it('does not run HEAD check for non-pending iteration', async () => {
    renderHook(() => useEvalRender(buildIteration({ status: 'rendered', render_path: '/render.mp4' })));
    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('syncs queueAdded from iterQueueStatus', () => {
    useIterationQueueStatus.mockReturnValue({ data: { in_queue: true, status: 'queued' } });
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'pending' })));
    expect(result.current.queueAdded).toBe('queued');
  });

  it('syncs renderStatus and renderProgress from iterQueueStatus rendering data', () => {
    useIterationQueueStatus.mockReturnValue({
      data: { in_queue: true, status: 'rendering', progress: { percent: 45 } }
    });
    const { result } = renderHook(() => useEvalRender(buildIteration({ status: 'pending' })));
    expect(result.current.renderStatus).toBe('rendering');
    expect(result.current.renderProgress).toEqual({ percent: 45 });
  });
});


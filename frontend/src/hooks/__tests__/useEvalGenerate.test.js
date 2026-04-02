import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useEvalGenerate } from '../useEvalGenerate';

function buildIteration(overrides = {}) {
  return {
    id: 'iter-1',
    json_contents: { prompt: 'a man walking', guidance_scale: 5.9 },
    ...overrides
  };
}

describe('useEvalGenerate', () => {
  it('syncs output state from child iteration on mount', () => {
    const child = { json_contents: { prompt: 'a man running' }, json_path: '/path/iter_02.json', json_filename: 'iter_02.json' };
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), child, {}));
    expect(result.current.outputJson).toEqual(child.json_contents);
    expect(result.current.generatedPath).toBe('/path/iter_02.json');
  });

  it('keeps output state null when child iteration is null', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    expect(result.current.outputJson).toBeNull();
    expect(result.current.generatedPath).toBeNull();
  });

  it('resets output state when iteration id changes and no child exists', () => {
    const child = { json_contents: { prompt: 'x' }, json_path: '/path/a.json', json_filename: 'a.json' };
    const { result, rerender } = renderHook(({ iteration, childIteration }) => useEvalGenerate(iteration, childIteration, {}), {
      initialProps: { iteration: buildIteration({ id: 'iter-1' }), childIteration: child }
    });
    expect(result.current.outputJson).toEqual(child.json_contents);

    rerender({ iteration: buildIteration({ id: 'iter-2' }), childIteration: null });
    expect(result.current.outputJson).toBeNull();
    expect(result.current.generatedPath).toBeNull();
  });

  it('applies attribution next_changes to proposedNextJson', () => {
    const attribution = { next_changes: { guidance_scale: 5.5 } };
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, attribution));
    expect(result.current.proposedNextJson).toEqual({ prompt: 'a man walking', guidance_scale: 5.5 });
  });

  it('applies single field attribution change to proposedNextJson', () => {
    const attribution = { next_change_json_field: 'guidance_scale', next_change_value: 4.0 };
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, attribution));
    expect(result.current.proposedNextJson.guidance_scale).toBe(4.0);
  });

  it('returns null proposedNextJson when iteration has no json_contents', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration({ json_contents: null }), null, {}));
    expect(result.current.proposedNextJson).toBeNull();
  });

  it('accepts valid JSON in handleJsonPatchChange without error', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.handleJsonPatchChange('{"prompt":"test"}'));
    expect(result.current.jsonPatchError).toBeNull();
    expect(result.current.jsonPatchText).toBe('{"prompt":"test"}');
  });

  it('sets json parse error for invalid JSON in handleJsonPatchChange', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.handleJsonPatchChange('{invalid'));
    expect(typeof result.current.jsonPatchError).toBe('string');
  });

  it('detects negative quality terms in prompt and sets warning', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.handleJsonPatchChange('{"prompt":"a blurry man walking"}'));
    expect(result.current.jsonPatchPromptWarning).toContain('blurry');
  });

  it('does not set warning for clean prompt content', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.handleJsonPatchChange('{"prompt":"a man walking in sunlight"}'));
    expect(result.current.jsonPatchPromptWarning).toBeNull();
  });

  it('opens json patch editor and pre-fills from proposedNextJson', () => {
    const attribution = { next_changes: { guidance_scale: 5.5 } };
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, attribution));
    act(() => result.current.handleOpenJsonPatch());
    expect(result.current.showJsonPatch).toBe(true);
    expect(result.current.jsonPatchText).toBe(JSON.stringify({ prompt: 'a man walking', guidance_scale: 5.5 }, null, 2));
  });

  it('returns parsed object from getJsonOverride when patch is open and valid', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => {
      result.current.handleOpenJsonPatch();
      result.current.handleJsonPatchChange('{"prompt":"ok"}');
    });
    expect(result.current.getJsonOverride()).toEqual({ prompt: 'ok' });
  });

  it('returns undefined from getJsonOverride when patch has error', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => {
      result.current.handleOpenJsonPatch();
      result.current.handleJsonPatchChange('{bad');
    });
    expect(result.current.getJsonOverride()).toBeUndefined();
  });

  it('returns undefined from getJsonOverride when patch is not open', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.handleJsonPatchChange('{"prompt":"ok"}'));
    expect(result.current.getJsonOverride()).toBeUndefined();
  });

  it('setGenerationResult writes output state and opens generated modal state', () => {
    const { result } = renderHook(() => useEvalGenerate(buildIteration(), null, {}));
    act(() => result.current.setGenerationResult({
      json_path: '/p',
      render_path: '/r',
      json_contents: { a: 1 },
      iteration_number: 5
    }));

    expect(result.current.generatedPath).toBe('/p');
    expect(result.current.renderPath).toBe('/r');
    expect(result.current.outputJson).toEqual({ a: 1 });
    expect(result.current.generatedIterNum).toBe(5);
    expect(result.current.showGenerated).toBe(true);
  });
});


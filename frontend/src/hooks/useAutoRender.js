import { useState, useCallback } from 'react';

const STORAGE_KEY = 'iteratarr_auto_render';

/**
 * Shared hook for auto-render preference.
 * Persisted in localStorage, default OFF.
 * Any component that calls this hook gets the same underlying value.
 */
export function useAutoRender() {
  const [autoRender, setAutoRenderState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setAutoRender = useCallback((value) => {
    const newVal = typeof value === 'function' ? value(autoRender) : value;
    setAutoRenderState(newVal);
    try {
      localStorage.setItem(STORAGE_KEY, String(newVal));
    } catch {
      // localStorage unavailable — still works in-memory
    }
  }, [autoRender]);

  const toggleAutoRender = useCallback(() => {
    setAutoRender(prev => !prev);
  }, [setAutoRender]);

  return { autoRender, setAutoRender, toggleAutoRender };
}

/**
 * Read-only check — for components that just need to know the current value
 * without needing to toggle it (e.g., GeneratedModal).
 */
export function getAutoRender() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

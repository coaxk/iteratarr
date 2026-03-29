import { useRef, useEffect, useCallback } from 'react';

/**
 * useTimeout — auto-cleaning setTimeout that won't update unmounted components.
 * Returns a function that sets a timeout. Clears on unmount automatically.
 */
export function useTimeout() {
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  const set = useCallback((fn, ms) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      fn();
    }, ms);
  }, []);

  const clear = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  return { set, clear };
}

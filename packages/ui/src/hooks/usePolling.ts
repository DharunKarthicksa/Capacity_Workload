import { useCallback, useEffect, useRef, useState } from "react";

export interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** When the last successful load finished. */
  updatedAt: Date | undefined;
  reload: () => void;
}

/** Runs `load` now and then every `intervalMs`. Keeps the last good data when a refresh fails. */
export function usePolling<T>(load: () => Promise<T>, deps: readonly unknown[], intervalMs = 30_000, enabled = true): PollState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (my !== seq.current) return;
      setData(result);
      setError(undefined);
      setUpdatedAt(new Date());
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    const t = setInterval(() => void run(), intervalMs);
    return () => { seq.current++; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, run, ...deps]);

  return { data, error, loading, updatedAt, reload: () => void run() };
}

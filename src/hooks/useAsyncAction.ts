import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

interface UseAsyncActionOptions<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
  minLoadTime?: number;
}

/**
 * Wraps an async action with:
 *  - loading state management
 *  - minimum visible loading time (default 500ms for UX consistency)
 *  - race condition prevention (ignores stale calls)
 *  - automatic toast on error (unless overridden)
 *
 * Usage:
 *   const [run, loading] = useAsyncAction(async () => {
 *     await saveData();
 *   }, { successMessage: 'Saved!' });
 */
export function useAsyncAction<T = void>(
  action: () => Promise<T>,
  options: UseAsyncActionOptions<T> = {}
): [() => Promise<void>, boolean] {
  const {
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    minLoadTime = 500,
  } = options;

  const [loading, setLoading] = useState(false);
  const runningRef = useRef(false);
  const callIdRef = useRef(0);

  const run = useCallback(async () => {
    if (runningRef.current) return;

    runningRef.current = true;
    const callId = ++callIdRef.current;
    setLoading(true);

    const start = Date.now();

    try {
      const result = await action();

      if (callId !== callIdRef.current) return;

      const elapsed = Date.now() - start;
      if (elapsed < minLoadTime) {
        await new Promise(r => setTimeout(r, minLoadTime - elapsed));
      }

      if (successMessage) toast.success(successMessage);
      onSuccess?.(result);
    } catch (err: any) {
      if (callId !== callIdRef.current) return;

      const elapsed = Date.now() - start;
      if (elapsed < minLoadTime) {
        await new Promise(r => setTimeout(r, minLoadTime - elapsed));
      }

      const msg = errorMessage ?? err?.message ?? 'Something went wrong';
      if (!onError) {
        toast.error(msg);
      } else {
        onError(err instanceof Error ? err : new Error(msg));
      }
    } finally {
      if (callId === callIdRef.current) {
        setLoading(false);
        runningRef.current = false;
      }
    }
  }, [action, minLoadTime, successMessage, errorMessage, onSuccess, onError]);

  return [run, loading];
}

export default useAsyncAction;

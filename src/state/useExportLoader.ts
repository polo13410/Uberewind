import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadResult } from '../core/types';
import type { WorkerRequest, WorkerResponse } from '../worker/protocol';

export type LoaderState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'ready'; result: LoadResult }
  | { status: 'error'; message: string };

/**
 * Owns the parser worker. Everything lives in memory only (no localStorage /
 * IndexedDB): `reset()` terminates the worker and drops the parsed data.
 */
export function useExportLoader() {
  const [state, setState] = useState<LoaderState>({ status: 'idle' });
  const workerRef = useRef<Worker | null>(null);

  const stop = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const load = useCallback(
    (files: File[]) => {
      stop();
      if (!files.length) return;
      setState({ status: 'loading', message: 'Démarrage…' });
      let worker: Worker;
      try {
        worker = new Worker(new URL('../worker/parser.worker.ts', import.meta.url), { type: 'module' });
      } catch (e) {
        setState({ status: 'error', message: `Impossible de démarrer le lecteur (${String(e)}).` });
        return;
      }
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        if (workerRef.current !== worker) return; // stale worker
        const msg = ev.data;
        if (msg.type === 'progress') setState({ status: 'loading', message: msg.message });
        else if (msg.type === 'result') {
          setState({ status: 'ready', result: msg.result });
          stop();
        } else {
          setState({ status: 'error', message: msg.message });
          stop();
        }
      };
      worker.onerror = (ev) => {
        ev.preventDefault();
        if (workerRef.current !== worker) return;
        setState({ status: 'error', message: ev.message || 'Erreur inattendue pendant la lecture.' });
        stop();
      };
      const req: WorkerRequest = { type: 'parse', files };
      worker.postMessage(req);
    },
    [stop],
  );

  const reset = useCallback(() => {
    stop();
    setState({ status: 'idle' });
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { state, load, reset };
}

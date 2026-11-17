/**
 * Parsing runs here so the UI thread never freezes. The worker receives File
 * objects (structured-cloned, no copy of the content on the UI side), reads
 * them, and posts back the compact dataset + stats + warnings.
 * No network access is used or possible (CSP connect-src 'none').
 */
import { loadExport, type InputFile } from '../core/loadExport';
import type { WorkerRequest, WorkerResponse } from './protocol';

const post = (msg: WorkerResponse) => (self as unknown as { postMessage(m: WorkerResponse): void }).postMessage(msg);

self.addEventListener('message', async (ev: MessageEvent<WorkerRequest>) => {
  if (ev.data?.type !== 'parse') return;
  try {
    const inputs: InputFile[] = [];
    for (const file of ev.data.files) {
      post({ type: 'progress', message: `Lecture de ${file.name}…` });
      inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    const result = loadExport(inputs, (message) => post({ type: 'progress', message }));
    post({ type: 'result', result });
  } catch (e) {
    post({ type: 'fatal', message: e instanceof Error ? e.message : String(e) });
  }
});

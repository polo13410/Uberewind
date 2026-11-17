import type { LoadResult } from '../core/types';

export type WorkerRequest = { type: 'parse'; files: File[] };

export type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'result'; result: LoadResult }
  | { type: 'fatal'; message: string };

import type { ParseWarning, WarningLevel } from './types';

/** Per-file context handed to parsers: lets them emit warnings tagged with the file name. */
export interface ParseContext {
  file: string;
  warn(level: WarningLevel, message: string): void;
}

export function createContext(file: string, sink: ParseWarning[]): ParseContext {
  return {
    file,
    warn(level, message) {
      sink.push({ level, file, message });
    },
  };
}

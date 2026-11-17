import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InputFile } from '../../src/core/loadExport';

export const fixturePath = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

/** Loads a fixture as an InputFile, optionally under another (Uber-style) name. */
export function fixture(name: string, as = name): InputFile {
  return { name: as, bytes: new Uint8Array(readFileSync(fixturePath(name))) };
}

export const utf8 = (s: string) => new TextEncoder().encode(s);

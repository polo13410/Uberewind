/**
 * Integration test on the real export in ./sample-data (git-ignored, personal
 * data). Skipped automatically when the folder is absent.
 * Reference figures come from sample-data/Uber Data/dashboard.html.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadExport } from '../../src/core/loadExport';

const zipPath = fileURLToPath(new URL('../../sample-data/uber-export.zip', import.meta.url));

describe.skipIf(!existsSync(zipPath))('sample-data export', () => {
  const r = existsSync(zipPath)
    ? loadExport([{ name: 'uber-export.zip', bytes: new Uint8Array(readFileSync(zipPath)) }])
    : null!;

  it('matches the reference dashboard figures', () => {
    const rides = r.stats!.rides!;
    expect(rides.total).toBe(86);
    expect(rides.completed).toBe(68);
    expect(rides.km).toBeGreaterThan(559);
    expect(rides.km).toBeLessThan(560.5);
    const eats = r.stats!.eats!;
    expect(eats.orders).toBe(127);
    expect(eats.completed).toBe(125);
    expect(eats.itemLines).toBe(322);
    expect(r.dataset.orders!.reduce((s, o) => s + o.lineCount, 0)).toBe(327);
  });

  it('merges Green and GREEN', () => {
    const p = r.stats!.rides!.products;
    expect(p.find((x) => x.key === 'Green')?.count).toBe(13);
    expect(p.some((x) => x.key === 'GREEN')).toBe(false);
  });

  it('reads all account files and skips sensitive ones', () => {
    expect(r.filesRead).toHaveLength(7);
    expect(r.dataset.support!.messages).toBe(87);
    expect(r.dataset.profile!.rating).toBe(4.76);
    expect(r.warnings.some((w) => w.file === 'eats_app_analytics-0.csv' && /ignoré/.test(w.message))).toBe(true);
    // A clean export only produces informational notices (ignored files).
    expect(r.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(r.warnings.some((w) => /Colonnes absentes/.test(w.message))).toBe(false);
  });
});

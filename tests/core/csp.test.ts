import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CSP, CSP_DIRECTIVES } from '../../csp';

describe('Content-Security-Policy', () => {
  const toml = readFileSync(fileURLToPath(new URL('../../netlify.toml', import.meta.url)), 'utf8');

  it('netlify.toml uses exactly the CSP from csp.ts', () => {
    const m = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(toml);
    expect(m?.[1]).toBe(CSP);
  });

  it('forbids any network connection and third-party origins', () => {
    expect(CSP_DIRECTIVES['connect-src']).toBe("'none'");
    expect(CSP_DIRECTIVES['default-src']).toBe("'self'");
    expect(CSP).not.toMatch(/https?:|\*|unsafe-eval/);
  });
});

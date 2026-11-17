/**
 * Single source of truth for the Content-Security-Policy.
 * Used by vite.config.ts (build-time <meta> + preview headers) and checked
 * against netlify.toml by tests/core/csp.test.ts.
 */
export const CSP_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  // Street tiles are opt-in (explicit consent in the UI) and image-only:
  // connect-src stays 'none', so no script can send data anywhere.
  'img-src': "'self' https://tile.openstreetmap.org",
  'font-src': "'self'",
  'connect-src': "'none'",
  'worker-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'none'",
  'form-action': "'none'",
  'frame-ancestors': "'none'",
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([k, v]) => `${k} ${v}`)
  .join('; ');

/** frame-ancestors is ignored (and warned about) inside a <meta> tag. */
export const CSP_META = Object.entries(CSP_DIRECTIVES)
  .filter(([k]) => k !== 'frame-ancestors')
  .map(([k, v]) => `${k} ${v}`)
  .join('; ');

/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CSP, CSP_META } from './csp.ts';

/** Inject the CSP as a <meta> tag in production builds only (dev needs HMR websockets). */
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP_META}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  build: {
    // The modulepreload polyfill uses fetch(), which connect-src 'none' forbids.
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  worker: { format: 'es' },
  preview: {
    headers: { 'Content-Security-Policy': CSP },
  },
  test: {
    environment: 'node',
    include: ['tests/core/**/*.test.ts'],
  },
});

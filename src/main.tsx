import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
// Self-hosted fonts (bundled, served from our own origin: font-src 'self').
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';
import './ui/brand/brand.css';
import './ui/map/map.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

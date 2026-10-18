// The stylesheet that declares the cascade layer order must come first, before any component brings in its own CSS.
import './app.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createRoot } from 'react-dom/client';
import { Root } from './app/Root';

createRoot(document.getElementById('root')!).render(<Root />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').then(() => window.dispatchEvent(new Event('tw-sw-registered'))));

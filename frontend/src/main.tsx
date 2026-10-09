import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './ui.css';

createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Explicitly register the service worker
registerSW({ immediate: true })

// Import and initialize mobile touch drag-and-drop polyfill
import { polyfill } from 'mobile-drag-drop';
import 'mobile-drag-drop/default.css';

polyfill();

// Prevent iOS scroll bouncing while dragging
window.addEventListener('touchmove', function(e) {
  if (e.target.closest('.tray-item') || e.target.closest('.board-cell[draggable="true"]')) {
    e.preventDefault();
  }
}, { passive: false });



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fade out and remove preloader once React mounts
const preloader = document.getElementById('app-preloader');
if (preloader) {
  preloader.classList.add('fade-out');
  setTimeout(() => preloader.remove(), 400);
}

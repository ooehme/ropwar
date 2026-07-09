import { logMessage } from './ui/status.js';

export async function clearPwaCaches() {
  logMessage('Cache-Reset gestartet: Service Worker und Cache Storage werden entfernt.');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    logMessage('Cache-Reset fertig. Seite wird neu geladen.');
    window.setTimeout(() => window.location.reload(), 600);
  } catch (error) {
    logMessage(`Cache-Reset fehlgeschlagen: ${error?.message || error}`);
  }
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }
}

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

self.skipWaiting();
clientsClaim();

// Precache injected assets
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching for GitHub API
registerRoute(
  ({ url }) => url.hostname === 'api.github.com',
  new NetworkFirst({
    cacheName: 'github-api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 24 * 60 * 60 // 1 day
      })
    ]
  })
);

// --- Advanced Capabilities ---

// Push Notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "New Notification", body: event.data.text() };
    }
  }

  const title = data.title || "Time for a Lazer Showdown! ⚡";
  const options = {
    body: data.body || "Your alien rivals are waiting. Come play a quick match!",
    icon: "/pwa-192x192.png",
    badge: "/pwa-64x64.png",
    vibrate: [200, 100, 200, 100, 200, 100, 200],
    data: data.url || "/#/",
    actions: data.actions || [
      { action: "play_bot", title: "🤖 Play Bot" },
      { action: "play_online", title: "🌐 Play Online" }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.', event);
  event.notification.close();

  let urlToOpen = new URL(event.notification.data || '/#/', self.location.origin).href;
  
  if (event.action === 'play_bot') {
    urlToOpen = new URL('/#/bot', self.location.origin).href;
  } else if (event.action === 'play_online') {
    urlToOpen = new URL('/#/online', self.location.origin).href;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // If so, just focus it.
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, then open the target URL in a new window/tab.
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync event fired: ', event.tag);
  if (event.tag === 'sync-match-data') {
    event.waitUntil(
      // Implement your custom sync logic here (e.g. sending queued matches to a server)
      new Promise(resolve => {
        console.log("Syncing match data in the background...");
        setTimeout(resolve, 1000);
      })
    );
  }
});

// Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic sync event fired: ', event.tag);
  if (event.tag === 'check-updates') {
    event.waitUntil(
      (async () => {
        try {
          console.log("Periodically checking for app updates from GitHub...");
          const response = await fetch('https://api.github.com/repos/denzven/Lazer-Showdown/commits/main');
          if (response.ok) {
             console.log("Periodic update check succeeded");
          }
        } catch(e) {
          console.error("Periodic update check failed", e);
        }
      })()
    );
  }
});

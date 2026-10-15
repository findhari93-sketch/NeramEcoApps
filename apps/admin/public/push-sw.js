/**
 * Push handlers for the admin service worker. Served as is from /push-sw.js and
 * loaded by the generated sw.js through next-pwa's `importScripts` option
 * (next.config.js). Kept out of a `worker/` folder on purpose: next-pwa compiles
 * that folder with babel-loader, which this app does not install, and the
 * production build failed on it (2026-10-15).
 *
 * Phone alerts: the server sends { title, body, url, tag } with Web Push
 * (packages/database/src/services/staff-push.ts). A tap opens `url` in the
 * admin app, reusing an open window when there is one.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Neram Admin';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((focused) => {
            if (focused && 'navigate' in focused) return focused.navigate(target).catch(() => self.clients.openWindow(target));
            return self.clients.openWindow(target);
          });
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

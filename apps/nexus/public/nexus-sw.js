/*
 * Nexus service worker: the offline rescue screen, and nothing else.
 *
 * Why it exists: with no service worker, a Nexus page that cannot load (no
 * signal, a network that blocks the site, an outage) leaves Android showing its
 * own "Can't connect to the site" box with only an OK button. Students were
 * stuck there with no way to reach us.
 *
 * What it does:
 *   - While the network works it changes nothing. Every request goes to the
 *     network exactly as it would without this file.
 *   - When a PAGE request fails, it answers with a saved copy of /offline
 *     (Try again, quick fixes, WhatsApp and Call).
 *   - When one of that page's own script or style files fails, it answers from
 *     the saved copy, so the rescue screen works fully offline.
 *
 * Deliberately small. next-pwa's generated worker was never registered (its
 * auto-register only reaches the Pages Router entry, and Nexus is App Router
 * only), so switching it on would have precached the whole app on every
 * student's mobile data and started runtime caching nobody had ever run. This
 * does one job. Registered by src/components/help/OfflineReady.tsx, which also
 * tells it the current build so the saved page is refreshed once per deploy.
 *
 * Plain script, no build step: what is here is what ships.
 */

var CACHE = 'nexus-offline';
var OFFLINE_URL = '/offline';
var BUILD_KEY = '/__nexus-offline-build';

/** Script and style files the saved /offline page loads from our own origin. */
function offlineAssetUrls(html) {
  var urls = [];
  var re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g;
  var match;
  while ((match = re.exec(html))) {
    if (urls.indexOf(match[1]) === -1) urls.push(match[1]);
  }
  return urls;
}

/** Save /offline and its files. Keeps the previous copy if anything essential fails. */
function saveOfflinePage(build) {
  return fetch(OFFLINE_URL, { cache: 'reload', credentials: 'omit' }).then(function (response) {
    if (!response.ok) throw new Error('offline page ' + response.status);
    return response
      .clone()
      .text()
      .then(function (html) {
        var assets = offlineAssetUrls(html);
        return caches.open(CACHE).then(function (cache) {
          // One at a time into the cache, each allowed to fail: a missing
          // stylesheet still leaves a usable page with working links.
          return Promise.all(
            assets.map(function (url) {
              return fetch(url).then(
                function (res) {
                  return res.ok ? cache.put(url, res) : undefined;
                },
                function () {
                  return undefined;
                },
              );
            }),
          )
            .then(function () {
              return cache.put(OFFLINE_URL, response);
            })
            .then(function () {
              return cache.put(BUILD_KEY, new Response(build || ''));
            })
            .then(function () {
              // Drop files from older builds that this copy no longer uses.
              return cache.keys().then(function (requests) {
                var keep = assets.concat([OFFLINE_URL, BUILD_KEY]);
                return Promise.all(
                  requests
                    .filter(function (req) {
                      return keep.indexOf(new URL(req.url).pathname) === -1;
                    })
                    .map(function (req) {
                      return cache.delete(req);
                    }),
                );
              });
            });
        });
      });
  });
}

function savedBuild() {
  return caches
    .open(CACHE)
    .then(function (cache) {
      return cache.match(BUILD_KEY);
    })
    .then(function (res) {
      return res ? res.text() : null;
    });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    saveOfflinePage('')
      .catch(function () {
        // Installing offline is fine: the page tells us the build later and
        // the copy is saved then.
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// The page sends { type: 'nexus-build', build } after every start. A new build
// means new script files, so the saved page is refreshed to match.
self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'nexus-build' || !data.build) return;
  event.waitUntil(
    savedBuild()
      .then(function (current) {
        if (current === data.build) return undefined;
        return saveOfflinePage(data.build);
      })
      .catch(function () {
        return undefined;
      }),
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(OFFLINE_URL, { cacheName: CACHE }).then(function (page) {
          return page || Response.error();
        });
      }),
    );
    return;
  }

  // Only the files the saved page needs are ever answered from the cache, and
  // only after the network has failed.
  if (url.pathname.indexOf('/_next/static/') === 0) {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(url.pathname, { cacheName: CACHE }).then(function (file) {
          return file || Response.error();
        });
      }),
    );
  }
});

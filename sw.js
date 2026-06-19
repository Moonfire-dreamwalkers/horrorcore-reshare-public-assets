const CACHE_NAME = 'horrorcore-reshare-v10.3';
const ASSETS = [
  '/',
  '/index.html',
  '/home.html',
  '/artists.html',
  '/artist.html',
  '/services',
  '/services.html',
  '/index.css',
  '/main-v6.js',
  '/album-data.js',
  '/https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/images/hr-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const requests = ASSETS.map(url => new Request(url, { cache: 'reload' }));
      return cache.addAll(requests);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip caching non-GET requests or browser extension/analytics requests
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.hostname.includes('google-analytics') || url.hostname.includes('googletagmanager')) {
    return;
  }

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request, { ignoreSearch: true }).then((response) => {
        // If found in current cache, return it
        if (response) return response;

        // Fallback for root
        if (url.pathname === '/') {
          return cache.match('/index.html', { ignoreSearch: true }).then((htmlResponse) => {
            return htmlResponse || fetch(e.request);
          });
        }

        // Manual Fetch with redirect handling
        return fetch(e.request).then((networkResponse) => {
          // Check if the request is an image asset or a web font
          const isImage = e.request.destination === 'image' ||
            url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/) ||
            url.hostname.includes('spotifycdn.com') ||
            url.hostname.includes('scdn.co') ||
            url.hostname.includes('dicebear.com');

          const isFont = e.request.destination === 'font' ||
            url.pathname.match(/\.(woff|woff2|ttf|otf|eot)$/) ||
            url.hostname.includes('fonts.gstatic.com') ||
            url.hostname.includes('fonts.googleapis.com');

          // Cache dynamic images and fonts successfully loaded
          if ((networkResponse.status === 200 || networkResponse.status === 0) && (isImage || isFont)) {
            cache.put(e.request, networkResponse.clone());
          }

          if (networkResponse.redirected) {
            return new Response(networkResponse.body, {
              status: networkResponse.status,
              statusText: networkResponse.statusText,
              headers: networkResponse.headers
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback for Clean URLs
          if (!url.pathname.includes('.') && !url.pathname.endsWith('/')) {
            return cache.match(url.pathname + '.html', { ignoreSearch: true });
          }
        });
      });
    })
  );
});

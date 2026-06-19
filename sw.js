const CACHE_NAME = 'horrorcore-reshare-v11';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/artists.html',
  '/artist.html',
  '/discord.html',
  '/services.html',
  '/promote.html',
  '/privacy.html',
  '/flyer-builder.html',
  '/flyer-builder-custom.html',
  'https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/images/hr-icon.png'
];

// Network-first strategy: always try network first, fallback to cache
// This ensures instant updates without hard refresh
self.addEventListener('install', (e) => {
  self.skipWaiting();
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

  // 1. Bypass Service Worker cache completely for local development
  if (url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname.startsWith('192.168.')) {
    return;
  }

  // Skip non-GET, extensions, analytics, build version check, and non-http(s)
  if (e.request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'moz-extension:' ||
    !url.protocol.startsWith('http') ||
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager') ||
    url.pathname.includes('build-version.json')) {
    return;
  }

  // Determine file type
  const isHtml = e.request.destination === 'document' || url.pathname.match(/\.html$/) || (!url.pathname.includes('.') && !url.pathname.endsWith('/'));
  const isCode = url.pathname.match(/\.(js|css)$/) || url.hostname.includes('jsdelivr.net');
  const isImage = e.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/) || url.hostname.includes('spotifycdn.com') || url.hostname.includes('scdn.co') || url.hostname.includes('dicebear.com');
  const isFont = e.request.destination === 'font' || url.pathname.match(/\.(woff|woff2|ttf|otf|eot)$/) || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com');

  // Check for versioned (immutable) CDN assets
  const isVersionedCdn = url.hostname.includes('jsdelivr.net') && url.pathname.includes('@') && !url.pathname.includes('@main');

  // 2. Cache-First for versioned/immutable CDN assets (never change)
  if (isVersionedCdn) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate for HTML, mutable JS, and mutable CSS (loads instantly, updates in background)
  if (isHtml || isCode) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const networkFetch = fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return networkResponse;
        }).catch(() => {
          // Ignore network errors silently (fallback to cache)
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // 4. Cache-first for images and fonts (rarely change)
  if (isImage || isFont) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default: Stale-While-Revalidate for everything else
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => { });
      return cached || networkFetch;
    })
  );
});

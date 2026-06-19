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
  '/https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/images/hr-icon.png'
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

  // Skip non-GET, extensions, analytics
  if (e.request.method !== 'GET' || url.protocol === 'chrome-extension:' || url.hostname.includes('google-analytics') || url.hostname.includes('googletagmanager')) {
    return;
  }

  // Determine file type
  const isHtml = e.request.destination === 'document' || url.pathname.match(/\.html$/) || (!url.pathname.includes('.') && !url.pathname.endsWith('/'));
  const isCode = url.pathname.match(/\.(js|css)$/) || url.hostname.includes('jsdelivr.net');
  const isImage = e.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/) || url.hostname.includes('spotifycdn.com') || url.hostname.includes('scdn.co') || url.hostname.includes('dicebear.com');
  const isFont = e.request.destination === 'font' || url.pathname.match(/\.(woff|woff2|ttf|otf|eot)$/) || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('fonts.googleapis.com');

  // Network-first for HTML, JS, CSS (always get latest)
  if (isHtml || isCode) {
    e.respondWith(
      fetch(e.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Cache-first for images and fonts (rarely change)
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

  // Default: network-first for everything else
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

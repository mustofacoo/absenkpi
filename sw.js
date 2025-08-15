const CACHE_NAME = 'Kantor Pusat Ibka';
const DATA_CACHE_NAME = 'KantorPusatIbkaData';

// Daftar file yang akan di-cache
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-72.png',
  './icon-96.png',
  './icon-128.png',
  './icon-144.png',
  './icon-152.png',
  './icon-192.png',
  './icon-384.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.0/dist/umd/supabase.min.js',
  'https://unpkg.com/vue@3/dist/vue.global.js'
];

// Install event - cache resources
self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');
  
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  
  self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (evt) => {
  const { request } = evt;
  const url = new URL(request.url);

  // Handle Supabase API calls
  if (url.origin.includes('supabase')) {
    evt.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(request)
          .then((response) => {
            // If the request was successful, clone the response and store it in the cache
            if (response.status === 200) {
              cache.put(request.url, response.clone());
            }
            return response;
          })
          .catch(() => {
            // If the network request failed, try to get it from the cache
            return cache.match(request);
          });
      })
    );
    return;
  }

  // Handle app shell requests
  if (request.mode !== 'navigate') {
    // Not a page navigation, handle other requests
    evt.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            return response;
          }
          return fetch(request).then((response) => {
            // Don't cache non-successful responses
            if (response.status !== 200) {
              return response;
            }
            // Clone the response and store it in the cache
            const responseClone = response.clone();
            cache.put(request, responseClone);
            return response;
          });
        });
      })
    );
    return;
  }

  // Handle page navigation requests
  evt.respondWith(
    fetch(request).catch(() => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match('./index.html');
      });
    })
  );
});

// Background sync event
self.addEventListener('sync', (evt) => {
  console.log('[ServiceWorker] Background sync', evt.tag);
  
  if (evt.tag === 'background-sync') {
    evt.waitUntil(doBackgroundSync());
  }
});

// Push notification event
self.addEventListener('push', (evt) => {
  console.log('[ServiceWorker] Push received', evt);
  
  let data = {};
  if (evt.data) {
    data = evt.data.json();
  }

  const options = {
    body: data.body || 'Notifikasi HRIS PWA',
    icon: './icon-192.png',
    badge: './icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.primaryKey || 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Buka Aplikasi',
        icon: './icon-192.png'
      },
      {
        action: 'close',
        title: 'Tutup',
        icon: './icon-192.png'
      }
    ]
  };

  evt.waitUntil(
    self.registration.showNotification(data.title || 'HRIS PWA', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (evt) => {
  console.log('[ServiceWorker] Notification click received', evt);

  evt.notification.close();

  if (evt.action === 'close') {
    return;
  }

  evt.waitUntil(
    clients.openWindow('./')
  );
});

// Message event for communication with main thread
self.addEventListener('message', (evt) => {
  console.log('[ServiceWorker] Message received', evt.data);
  
  if (evt.data && evt.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (evt.data && evt.data.type === 'CACHE_CLEAR') {
    evt.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            return caches.delete(cacheName);
          })
        );
      })
    );
  }
});

// Background sync function
async function doBackgroundSync() {
  try {
    console.log('[ServiceWorker] Performing background sync');
    
    // Check if we have any pending data to sync
    const cache = await caches.open(DATA_CACHE_NAME);
    const cachedRequests = await cache.keys();
    
    for (const request of cachedRequests) {
      try {
        // Try to sync each cached request
        const response = await fetch(request);
        if (response.ok) {
          // Update cache with fresh data
          await cache.put(request, response.clone());
        }
      } catch (error) {
        console.log('[ServiceWorker] Sync failed for request:', request.url);
      }
    }
    
    console.log('[ServiceWorker] Background sync completed');
  } catch (error) {
    console.error('[ServiceWorker] Background sync error:', error);
  }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (evt) => {
  console.log('[ServiceWorker] Periodic sync', evt.tag);
  
  if (evt.tag === 'hris-sync') {
    evt.waitUntil(doBackgroundSync());
  }
});

// Share target API (if needed)
self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);
  
  // Handle share target
  if (url.pathname === '/share-target' && evt.request.method === 'POST') {
    evt.respondWith(handleShareTarget(evt.request));
  }
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const title = formData.get('title') || '';
  const text = formData.get('text') || '';
  const url = formData.get('url') || '';

  // Store shared data and redirect to main app
  await caches.open(DATA_CACHE_NAME).then((cache) => {
    const sharedData = { title, text, url, timestamp: Date.now() };
    const response = new Response(JSON.stringify(sharedData));
    return cache.put('/shared-data', response);
  });

  return Response.redirect('./', 303);
}

// Error handling
self.addEventListener('error', (evt) => {
  console.error('[ServiceWorker] Error:', evt.error);
});

self.addEventListener('unhandledrejection', (evt) => {
  console.error('[ServiceWorker] Unhandled promise rejection:', evt.reason);
});

console.log('[ServiceWorker] Loaded');
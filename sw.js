// sw.js - Service Worker para PWA

const CACHE_NAME = 'doce-jardim-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('📦 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Service Worker: Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      return self.clients.claim();
    })
    .then(() => {
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NEW_VERSION_AVAILABLE',
            version: CACHE_NAME
          });
        });
      });
    })
  );
});

// Interceptar requisições (estratégia Network First)
self.addEventListener('fetch', event => {
  // Ignorar requisições de extensões do Chrome e protocolos não HTTP(S)
  const url = new URL(event.request.url);
  if (
    url.protocol !== 'http:' && 
    url.protocol !== 'https:' ||
    event.request.url.startsWith('chrome-extension://')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Só fazer cache de respostas válidas
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        }).catch(err => {
          console.error('Erro ao salvar no cache:', err);
        });
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Listener para mensagem de skip waiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
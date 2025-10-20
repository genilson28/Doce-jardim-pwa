// ==================== SERVICE WORKER - DOCE JARDIM ====================
const CACHE_NAME = 'doce-jardim-v1.0.5';

// Apenas arquivos ESSENCIAIS que sabemos que existem
const ESSENTIAL_ASSETS = [
    './',
    './index.html'
];

self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker: Instalação iniciada');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Cache aberto, adicionando recursos essenciais...');
                // Cache apenas os arquivos críticos
                return cache.addAll(ESSENTIAL_ASSETS).catch(error => {
                    console.warn('Algum recurso não pôde ser cacheado:', error);
                });
            })
            .then(() => {
                console.log('✅ Instalação concluída');
                return self.skipWaiting();
            })
    );
});

self.addEventListener('fetch', (event) => {
    // Apenas intercepta requisições do próprio domínio
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            caches.match(event.request)
                .then(response => response || fetch(event.request))
        );
    }
});

console.log('🍰 Service Worker carregado');
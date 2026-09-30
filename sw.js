// sw.js - Service Worker do Doce Jardim
// Para publicar uma nova versão, basta trocar o número em CACHE_VERSION.

const CACHE_VERSION = 'v6';
const CACHE_NAME = `doce-jardim-${CACHE_VERSION}`;

// Arquivos do app (funcionam offline logo após a 1ª visita)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/css/styles-responsive.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/src/app.js',
  '/src/config/constants.js',
  '/src/config/supabase.js',
  '/src/modules/auth/authModule.js',
  '/src/modules/clientes/clientesModule.js',
  '/src/modules/compras/comprasModule.js',
  '/src/modules/dizimo/dizimoModule.js',
  '/src/modules/estoque/estoqueModule.js',
  '/src/modules/fornecedores/fornecedoresModule.js',
  '/src/modules/mesas/mesasModule.js',
  '/src/modules/pdv/pdvModule.js',
  '/src/modules/produtos/produtosModule.js',
  '/src/modules/relatorio-financeiro/relatorioFinanceiroModule.js',
  '/src/modules/relatorios/relatoriosModule.js',
  '/src/modules/usuarios/usuariosModule.js',
  '/src/modules/vendas/vendasModule.js',
  '/src/services/connectionService.js',
  '/src/services/dataInitializer.js',
  '/src/services/offlineDB.js',
  '/src/services/pdfService.js',
  '/src/services/serviceWorkerManager.js',
  '/src/utils/filtering.js',
  '/src/utils/formatters.js',
  '/src/utils/loginEmail.js',
  '/src/utils/silenciarLogs.js',
  '/src/utils/pagination.js',
  '/src/utils/security.js',
  '/src/utils/ui.js'
];

// Bibliotecas externas que o app precisa para abrir offline
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // allSettled: se um arquivo falhar, os outros continuam sendo guardados
    await Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    // Bibliotecas externas (jsPDF e supabase-js), guardadas para uso offline
    await Promise.allSettled([
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    ].map(url => cache.add(new Request(url, { mode: 'no-cors' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    const antigos = nomes.filter(n => n !== CACHE_NAME);
    await Promise.all(antigos.map(n => caches.delete(n)));
    await self.clients.claim();

    // Só avisa "nova versão" quando realmente havia uma versão anterior instalada
    if (antigos.some(n => n.startsWith('doce-jardim'))) {
      const clientes = await self.clients.matchAll();
      clientes.forEach(c => c.postMessage({ type: 'NEW_VERSION_AVAILABLE', version: CACHE_NAME }));
    }
  })());
});

function podeGuardar(resposta) {
  return resposta && (resposta.ok || resposta.type === 'opaque');
}

self.addEventListener('fetch', event => {
  const req = event.request;

  // Só GET e só http(s). Nunca mexe em POST/PATCH/DELETE.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const mesmaOrigem = url.origin === self.location.origin;
  const ehCDN = CDN_HOSTS.includes(url.hostname);

  // Supabase (dados, login etc.) e qualquer outro site: NÃO guardar em cache.
  // Assim nunca se mostra dado velho nem se guarda dado sensível no aparelho.
  if (!mesmaOrigem && !ehCDN) return;

  // Bibliotecas externas: usa o cache e atualiza em segundo plano
  if (ehCDN) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const guardado = await cache.match(req);
      const rede = fetch(req)
        .then(resp => { if (podeGuardar(resp)) cache.put(req, resp.clone()); return resp; })
        .catch(() => null);
      return guardado || (await rede) || Response.error();
    })());
    return;
  }

  // Arquivos do próprio app: tenta a rede primeiro (sempre a versão mais nova)
  // e, sem internet, usa o que foi guardado.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const resp = await fetch(req);
      if (podeGuardar(resp)) cache.put(req, resp.clone());
      return resp;
    } catch (erro) {
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      // Abrir o app offline (qualquer rota/atalho) cai no index.html
      if (req.mode === 'navigate') {
        const inicio = (await cache.match('/index.html')) || (await cache.match('/'));
        if (inicio) return inicio;
      }
      return Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

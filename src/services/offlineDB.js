// ==================== SERVIÇO DE BANCO DE DADOS OFFLINE (IndexedDB) ====================

class OfflineDB {
    constructor() {
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Inicializando IndexedDB...');
            
            if (!window.indexedDB) {
                console.error('❌ IndexedDB não suportado');
                reject(new Error('IndexedDB não suportado'));
                return;
            }

            const request = indexedDB.open('DoceJardimOffline', 2);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB inicializado');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                console.log('🔧 Criando/Atualizando estrutura do IndexedDB...');
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('vendas_pendentes')) {
                    const store = db.createObjectStore('vendas_pendentes', { 
                        keyPath: 'id', 
                        autoIncrement: true 
                    });
                    store.createIndex('data', 'data', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('cache_produtos')) {
                    db.createObjectStore('cache_produtos', { keyPath: 'id' });
                }
            };
        });
    }

    salvarVendaOffline(venda) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                return this.init()
                    .then(() => this.salvarVendaOffline(venda))
                    .then(resolve)
                    .catch(reject);
            }

            try {
                const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
                const store = transaction.objectStore('vendas_pendentes');
                
                const vendaCopia = { ...venda };
                delete vendaCopia.id;
                vendaCopia.data_offline = new Date().toISOString();
                vendaCopia.sincronizada = false;
                
                const request = store.add(vendaCopia);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    obterVendasPendentes() {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB não inicializado'));
            
            const transaction = this.db.transaction(['vendas_pendentes'], 'readonly');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    marcarVendaSincronizada(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB não inicializado'));
            
            const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    salvarCacheProdutos(produtos) {
        return new Promise((resolve) => {
            if (!this.db) return resolve();
            
            const transaction = this.db.transaction(['cache_produtos'], 'readwrite');
            const store = transaction.objectStore('cache_produtos');
            
            store.clear();
            produtos.forEach(produto => store.add(produto));
            
            transaction.oncomplete = () => resolve();
        });
    }

    obterCacheProdutos() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve([]);
            
            const transaction = this.db.transaction(['cache_produtos'], 'readonly');
            const store = transaction.objectStore('cache_produtos');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
}

export const offlineDB = new OfflineDB();

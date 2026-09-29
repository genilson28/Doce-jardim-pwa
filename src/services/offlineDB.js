// ==================== SERVIÇO DE BANCO DE DADOS OFFLINE (IndexedDB) ====================

class OfflineDB {
    constructor() {
        this.db = null;
        this._initPromise = null;
    }

    init() {
        if (this.db) return Promise.resolve();
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
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
        }).catch(error => {
            this._initPromise = null; // permite tentar de novo depois
            throw error;
        });

        return this._initPromise;
    }

    async salvarVendaOffline(venda) {
        await this.init();

        return new Promise((resolve, reject) => {
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

    async obterVendasPendentes() {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['vendas_pendentes'], 'readonly');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    // Vendas guardadas no aparelho (ainda não enviadas). Usado na lista de vendas sem internet.
    async obterTodasVendas() {
        return this.obterVendasPendentes();
    }

    async marcarVendaSincronizada(id) {
        await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async salvarCacheProdutos(produtos) {
        try {
            await this.init();
        } catch (e) {
            return;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction(['cache_produtos'], 'readwrite');
                const store = transaction.objectStore('cache_produtos');

                store.clear();
                (produtos || []).forEach(produto => store.put(produto));

                transaction.oncomplete = () => resolve();
                transaction.onerror = () => resolve();
                transaction.onabort = () => resolve();
            } catch (error) {
                console.error('❌ Erro ao salvar cache de produtos:', error);
                resolve();
            }
        });
    }

    async obterCacheProdutos() {
        try {
            await this.init();
        } catch (e) {
            return [];
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cache_produtos'], 'readonly');
            const store = transaction.objectStore('cache_produtos');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
}

export const offlineDB = new OfflineDB();

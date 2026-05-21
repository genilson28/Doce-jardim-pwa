// ==================== GERENCIADOR DO SERVICE WORKER ====================

class ServiceWorkerManager {
    constructor() {
        this.registration = null;
        this.isSupported = 'serviceWorker' in navigator;
    }

    /**
     * Inicializa e registra o Service Worker
     */
    async init() {
        if (!this.isSupported) {
            console.warn('⚠️ Service Worker não suportado neste navegador');
            return false;
        }

        try {
            await this.register();
            this.setupUpdateListener();
            this.checkForUpdates();
            console.log('✅ Service Worker Manager inicializado');
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar Service Worker:', error);
            return false;
        }
    }

    /**
     * Registra o Service Worker
     */
    async register() {
        try {
            this.registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            
            console.log('✅ Service Worker registrado com sucesso');
            
            // Verificar atualizações a cada 60 minutos
            setInterval(() => {
                this.checkForUpdates();
            }, 60 * 60 * 1000);
            
            return this.registration;
        } catch (error) {
            console.error('❌ Falha ao registrar Service Worker:', error);
            throw error;
        }
    }

    /**
     * Configura listener para mensagens do Service Worker
     */
    setupUpdateListener() {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
                console.log('🎉 Nova versão detectada!');
                this.showUpdateNotification();
            }
        });

        // Listener para quando um novo Service Worker está esperando
        if (this.registration) {
            this.registration.addEventListener('updatefound', () => {
                const newWorker = this.registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 Nova versão instalada e aguardando ativação');
                        this.showUpdateNotification();
                    }
                });
            });
        }
    }

    /**
     * Verifica se há atualizações disponíveis
     */
    async checkForUpdates() {
        if (!this.registration) return;

        try {
            await this.registration.update();
            console.log('🔍 Verificação de atualização concluída');
        } catch (error) {
            console.error('❌ Erro ao verificar atualizações:', error);
        }
    }

    /**
     * Exibe notificação de atualização disponível
     */
    showUpdateNotification() {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('⚠️ Container de toast não encontrado');
            return;
        }

        // Evitar duplicatas
        const existingUpdateToast = container.querySelector('.toast-update');
        if (existingUpdateToast) return;

        const toast = document.createElement('div');
        toast.className = 'toast info toast-update';
        toast.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                <span>🎉 Nova versão disponível!</span>
                <button 
                    onclick="window.location.reload()" 
                    style="
                        padding: 8px 16px; 
                        border: none; 
                        border-radius: 5px; 
                        background: white; 
                        color: #2196F3; 
                        cursor: pointer; 
                        font-weight: bold;
                        font-size: 14px;
                        transition: all 0.3s;
                    "
                    onmouseover="this.style.background='#f0f0f0'"
                    onmouseout="this.style.background='white'"
                >
                    Atualizar Agora
                </button>
            </div>
        `;
        
        container.appendChild(toast);
        
        // Remove após 60 segundos (tempo maior para updates importantes)
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('fade-out');
                setTimeout(() => toast.remove(), 300);
            }
        }, 60000);
    }

    /**
     * Desregistra o Service Worker (útil para desenvolvimento)
     */
    async unregister() {
        if (!this.registration) return false;

        try {
            const success = await this.registration.unregister();
            console.log('🗑️ Service Worker desregistrado:', success);
            return success;
        } catch (error) {
            console.error('❌ Erro ao desregistrar Service Worker:', error);
            return false;
        }
    }

    /**
     * Força a ativação de um Service Worker em espera
     */
    skipWaiting() {
        if (this.registration && this.registration.waiting) {
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }
}

// Exportar instância singleton
export const serviceWorkerManager = new ServiceWorkerManager();
// ==================== SERVIÇO DE DETECÇÃO DE CONEXÃO ====================

export class ConnectionService {
    constructor() {
        this.isOnline = navigator.onLine;
        this.listeners = [];
        this.init();
    }

    init() {
        console.log('🌐 Status inicial de conexão:', this.isOnline);

        window.addEventListener('online', () => {
            console.log('🌐 Conexão restaurada!');
            this.isOnline = true;
            this.notifyListeners('online');
        });

        window.addEventListener('offline', () => {
            console.log('📴 Modo offline ativado');
            this.isOnline = false;
            this.notifyListeners('offline');
        });
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    notifyListeners(status) {
        this.listeners.forEach(callback => callback(status, this.isOnline));
    }

    getStatus() {
        return this.isOnline;
    }
}

export const connectionService = new ConnectionService();

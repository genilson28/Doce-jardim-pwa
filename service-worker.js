// ==================== LISTENER PARA ATUALIZAÇÃO DO SERVICE WORKER ====================
// Verifica se o Service Worker enviou uma mensagem sobre uma nova versão
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
            console.log('🎉 Nova versão do app detectada!');
            
            // Cria um toast especial para atualização
            const container = document.getElementById('toastContainer');
            if (container) {
                const toast = document.createElement('div');
                toast.className = 'toast info';
                toast.innerHTML = `
                    🎉 Nova versão disponível! 
                    <button onclick="window.location.reload()" style="margin-left: 10px; padding: 5px 10px; border: none; border-radius: 5px; background: white; color: #2196F3; cursor: pointer; font-weight: bold;">Atualizar</button>
                `;
                
                container.appendChild(toast);
                
                // Remove o toast após 30 segundos para não poluir a tela
                setTimeout(() => {
                    toast.classList.add('fade-out');
                    setTimeout(() => toast.remove(), 300);
                }, 30000);
            }
        }
    });
}

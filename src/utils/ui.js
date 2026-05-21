// ==================== SISTEMA DE NOTIFICAÇÕES (TOAST) ====================

/**
 * Mostra notificação toast na tela
 */
export function mostrarToast(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = mensagem;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Define estado de carregamento em botões
 */
export function setButtonLoading(buttonId, isLoading, originalText = '') {
    const button = document.getElementById(buttonId) || 
                   document.querySelector(`button[onclick*="${buttonId}"]`);
    
    if (!button) return;
    
    if (isLoading) {
        button.dataset.originalText = button.innerText;
        button.disabled = true;
        button.innerText = 'Processando...';
    } else {
        button.disabled = false;
        button.innerText = button.dataset.originalText || originalText;
    }
}

/**
 * Trata erros do Supabase e exibe mensagens apropriadas
 */
export function handleSupabaseError(error, mensagemPadrao = 'Erro ao processar operação') {
    console.error('❌ Erro Supabase:', error);
    
    // Códigos de erro comuns do PostgreSQL/Supabase
    if (error.code === '23505') {
        mostrarToast('Este registro já existe no sistema', 'error');
    } else if (error.code === '23503') {
        mostrarToast('Não é possível excluir. Existem registros relacionados', 'error');
    } else if (error.code === '42P01') {
        mostrarToast('Tabela não encontrada no banco de dados', 'error');
    } else if (error.code === '42703') {
        mostrarToast('Campo não encontrado na tabela', 'error');
    } else if (error.code === 'PGRST116') {
        mostrarToast('Nenhum dado encontrado', 'warning');
    } else if (error.message) {
        mostrarToast(error.message, 'error');
    } else {
        mostrarToast(mensagemPadrao, 'error');
    }
    
    return false;
}
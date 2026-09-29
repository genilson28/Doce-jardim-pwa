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
 * Traduz erros do Supabase em uma mensagem em português.
 * Retorna o TEXTO; quem chama mostra com mostrarToast(...).
 * (Antes mostrava um toast e devolvia "false", o que gerava um 2º aviso escrito "false".)
 */
export function handleSupabaseError(error, mensagemPadrao = 'Erro ao processar operação') {
    console.error('❌ Erro Supabase:', error);

    if (!error) return mensagemPadrao;

    switch (error.code) {
        case '23505': return 'Este registro já existe no sistema';
        case '23503': return 'Não é possível excluir. Existem registros relacionados';
        case '42P01': return 'Tabela não encontrada no banco de dados';
        case '42703': return 'Campo não encontrado na tabela';
        case 'PGRST116': return 'Nenhum dado encontrado';
        default: return error.message || mensagemPadrao;
    }
}

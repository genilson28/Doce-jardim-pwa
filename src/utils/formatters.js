// ==================== UTILITÁRIOS DE FORMATAÇÃO ====================

/**
 * Formata data e hora para o fuso horário de Brasília
 */
export function formatarDataHoraCorreta(dataString) {
    if (!dataString) return 'Nunca acessou';
    
    try {
        const dataUTC = new Date(dataString);
        if (isNaN(dataUTC.getTime())) return 'Data inválida';
        
        const dataBrasilia = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
        const dia = String(dataBrasilia.getUTCDate()).padStart(2, '0');
        const mes = String(dataBrasilia.getUTCMonth() + 1).padStart(2, '0');
        const ano = dataBrasilia.getUTCFullYear();
        const horas = String(dataBrasilia.getUTCHours()).padStart(2, '0');
        const minutos = String(dataBrasilia.getUTCMinutes()).padStart(2, '0');
        
        return `${dia}/${mes}/${ano}, ${horas}:${minutos}`;
    } catch (error) {
        console.error('Erro ao formatar data:', error);
        return 'Erro na data';
    }
}

/**
 * Formata data e hora no padrão brasileiro (alias para formatarDataHoraCorreta)
 */
export function formatarDataHora(dataString) {
    return formatarDataHoraCorreta(dataString);
}

/**
 * Formata valor monetário
 */
export function formatarMoeda(valor) {
    return `R$ ${parseFloat(valor || 0).toFixed(2)}`;
}

/**
 * Obtém ícone da categoria
 */
export function getIconeCategoria(categoria) {
    const icones = {
        'lanches': '🥪',
        'salgados': '🥟',
        'bolos': '🍰',
        'bebidas': '🥤',
        'sobremesa': '🍨',
        'bomboniere': '🍬'
    };
    return icones[categoria] || '📦';
}
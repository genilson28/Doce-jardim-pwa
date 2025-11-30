// ==================== CONSTANTES DA APLICAÇÃO ====================

export const CATEGORIAS = [
    { id: 'todas', nome: '🍽️ Todas' },
    { id: 'lanches', nome: '🥪 Lanches' },
    { id: 'salgados', nome: '🥟 Salgados' },
    { id: 'bolos', nome: '🍰 Bolos' },
    { id: 'bebidas', nome: '🥤 Bebidas' },
    { id: 'sobremesa', nome: '🍨 Sobremesas' },
    { id: 'bomboniere', nome: '🍬 Bomboniere' }
];

export const ICONES_CATEGORIA = {
    'lanches': '🥪',
    'salgados': '🥟',
    'bolos': '🍰',
    'bebidas': '🥤',
    'sobremesa': '🍨',
    'bomboniere': '🍬'
};

// Alias para compatibilidade (mesmo que ICONES_CATEGORIA)
export const CATEGORIAS_EMOJIS = {
    'lanches': '🥪',
    'salgados': '🥟',
    'bolos': '🍰',
    'bebidas': '🥤',
    'sobremesa': '🍨',
    'bomboniere': '🍬',
    'outros': '🍽️'
};

export const ITEMS_PER_PAGE = {
    PRODUTOS: 25,
    ESTOQUE: 5,
    USUARIOS: 5,
    PDV: 25,
    MESAS: 25
};

export const ERROR_CODES = {
    'PGRST116': 'Registro não encontrado.',
    '23505': 'Este registro já existe.',
    '23503': 'Violação de chave estrangeira.',
    '42501': 'Sem permissão para esta ação.'
};
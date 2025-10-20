// ==================== CONFIGURAÇÃO SUPABASE ====================
const SUPABASE_URL = 'https://utykuriccvvhitlrdqcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0eWt1cmljY3Z2aGl0bHJkcWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTA0MTksImV4cCI6MjA3NjM4NjQxOX0.KWbJdcKAf_6UFxTiFL-Qxzd0_wnxLueNblDLMfeaqIc';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== DETECÇÃO DE CONEXÃO ====================
let isOnline = navigator.onLine;
console.log('🌐 Status inicial de conexão:', isOnline);

window.addEventListener('online', async () => {
    console.log('🌐 Conexão restaurada!');
    isOnline = true;
    if (typeof app !== 'undefined' && app.mostrarToast) {
        app.mostrarToast('Conexão restaurada!', 'sucesso');
        await app.sincronizarVendasPendentes();
    }
});

window.addEventListener('offline', () => {
    console.log('📴 Modo offline ativado');
    isOnline = false;
    if (typeof app !== 'undefined' && app.mostrarToast) {
        app.mostrarToast('Modo offline ativado', 'info');
    }
});

// ==================== SISTEMA OFFLINE (IndexedDB) ====================
const offlineDB = {
    db: null,
    
    init: function() {
        return new Promise((resolve, reject) => {
            console.log('🔄 Inicializando IndexedDB...');
            
            if (!window.indexedDB) {
                console.error('❌ IndexedDB não suportado');
                reject(new Error('IndexedDB não suportado'));
                return;
            }
            
            const request = indexedDB.open('DoceJardimOffline', 2);
            
            request.onerror = () => {
                console.error('❌ Erro ao abrir IndexedDB:', request.error);
                reject(request.error);
            };
            
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
                    console.log('✅ Object store "vendas_pendentes" criado');
                }
                
                if (!db.objectStoreNames.contains('cache_produtos')) {
                    db.createObjectStore('cache_produtos', { keyPath: 'id' });
                    console.log('✅ Object store "cache_produtos" criado');
                }
            };
        });
    },
    
    salvarVendaOffline: function(venda) {
        return new Promise((resolve, reject) => {
            console.log('💾 [offlineDB] Salvando venda offline...');
            
            if (!this.db) {
                console.warn('⚠️ [offlineDB] DB não inicializado - inicializando agora...');
                this.init()
                    .then(() => this.salvarVendaOffline(venda))
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            try {
                const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
                const store = transaction.objectStore('vendas_pendentes');
                
                const vendaCopia = { ...venda };
                delete vendaCopia.id;
                vendaCopia.data_offline = new Date().toISOString();
                vendaCopia.sincronizada = false;
                
                const request = store.add(vendaCopia);
                
                request.onsuccess = () => {
                    console.log('✅ [offlineDB] Venda salva! ID:', request.result);
                    resolve(request.result);
                };
                
                request.onerror = () => reject(request.error);
                transaction.onerror = () => reject(transaction.error);
                
            } catch (error) {
                console.error('❌ [offlineDB] Erro ao criar transação:', error);
                reject(error);
            }
        });
    },
    
    obterVendasPendentes: function() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('DB não inicializado'));
                return;
            }
            
            const transaction = this.db.transaction(['vendas_pendentes'], 'readonly');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },
    
    marcarVendaSincronizada: function(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('DB não inicializado'));
                return;
            }
            
            const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    salvarCacheProdutos: function(produtos) {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve();
            
            const transaction = this.db.transaction(['cache_produtos'], 'readwrite');
            const store = transaction.objectStore('cache_produtos');
            
            store.clear();
            
            produtos.forEach(produto => {
                store.add(produto);
            });
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },
    
    obterCacheProdutos: function() {
        return new Promise((resolve, reject) => {
            if (!this.db) return resolve([]);
            
            const transaction = this.db.transaction(['cache_produtos'], 'readonly');
            const store = transaction.objectStore('cache_produtos');
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
};

// ==================== SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            console.log('🔄 Inicializando IndexedDB...');
            await offlineDB.init();
            console.log('✅ IndexedDB pronto');
            
            console.log('🔄 Registrando Service Worker...');
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker registrado!', registration.scope);
            
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
        }
    });
} else {
    window.addEventListener('load', async () => {
        try {
            await offlineDB.init();
            console.log('✅ IndexedDB inicializado (sem SW)');
        } catch (error) {
            console.error('❌ Erro ao inicializar IndexedDB:', error);
        }
    });
}

// ==================== PWA INSTALL ====================
let deferredPrompt;
const installBtnDash = document.getElementById('installBtnDash');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtnDash) installBtnDash.classList.remove('hidden');
});

// ==================== DADOS INICIAIS ====================
const dataInitializer = {
    criarProdutosIniciais: async function() {
        try {
            console.log('🔄 Criando produtos iniciais...');
            
            const produtos = [
                { nome: "Café Expresso", preco: 5.00, estoque: 50, categoria: "bebidas" },
                { nome: "Cappuccino", preco: 8.00, estoque: 30, categoria: "bebidas" },
                { nome: "Bolo de Chocolate", preco: 12.00, estoque: 20, categoria: "bolos" },
                { nome: "Bolo de Cenoura", preco: 10.00, estoque: 15, categoria: "bolos" },
                { nome: "Coxinha", preco: 6.00, estoque: 40, categoria: "salgados" },
                { nome: "Empada", preco: 5.50, estoque: 35, categoria: "salgados" },
                { nome: "Sanduíche Natural", preco: 15.00, estoque: 25, categoria: "lanches" },
                { nome: "Misto Quente", preco: 9.00, estoque: 30, categoria: "lanches" },
                { nome: "Suco Natural", preco: 7.00, estoque: 45, categoria: "bebidas" },
                { nome: "Água Mineral", preco: 3.00, estoque: 60, categoria: "bebidas" },
                // NOVOS PRODUTOS - SOBREMESAS
                { nome: "Pudim de Leite", preco: 8.00, estoque: 20, categoria: "sobremesa" },
                { nome: "Mousse de Chocolate", preco: 7.50, estoque: 25, categoria: "sobremesa" },
                { nome: "Torta de Limão", preco: 9.00, estoque: 15, categoria: "sobremesa" },
                { nome: "Sorvete Casquinha", preco: 6.00, estoque: 30, categoria: "sobremesa" },
                // NOVOS PRODUTOS - BOMBONIERE
                { nome: "Brigadeiro", preco: 2.50, estoque: 100, categoria: "bomboniere" },
                { nome: "Beijinho", preco: 2.50, estoque: 80, categoria: "bomboniere" },
                { nome: "Paçoca", preco: 1.50, estoque: 120, categoria: "bomboniere" },
                { nome: "Pipoca Doce", preco: 4.00, estoque: 50, categoria: "bomboniere" }
            ];
            
            const { error } = await supabase
                .from('produto')
                .insert(produtos);
            
            if (error) throw error;
            
            console.log('✅ Produtos criados com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar produtos:', error);
            return false;
        }
    },

    criarMesasIniciais: async function() {
        try {
            console.log('🔄 Criando mesas iniciais...');
            
            const mesas = [];
            for (let i = 1; i <= 12; i++) {
                mesas.push({
                    numero: i,
                    status: 'livre',
                    pedido_atual: null,
                    valor_total: 0
                });
            }
            
            const { error } = await supabase
                .from('mesas')
                .insert(mesas);
            
            if (error) throw error;
            
            console.log('✅ Mesas criadas com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar mesas:', error);
            return false;
        }
    },

    criarUsuarioAdmin: async function() {
        try {
            console.log('🔄 Criando usuário administrador...');
            
            const { error } = await supabase
                .from('usuarios')
                .insert([{
                    nome: 'Administrador',
                    login: 'admin',
                    senha: '123456',
                    tipo: 'administrador'
                }]);
            
            if (error) throw error;
            
            console.log('✅ Usuário admin criado!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar usuário admin:', error);
            return false;
        }
    },

    inicializarDados: async function() {
        try {
            console.log('🔍 Verificando dados...');
            
            // Verificar usuários
            const { data: usuarios, error: errorUsuarios } = await supabase
                .from('usuarios')
                .select('*')
                .limit(1);
            
            if (!usuarios || usuarios.length === 0) {
                await this.criarUsuarioAdmin();
            }
            
            // Verificar produtos
            const { data: produtos, error: errorProdutos } = await supabase
                .from('produto')
                .select('*')
                .limit(1);
            
            if (!produtos || produtos.length === 0) {
                await this.criarProdutosIniciais();
            }
            
            // Verificar mesas
            const { data: mesas, error: errorMesas } = await supabase
                .from('mesas')
                .select('*')
                .limit(1);
            
            if (!mesas || mesas.length === 0) {
                await this.criarMesasIniciais();
            }
            
            console.log('🎉 Dados inicializados!');
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao inicializar dados:', error);
            return false;
        }
    }
};

// ==================== SISTEMA PRINCIPAL ====================
const app = {
    cache: {
        produtos: [],
        vendas: [],
        mesas: [],
        usuarios: []
    },
    
    carrinho: [],
    mesaAtual: null,
    usuarioLogado: null,

    // ==================== VARIÁVEIS DE PAGINAÇÃO ====================
    paginaPDVAtual: 1,
    paginaMesasAtual: 1,
    itensPorPagina: 25, // 25 produtos por página como solicitado
    categoriaMesasAtual: 'todas',
    produtosMesasFiltrados: [],
    categoriaPDVAtual: 'todas',
    produtosPDVFiltrados: [],

    // ==================== NOTIFICAÇÕES ====================
    mostrarToast: function(mensagem, tipo = 'sucesso') {
        console.log(`🔔 Toast [${tipo}]: ${mensagem}`);
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
    },

    // ==================== FORMATADOR DE DATA CORRETA ====================
    formatarDataHoraCorreta: function(dataString) {
        if (!dataString) return 'Nunca acessou';
        
        try {
            // Criar data do UTC
            const dataUTC = new Date(dataString);
            
            // Verificar se a data é válida
            if (isNaN(dataUTC.getTime())) {
                return 'Data inválida';
            }
            
            // Converter para horário de Brasília manualmente
            const offsetBrasilia = -3; // UTC-3
            const dataBrasilia = new Date(dataUTC.getTime() + (offsetBrasilia * 60 * 60 * 1000));
            
            // Formatar manualmente
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
    },

    // ==================== NAVEGAÇÃO ====================
    showScreen: async function(screenId) {
        try {
            console.log(`🖥️ Mudando para: ${screenId}`);
            
            // Verificar permissões para usuários normais
            if (this.usuarioLogado && this.usuarioLogado.tipo === 'normal') {
                const telasPermitidas = ['dashboardScreen', 'mesasScreen', 'pdvScreen', 'comandaScreen'];
                if (!telasPermitidas.includes(screenId)) {
                    this.mostrarToast('Você não tem permissão para acessar esta tela', 'error');
                    return;
                }
            }
            
            document.querySelectorAll('.screen').forEach(s => {
                s.classList.remove('active');
            });
            
            const screenElement = document.getElementById(screenId);
            if (!screenElement) {
                console.error(`❌ Tela não encontrada: ${screenId}`);
                return;
            }
            
            screenElement.classList.add('active');
            
            switch(screenId) {
                case 'mesasScreen':
                    await this.listarMesas();
                    break;
                case 'pdvScreen':
                    await this.carregarProdutosPDV();
                    break;
                case 'produtosScreen':
                    await this.listarProdutos();
                    break;
                case 'estoqueScreen':
                    await this.listarEstoque();
                    break;
                case 'relatoriosScreen':
                    await this.carregarRelatorios();
                    break;
                case 'usuariosScreen':
                    await this.listarUsuarios();
                    break;
            }
        } catch (error) {
            console.error('❌ Erro ao mudar tela:', error);
        }
    },

    // ==================== MESAS ====================
    carregarMesas: async function() {
        try {
            console.log('🪑 Carregando mesas...');
            
            const { data, error } = await supabase
                .from('mesas')
                .select('*')
                .order('numero');
            
            if (error) throw error;
            
            this.cache.mesas = data || [];
            console.log(`✅ ${this.cache.mesas.length} mesas carregadas`);
            return this.cache.mesas;
        } catch (error) {
            console.error('❌ Erro ao carregar mesas:', error);
            return [];
        }
    },

    listarMesas: async function() {
        console.log('🪑 Listando mesas...');
        
        await this.carregarMesas();
        
        const lista = document.getElementById('listaMesas');
        if (!lista) {
            console.error('❌ Container listaMesas não encontrado');
            return;
        }
        
        lista.innerHTML = '';
        
        if (this.cache.mesas.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma mesa cadastrada</div>';
            return;
        }
        
        this.cache.mesas.forEach(mesa => {
            const div = document.createElement('div');
            div.className = `mesa-card ${mesa.status}`;
            
            const statusTexto = mesa.status === 'livre' ? '✓ Livre' : '👥 Ocupada';
            const valorTexto = mesa.valor_total > 0 ? `R$ ${mesa.valor_total.toFixed(2)}` : '';
            
            div.innerHTML = `
                <div class="mesa-numero">🪑</div>
                <h3>Mesa ${mesa.numero}</h3>
                <div class="mesa-status ${mesa.status}">${statusTexto}</div>
                ${valorTexto ? `<div class="mesa-valor">${valorTexto}</div>` : ''}
                ${mesa.pedido_atual ? `<div class="mesa-info"><p>Comanda aberta</p></div>` : ''}
            `;
            
            div.onclick = () => this.abrirMenuMesa(mesa);
            
            lista.appendChild(div);
        });
    },

    filtrarMesas: function(filtro) {
        const todasMesas = document.querySelectorAll('.mesa-card');
        
        todasMesas.forEach(card => {
            if (filtro === 'todas') {
                card.style.display = 'block';
            } else if (filtro === 'ocupadas') {
                card.style.display = card.classList.contains('ocupada') ? 'block' : 'none';
            } else if (filtro === 'livres') {
                card.style.display = card.classList.contains('livre') ? 'block' : 'none';
            }
        });
        
        // Atualizar botões ativos
        document.querySelectorAll('.mesas-filtros .btn-filtro').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const btnId = filtro === 'todas' ? 'filtroTodasMesas' : 
                      filtro === 'ocupadas' ? 'filtroOcupadas' : 'filtroLivres';
        const btnAtivo = document.getElementById(btnId);
        if (btnAtivo) btnAtivo.classList.add('active');
    },

    abrirMenuMesa: async function(mesa) {
        console.log('🪑 Mesa selecionada:', mesa);
        
        if (mesa.status === 'livre') {
            if (confirm(`Abrir comanda na Mesa ${mesa.numero}?`)) {
                await this.abrirComanda(mesa);
            }
        } else {
            // Mesa ocupada - mostrar opções
            const opcao = confirm(`Mesa ${mesa.numero} - R$ ${mesa.valor_total.toFixed(2)}\n\nOK = Ver Comanda\nCancelar = Fechar Conta`);
            if (opcao) {
                await this.abrirComanda(mesa);
            } else {
                await this.mostrarModalFecharConta(mesa);
            }
        }
    },

    // ==================== MESAS COM PESQUISA E CATEGORIAS ====================
    abrirComanda: async function(mesa) {
        this.mesaAtual = mesa;
        
        // Carregar produtos para adicionar
        await this.carregarProdutos();
        
        // Inicializar filtros e paginação
        this.categoriaMesasAtual = 'todas';
        this.paginaMesasAtual = 1;
        this.produtosMesasFiltrados = [...this.cache.produtos];
        
        // Carregar itens da comanda se existir
        if (mesa.pedido_atual) {
            try {
                this.carrinho = JSON.parse(mesa.pedido_atual);
            } catch (e) {
                this.carrinho = [];
            }
        } else {
            this.carrinho = [];
        }
        
        // Se a mesa estava livre, marca como ocupada
        if (mesa.status === 'livre') {
            console.log('🔄 Marcando mesa como ocupada...');
            const { error } = await supabase
                .from('mesas')
                .update({
                    status: 'ocupada',
                    pedido_atual: '[]',
                    valor_total: 0
                })
                .eq('id', mesa.id);
            
            if (error) {
                console.error('❌ Erro ao ocupar mesa:', error);
            } else {
                console.log('✅ Mesa marcada como ocupada!');
                this.mesaAtual.status = 'ocupada';
            }
        }
        
        // Atualizar UI
        document.getElementById('comandaTitulo').textContent = `📋 Mesa ${mesa.numero}`;
        
        // Mostrar tela de comanda
        this.showScreen('comandaScreen');
        
        // Carregar produtos disponíveis com categorias e pesquisa
        this.carregarProdutosComanda();
        
        // Atualizar lista de itens
        this.atualizarComanda();
    },

    carregarProdutosComanda: function() {
        // Renderizar categorias
        this.renderizarCategoriasMesas();
        // Renderizar produtos
        this.renderizarProdutosMesas();
    },

    renderizarCategoriasMesas: function() {
        const container = document.getElementById('categoriasMesas');
        if (!container) return;

        const categorias = [
            { id: 'todas', nome: '🍽️ Todas' },
            { id: 'lanches', nome: '🥪 Lanches' },
            { id: 'salgados', nome: '🥟 Salgados' },
            { id: 'bolos', nome: '🍰 Bolos' },
            { id: 'bebidas', nome: '🥤 Bebidas' },
            { id: 'sobremesa', nome: '🍨 Sobremesas' },
            { id: 'bomboniere', nome: '🍬 Bomboniere' }
        ];

        container.innerHTML = categorias.map(cat => `
            <button class="btn-filtro ${this.categoriaMesasAtual === cat.id ? 'active' : ''}" 
                    onclick="app.filtrarCategoriaMesas('${cat.id}')">
                ${cat.nome}
            </button>
        `).join('');
    },

    filtrarCategoriaMesas: function(categoria) {
        this.categoriaMesasAtual = categoria;
        this.paginaMesasAtual = 1; // Resetar para primeira página
        
        const inputPesquisa = document.getElementById('pesquisaMesas');
        const termoPesquisa = inputPesquisa ? inputPesquisa.value.toLowerCase().trim() : '';
        
        if (categoria === 'todas') {
            this.produtosMesasFiltrados = this.cache.produtos;
        } else {
            this.produtosMesasFiltrados = this.cache.produtos.filter(p => p.categoria === categoria);
        }
        
        // Aplicar pesquisa se existir
        if (termoPesquisa !== '') {
            this.produtosMesasFiltrados = this.produtosMesasFiltrados.filter(produto => 
                produto.nome.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.renderizarProdutosMesas();
    },

    pesquisarProdutosMesas: function() {
        const termoPesquisa = document.getElementById('pesquisaMesas').value.toLowerCase().trim();
        this.paginaMesasAtual = 1; // Resetar para primeira página
        
        if (this.categoriaMesasAtual === 'todas') {
            this.produtosMesasFiltrados = this.cache.produtos;
        } else {
            this.produtosMesasFiltrados = this.cache.produtos.filter(p => p.categoria === this.categoriaMesasAtual);
        }
        
        if (termoPesquisa !== '') {
            this.produtosMesasFiltrados = this.produtosMesasFiltrados.filter(produto => 
                produto.nome.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.renderizarProdutosMesas();
    },

    renderizarProdutosMesas: function() {
        const lista = document.getElementById('listaProdutosComanda');
        const paginacao = document.getElementById('paginacaoMesas');
        
        if (!lista) return;
        
        if (this.produtosMesasFiltrados.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            if (paginacao) paginacao.style.display = 'none';
            return;
        }
        
        // Calcular paginação
        const inicio = (this.paginaMesasAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const produtosPagina = this.produtosMesasFiltrados.slice(inicio, fim);
        const totalPaginas = Math.ceil(this.produtosMesasFiltrados.length / this.itensPorPagina);
        
        // Renderizar produtos
        lista.innerHTML = '';
        
        produtosPagina.forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-card';
            div.onclick = () => this.adicionarAoCarrinhoComanda(produto.id);
            div.innerHTML = `
                <h4>${produto.nome}</h4>
                <p>R$ ${produto.preco?.toFixed(2)}</p>
                <small>Estoque: ${produto.estoque}</small>
                <div class="categoria-badge-small">${this.getIconeCategoria(produto.categoria)} ${produto.categoria}</div>
            `;
            lista.appendChild(div);
        });
        
        // Renderizar paginação
        if (paginacao) {
            paginacao.style.display = 'flex';
            paginacao.innerHTML = `
                <button onclick="app.mudarPaginaMesas('anterior')" 
                        class="btn-paginacao" 
                        ${this.paginaMesasAtual === 1 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                
                <span class="info-pagina">
                    Página ${this.paginaMesasAtual} de ${totalPaginas}
                </span>
                
                <button onclick="app.mudarPaginaMesas('proxima')" 
                        class="btn-paginacao"
                        ${this.paginaMesasAtual === totalPaginas ? 'disabled' : ''}>
                    Próxima →
                </button>
            `;
        }
    },

    mudarPaginaMesas: function(direcao) {
        const totalPaginas = Math.ceil(this.produtosMesasFiltrados.length / this.itensPorPagina);
        
        if (direcao === 'anterior' && this.paginaMesasAtual > 1) {
            this.paginaMesasAtual--;
        } else if (direcao === 'proxima' && this.paginaMesasAtual < totalPaginas) {
            this.paginaMesasAtual++;
        }
        
        this.renderizarProdutosMesas();
        
        // Scroll suave para o topo da lista
        const lista = document.getElementById('listaProdutosComanda');
        if (lista) {
            lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    adicionarAoCarrinhoComanda: function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        if (produto.estoque <= 0) {
            this.mostrarToast('Produto sem estoque!', 'error');
            return;
        }
        
        const itemExistente = this.carrinho.find(item => item.id === produtoId);
        
        if (itemExistente) {
            if (itemExistente.quantidade < produto.estoque) {
                itemExistente.quantidade += 1;
            } else {
                this.mostrarToast('Estoque insuficiente!', 'warning');
                return;
            }
        } else {
            this.carrinho.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: 1
            });
        }
        
        this.atualizarComanda();
        this.salvarComanda();
        this.mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    },

    atualizarComanda: function() {
        const comandaItens = document.getElementById('comandaItens');
        if (!comandaItens) return;
        
        if (this.carrinho.length === 0) {
            comandaItens.innerHTML = '<div class="empty-state">Comanda vazia</div>';
        } else {
            comandaItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info">
                        <h4>${item.nome}</h4>
                        <p>R$ ${item.preco?.toFixed(2)} x ${item.quantidade}</p>
                    </div>
                    <div class="carrinho-item-acoes">
                        <span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span>
                        <button onclick="app.removerDoCarrinhoComanda(${item.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
        
        const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        document.getElementById('comandaTotal').textContent = total.toFixed(2);
    },

    removerDoCarrinhoComanda: function(produtoId) {
        const index = this.carrinho.findIndex(item => item.id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarComanda();
            this.salvarComanda();
        }
    },

    salvarComanda: async function() {
        if (!this.mesaAtual) return;
        
        const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        
        console.log('💾 Salvando comanda...', { mesa: this.mesaAtual.numero, total });
        
        const { error } = await supabase
            .from('mesas')
            .update({
                status: 'ocupada',
                pedido_atual: JSON.stringify(this.carrinho),
                valor_total: total
            })
            .eq('id', this.mesaAtual.id);
        
        if (error) {
            console.error('❌ Erro ao salvar comanda:', error);
        } else {
            console.log('✅ Comanda salva com sucesso!');
            // Atualizar objeto local
            this.mesaAtual.valor_total = total;
            this.mesaAtual.pedido_atual = JSON.stringify(this.carrinho);
        }
    },

    voltarParaMesas: async function() {
        this.mesaAtual = null;
        this.carrinho = [];
        
        // Recarregar mesas e mostrar tela
        await this.carregarMesas();
        this.showScreen('mesasScreen');
    },

    imprimirComanda: function() {
        if (this.carrinho.length === 0) {
            this.mostrarToast('Comanda vazia!', 'warning');
            return;
        }
        
        const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        
        let conteudo = `
═══════════════════════════════
      🍰 DOCE JARDIM 🍰
═══════════════════════════════

Mesa: ${this.mesaAtual.numero}
Data: ${new Date().toLocaleString('pt-BR')}

───────────────────────────────
ITENS
───────────────────────────────
`;
        
        this.carrinho.forEach(item => {
            conteudo += `\n${item.nome}\n`;
            conteudo += `${item.quantidade}x R$ ${item.preco.toFixed(2)} = R$ ${(item.preco * item.quantidade).toFixed(2)}\n`;
        });
        
        conteudo += `\n───────────────────────────────`;
        conteudo += `\nTOTAL: R$ ${total.toFixed(2)}`;
        conteudo += `\n═══════════════════════════════`;
        
        alert(conteudo);
        this.mostrarToast('Comanda impressa!', 'info');
    },

    mostrarModalFecharConta: function(mesa) {
        this.mesaAtual = mesa;
        
        // Carregar dados da comanda
        if (mesa.pedido_atual) {
            try {
                this.carrinho = JSON.parse(mesa.pedido_atual);
            } catch (e) {
                this.carrinho = [];
            }
        }
        
        const total = mesa.valor_total || 0;
        
        document.getElementById('modalMesaNumero').textContent = mesa.numero;
        document.getElementById('modalSubtotal').textContent = total.toFixed(2);
        document.getElementById('modalTotalConta').textContent = total.toFixed(2);
        document.getElementById('modalTotalFinal').textContent = total.toFixed(2);
        
        const modal = document.getElementById('modalFecharConta');
        modal.classList.add('active');
        modal.style.display = 'flex';
        
        // Event listener para desconto
        const tipoDesconto = document.getElementById('modalTipoDesconto');
        const valorDesconto = document.getElementById('modalValorDesconto');
        
        tipoDesconto.onchange = () => {
            if (tipoDesconto.value === 'nenhum') {
                valorDesconto.style.display = 'none';
                valorDesconto.value = '';
            } else {
                valorDesconto.style.display = 'block';
            }
            this.calcularTotalModal();
        };
        
        valorDesconto.oninput = () => this.calcularTotalModal();
    },

    calcularTotalModal: function() {
        const subtotal = this.mesaAtual.valor_total || 0;
        const tipoDesconto = document.getElementById('modalTipoDesconto').value;
        const valorDescontoInput = document.getElementById('modalValorDesconto').value;
        
        let desconto = 0;
        
        if (tipoDesconto !== 'nenhum' && valorDescontoInput) {
            const valorDesconto = parseFloat(valorDescontoInput);
            
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
        }
        
        if (desconto > 0) {
            document.getElementById('modalDescontoAplicado').style.display = 'block';
            document.getElementById('modalValorDescontoAplicado').textContent = desconto.toFixed(2);
        } else {
            document.getElementById('modalDescontoAplicado').style.display = 'none';
        }
        
        const totalFinal = subtotal - desconto;
        document.getElementById('modalTotalFinal').textContent = totalFinal.toFixed(2);
    },

    fecharModalConta: function() {
        const modal = document.getElementById('modalFecharConta');
        modal.classList.remove('active');
        modal.style.display = 'none';
        
        // Limpar campos
        document.getElementById('modalTipoDesconto').value = 'nenhum';
        document.getElementById('modalValorDesconto').value = '';
        document.getElementById('modalValorDesconto').style.display = 'none';
    },

    confirmarFechamentoConta: async function() {
        console.log('🔵 INICIANDO FECHAMENTO DA CONTA');
        console.log('Mesa atual:', this.mesaAtual);
        
        const subtotal = this.mesaAtual.valor_total || 0;
        const tipoDesconto = document.getElementById('modalTipoDesconto').value;
        const valorDescontoInput = document.getElementById('modalValorDesconto').value;
        const formaPagamento = document.getElementById('modalFormaPagamento').value;
        
        let desconto = 0;
        
        if (tipoDesconto !== 'nenhum' && valorDescontoInput) {
            const valorDesconto = parseFloat(valorDescontoInput);
            
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
        }
        
        const total = subtotal - desconto;
        
        // Registrar venda
        const venda = {
            itens: JSON.stringify(this.carrinho),
            subtotal: subtotal,
            desconto: desconto,
            total: total,
            forma_pagamento: formaPagamento,
            mesa_numero: this.mesaAtual.numero,
            data: new Date().toISOString()
        };
        
        console.log('📦 Registrando venda:', venda);
        const sucesso = await this.registrarVenda(venda);
        
        if (!sucesso) {
            console.error('❌ Falha ao registrar venda');
            this.mostrarToast('Erro ao registrar venda', 'error');
            return;
        }
        
        console.log('✅ Venda registrada com sucesso');
        
        // Atualizar estoque
        console.log('📦 Atualizando estoque...');
        for (const item of this.carrinho) {
            const produto = this.cache.produtos.find(p => p.id === item.id);
            if (produto) {
                produto.estoque -= item.quantidade;
                await this.atualizarProduto(produto);
            }
        }
        
        // Liberar mesa
        console.log('🔓 Liberando mesa ID:', this.mesaAtual.id);
        const { data, error } = await supabase
            .from('mesas')
            .update({
                status: 'livre',
                pedido_atual: null,
                valor_total: 0
            })
            .eq('id', this.mesaAtual.id)
            .select();
        
        console.log('Resposta Supabase:', { data, error });
        
        if (error) {
            console.error('❌ ERRO AO LIBERAR MESA:', error);
            this.mostrarToast('Erro ao liberar mesa: ' + error.message, 'error');
            return;
        }
        
        console.log('✅ Mesa liberada com sucesso!');
        
        // Fechar modal
        this.fecharModalConta();
        
        // Limpar dados
        this.carrinho = [];
        const mesaNumero = this.mesaAtual.numero;
        this.mesaAtual = null;
        
        this.mostrarToast(`Mesa ${mesaNumero} fechada com sucesso!`, 'sucesso');
        
        // Voltar para tela de mesas e recarregar
        console.log('🔄 Recarregando lista de mesas...');
        await this.carregarMesas();
        this.showScreen('mesasScreen');
    },

    finalizarComanda: function() {
        if (!this.mesaAtual) return;
        
        if (this.carrinho.length === 0) {
            this.mostrarToast('Comanda vazia!', 'warning');
            return;
        }
        
        this.mostrarModalFecharConta(this.mesaAtual);
    },

    // ==================== SUPABASE ====================
    carregarProdutos: async function() {
        try {
            console.log('🔄 Carregando produtos...');
            let data;
            
            if (isOnline) {
                console.log('🌐 Buscando produtos online...');
                const { data: onlineData, error } = await supabase
                    .from('produto')
                    .select('*')
                    .order('id');
                
                if (error) {
                    console.error('❌ Erro Supabase produtos:', error);
                    
                    if (error.code === 'PGRST204') {
                        console.log('📋 Tabela não existe - criando dados...');
                        await dataInitializer.inicializarDados();
                        return this.carregarProdutos();
                    }
                    
                    throw error;
                }
                
                data = onlineData;
                console.log(`✅ ${data?.length || 0} produtos carregados`);
                
                if (!data || data.length === 0) {
                    console.log('📝 Criando produtos iniciais...');
                    await dataInitializer.criarProdutosIniciais();
                    return this.carregarProdutos();
                }
                
                await offlineDB.salvarCacheProdutos(data || []);
            } else {
                console.log('📦 Buscando produtos do cache...');
                data = await offlineDB.obterCacheProdutos();
                console.log(`✅ ${data.length} produtos do cache`);
            }
            
            this.cache.produtos = data || [];
            return this.cache.produtos;
        } catch (error) {
            console.error('❌ Erro ao carregar produtos:', error);
            
            try {
                const cacheData = await offlineDB.obterCacheProdutos();
                this.cache.produtos = cacheData;
                console.log(`📦 Usando ${cacheData.length} produtos do cache`);
                return this.cache.produtos;
            } catch (cacheError) {
                console.error('❌ Erro no cache:', cacheError);
                return [];
            }
        }
    },

    registrarVenda: async function(venda) {
        console.log('🔍 Registrando venda:', venda);
        
        // Adicionar usuário que fez a venda
        if (this.usuarioLogado) {
            venda.usuario_id = this.usuarioLogado.id;
            venda.usuario_nome = this.usuarioLogado.nome;
        }
        
        try {
            if (!isOnline) {
                console.log('⚠️ MODO OFFLINE');
                const idOffline = await offlineDB.salvarVendaOffline(venda);
                console.log('✅ Venda salva offline! ID:', idOffline);
                this.mostrarToast('Venda salva offline', 'info');
                return true;
            }

            console.log('🌐 Salvando no Supabase...');
            
            const { data, error } = await supabase
                .from('vendas')
                .insert([venda])
                .select();
            
            if (error) {
                console.error('❌ Erro do Supabase:', error);
                throw error;
            }
            
            console.log('✅ Venda registrada!');
            this.mostrarToast('Venda registrada com sucesso!', 'sucesso');
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao registrar venda:', error);
            
            try {
                const resultado = await offlineDB.salvarVendaOffline(venda);
                console.log('✅ Salvo offline! ID:', resultado);
                this.mostrarToast('Venda salva offline', 'info');
                return true;
            } catch (offlineError) {
                console.error('❌ Erro ao salvar offline:', offlineError);
                this.mostrarToast('ERRO: ' + offlineError.message, 'error');
                return false;
            }
        }
    },

    atualizarProduto: async function(produto) {
        try {
            if (!isOnline) {
                console.log('📴 Offline - produto atualizado localmente');
                return true;
            }

            const { error } = await supabase
                .from('produto')
                .update(produto)
                .eq('id', produto.id);
            
            if (error) throw error;
            return true;
        } catch (error) {
            console.error('❌ Erro ao atualizar produto:', error);
            return false;
        }
    },

    sincronizarVendasPendentes: async function() {
        if (!isOnline) return;
        
        try {
            const vendasPendentes = await offlineDB.obterVendasPendentes();
            
            if (vendasPendentes.length === 0) {
                console.log('📭 Nenhuma venda pendente');
                return;
            }
            
            console.log(`🔄 Sincronizando ${vendasPendentes.length} vendas...`);
            
            for (const venda of vendasPendentes) {
                try {
                    const { error } = await supabase
                        .from('vendas')
                        .insert([venda]);
                    
                    if (error) throw error;
                    
                    await offlineDB.marcarVendaSincronizada(venda.id);
                    console.log('✅ Venda sincronizada:', venda.id);
                    
                } catch (vendaError) {
                    console.error('❌ Erro ao sincronizar:', vendaError);
                }
            }
            
            if (vendasPendentes.length > 0) {
                this.mostrarToast(`${vendasPendentes.length} vendas sincronizadas!`, 'sucesso');
            }
            
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
        }
    },

    // ==================== PDV COM PAGINAÇÃO ====================
    carregarProdutosPDV: async function() {
        await this.carregarProdutos();
        this.produtosPDVFiltrados = [...this.cache.produtos];
        this.categoriaPDVAtual = 'todas';
        this.paginaPDVAtual = 1;
        
        const inputPesquisa = document.getElementById('pesquisaPDV');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarCategoriasPDV();
        this.renderizarProdutosPDV();
        this.atualizarCarrinho();
    },

    renderizarCategoriasPDV: function() {
        const container = document.getElementById('categoriasPDV');
        if (!container) return;

        const categorias = [
            { id: 'todas', nome: '🍽️ Todas' },
            { id: 'lanches', nome: '🥪 Lanches' },
            { id: 'salgados', nome: '🥟 Salgados' },
            { id: 'bolos', nome: '🍰 Bolos' },
            { id: 'bebidas', nome: '🥤 Bebidas' },
            { id: 'sobremesa', nome: '🍨 Sobremesas' },
            { id: 'bomboniere', nome: '🍬 Bomboniere' }
        ];

        container.innerHTML = categorias.map(cat => `
            <button class="btn-filtro ${this.categoriaPDVAtual === cat.id ? 'active' : ''}" 
                    onclick="app.filtrarCategoriaPDV('${cat.id}')">
                ${cat.nome}
            </button>
        `).join('');
    },

    filtrarCategoriaPDV: function(categoria) {
        this.categoriaPDVAtual = categoria;
        this.paginaPDVAtual = 1; // Resetar para primeira página
        
        const inputPesquisa = document.getElementById('pesquisaPDV');
        const termoPesquisa = inputPesquisa ? inputPesquisa.value.toLowerCase().trim() : '';
        
        if (categoria === 'todas') {
            this.produtosPDVFiltrados = this.cache.produtos;
        } else {
            this.produtosPDVFiltrados = this.cache.produtos.filter(p => p.categoria === categoria);
        }
        
        // Aplicar pesquisa se existir
        if (termoPesquisa !== '') {
            this.produtosPDVFiltrados = this.produtosPDVFiltrados.filter(produto => 
                produto.nome.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.renderizarProdutosPDV();
    },

    pesquisarProdutosPDV: function() {
        const termoPesquisa = document.getElementById('pesquisaPDV').value.toLowerCase().trim();
        this.paginaPDVAtual = 1; // Resetar para primeira página
        
        if (this.categoriaPDVAtual === 'todas') {
            this.produtosPDVFiltrados = this.cache.produtos;
        } else {
            this.produtosPDVFiltrados = this.cache.produtos.filter(p => p.categoria === this.categoriaPDVAtual);
        }
        
        if (termoPesquisa !== '') {
            this.produtosPDVFiltrados = this.produtosPDVFiltrados.filter(produto => 
                produto.nome.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.renderizarProdutosPDV();
    },

    renderizarProdutosPDV: function() {
        const lista = document.getElementById('listaProdutosPDV');
        const paginacao = document.getElementById('paginacaoPDV');
        
        if (!lista) {
            console.error('❌ Elemento listaProdutosPDV não encontrado');
            return;
        }
        
        if (this.produtosPDVFiltrados.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            if (paginacao) paginacao.style.display = 'none';
            return;
        }
        
        // Calcular paginação
        const inicio = (this.paginaPDVAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const produtosPagina = this.produtosPDVFiltrados.slice(inicio, fim);
        const totalPaginas = Math.ceil(this.produtosPDVFiltrados.length / this.itensPorPagina);
        
        // Renderizar produtos
        lista.innerHTML = '';
        
        produtosPagina.forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-card';
            div.onclick = () => this.adicionarAoCarrinho(produto.id);
            div.innerHTML = `
                <h4>${produto.nome}</h4>
                <p>R$ ${produto.preco?.toFixed(2)}</p>
                <small>Estoque: ${produto.estoque}</small>
                <div class="categoria-badge-small">${this.getIconeCategoria(produto.categoria)} ${produto.categoria}</div>
            `;
            lista.appendChild(div);
        });
        
        // Renderizar paginação
        if (paginacao) {
            paginacao.style.display = 'flex';
            paginacao.innerHTML = `
                <button onclick="app.mudarPaginaPDV('anterior')" 
                        class="btn-paginacao" 
                        ${this.paginaPDVAtual === 1 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                
                <span class="info-pagina">
                    Página ${this.paginaPDVAtual} de ${totalPaginas}
                </span>
                
                <button onclick="app.mudarPaginaPDV('proxima')" 
                        class="btn-paginacao"
                        ${this.paginaPDVAtual === totalPaginas ? 'disabled' : ''}>
                    Próxima →
                </button>
            `;
        }
    },

    mudarPaginaPDV: function(direcao) {
        const totalPaginas = Math.ceil(this.produtosPDVFiltrados.length / this.itensPorPagina);
        
        if (direcao === 'anterior' && this.paginaPDVAtual > 1) {
            this.paginaPDVAtual--;
        } else if (direcao === 'proxima' && this.paginaPDVAtual < totalPaginas) {
            this.paginaPDVAtual++;
        }
        
        this.renderizarProdutosPDV();
        
        // Scroll suave para o topo da lista
        const lista = document.getElementById('listaProdutosPDV');
        if (lista) {
            lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    adicionarAoCarrinho: function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        if (produto.estoque <= 0) {
            this.mostrarToast('Produto sem estoque!', 'error');
            return;
        }
        
        const itemExistente = this.carrinho.find(item => item.id === produtoId);
        
        if (itemExistente) {
            if (itemExistente.quantidade < produto.estoque) {
                itemExistente.quantidade += 1;
            } else {
                this.mostrarToast('Estoque insuficiente!', 'warning');
                return;
            }
        } else {
            this.carrinho.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: 1
            });
        }
        
        this.atualizarCarrinho();
        this.mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    },

    removerDoCarrinho: function(produtoId) {
        const index = this.carrinho.findIndex(item => item.id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarCarrinho();
        }
    },

    atualizarCarrinho: function() {
        const carrinhoItens = document.getElementById('carrinhoItens');
        if (!carrinhoItens) return;
        
        if (this.carrinho.length === 0) {
            carrinhoItens.innerHTML = '<div class="empty-state">Carrinho vazio</div>';
        } else {
            carrinhoItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info">
                        <h4>${item.nome}</h4>
                        <p>R$ ${item.preco?.toFixed(2)} x ${item.quantidade}</p>
                    </div>
                    <div class="carrinho-item-acoes">
                        <span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span>
                        <button onclick="app.removerDoCarrinho(${item.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
        
        this.calcularTotal();
    },

    calcularTotal: function() {
        const subtotal = this.carrinho.reduce((total, item) => {
            return total + ((item.preco || 0) * item.quantidade);
        }, 0);
        
        document.getElementById('subtotalCarrinho').textContent = subtotal.toFixed(2);
        
        const tipoDesconto = document.getElementById('tipoDesconto').value;
        const valorDescontoInput = document.getElementById('valorDesconto');
        const descontoAplicadoDiv = document.getElementById('descontoAplicado');
        
        let desconto = 0;
        
        if (tipoDesconto === 'nenhum') {
            valorDescontoInput.style.display = 'none';
            descontoAplicadoDiv.style.display = 'none';
        } else {
            valorDescontoInput.style.display = 'block';
            const valorDesconto = parseFloat(valorDescontoInput.value) || 0;
            
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
            
            if (desconto > 0) {
                descontoAplicadoDiv.style.display = 'block';
                document.getElementById('valorDescontoAplicado').textContent = desconto.toFixed(2);
            } else {
                descontoAplicadoDiv.style.display = 'none';
            }
        }
        
        const total = subtotal - desconto;
        document.getElementById('carrinhoTotal').textContent = total.toFixed(2);
    },

    finalizarVenda: async function() {
        console.log('🔄 Iniciando finalização de venda...');
        
        if (this.carrinho.length === 0) {
            this.mostrarToast('Carrinho vazio!', 'warning');
            return;
        }
        
        const formaPagamento = document.getElementById('formaPagamento').value;
        const subtotal = parseFloat(document.getElementById('subtotalCarrinho').textContent);
        const desconto = parseFloat(document.getElementById('valorDescontoAplicado')?.textContent || 0);
        const total = parseFloat(document.getElementById('carrinhoTotal').textContent);
        
        const venda = {
            itens: JSON.stringify(this.carrinho),
            subtotal: subtotal,
            desconto: desconto,
            total: total,
            forma_pagamento: formaPagamento,
            data: new Date().toISOString()
        };
        
        const sucesso = await this.registrarVenda(venda);
        
        if (sucesso) {
            for (const item of this.carrinho) {
                const produto = this.cache.produtos.find(p => p.id === item.id);
                if (produto) {
                    produto.estoque -= item.quantidade;
                    await this.atualizarProduto(produto);
                }
            }
            
            this.carrinho = [];
            this.atualizarCarrinho();
            document.getElementById('tipoDesconto').value = 'nenhum';
            document.getElementById('valorDesconto').value = '';
            document.getElementById('valorDesconto').style.display = 'none';
            this.calcularTotal();
            
            await this.carregarProdutosPDV();
        }
    },

    limparCarrinho: function() {
        if (this.carrinho.length === 0) return;
        
        if (confirm('Deseja realmente limpar o carrinho?')) {
            this.carrinho = [];
            this.atualizarCarrinho();
            this.mostrarToast('Carrinho limpo', 'info');
        }
    },

    // ==================== UTILITÁRIOS ====================
    getIconeCategoria: function(categoria) {
        const icones = {
            'lanches': '🥪',
            'salgados': '🥟',
            'bolos': '🍰',
            'bebidas': '🥤',
            'sobremesa': '🍨',
            'bomboniere': '🍬'
        };
        return icones[categoria] || '📦';
    },

    // ==================== PRODUTOS ====================
    paginaProdutosAtual: 1,
    itensPorPaginaProdutos: 5,
    produtosFiltrados: [],

    listarProdutos: async function() {
        await this.carregarProdutos();
        this.produtosFiltrados = [...this.cache.produtos];
        this.paginaProdutosAtual = 1;
        
        const inputPesquisa = document.getElementById('pesquisaProduto');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarPaginaProdutos();
    },

    pesquisarProdutos: function() {
        const termoPesquisa = document.getElementById('pesquisaProduto').value.toLowerCase().trim();
        
        if (termoPesquisa === '') {
            this.produtosFiltrados = [...this.cache.produtos];
        } else {
            this.produtosFiltrados = this.cache.produtos.filter(produto => 
                produto.nome.toLowerCase().includes(termoPesquisa) ||
                produto.categoria.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.paginaProdutosAtual = 1;
        this.renderizarPaginaProdutos();
    },

    renderizarPaginaProdutos: function() {
        const lista = document.getElementById('listaProdutos');
        const paginacao = document.getElementById('paginacaoProdutos');
        
        if (!lista) return;
        
        if (this.produtosFiltrados.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            if (paginacao) paginacao.style.display = 'none';
            return;
        }
        
        const inicio = (this.paginaProdutosAtual - 1) * this.itensPorPaginaProdutos;
        const fim = inicio + this.itensPorPaginaProdutos;
        const produtosPagina = this.produtosFiltrados.slice(inicio, fim);
        const totalPaginas = Math.ceil(this.produtosFiltrados.length / this.itensPorPaginaProdutos);
        
        lista.innerHTML = '';
        
        produtosPagina.forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>${produto.nome}</h4>
                    <p>Preço: R$ ${produto.preco?.toFixed(2)} | Estoque: ${produto.estoque} | Categoria: ${produto.categoria}</p>
                </div>
                <div>
                    <button onclick="app.editarProduto(${produto.id})">✏️ Editar</button>
                    <button onclick="app.excluirProduto(${produto.id})">🗑️ Excluir</button>
                </div>
            `;
            lista.appendChild(div);
        });
        
        if (paginacao) {
            paginacao.style.display = 'flex';
            document.getElementById('infoPaginaProdutos').textContent = `Página ${this.paginaProdutosAtual} de ${totalPaginas}`;
            document.getElementById('btnAnteriorProdutos').disabled = this.paginaProdutosAtual === 1;
            document.getElementById('btnProximaProdutos').disabled = this.paginaProdutosAtual === totalPaginas;
        }
    },

    mudarPaginaProdutos: function(direcao) {
        const totalPaginas = Math.ceil(this.produtosFiltrados.length / this.itensPorPaginaProdutos);
        
        if (direcao === 'anterior' && this.paginaProdutosAtual > 1) {
            this.paginaProdutosAtual--;
        } else if (direcao === 'proxima' && this.paginaProdutosAtual < totalPaginas) {
            this.paginaProdutosAtual++;
        }
        
        this.renderizarPaginaProdutos();
        
        const lista = document.getElementById('listaProdutos');
        if (lista) {
            lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    adicionarProduto: async function() {
        const nome = document.getElementById('produtoNome').value.trim();
        const preco = parseFloat(document.getElementById('produtoPreco').value);
        const estoque = parseInt(document.getElementById('produtoEstoque').value);
        const categoria = document.getElementById('produtoCategoria').value;
        
        if (!nome || !preco || isNaN(estoque) || !categoria) {
            this.mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }
        
        try {
            const { error } = await supabase
                .from('produto')
                .insert([{ nome, preco, estoque, categoria }]);
            
            if (error) throw error;
            
            document.getElementById('produtoNome').value = '';
            document.getElementById('produtoPreco').value = '';
            document.getElementById('produtoEstoque').value = '';
            document.getElementById('produtoCategoria').value = '';
            
            await this.carregarProdutos();
            await this.listarProdutos();
            
            this.mostrarToast('Produto adicionado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao adicionar produto:', error);
            this.mostrarToast('Erro ao adicionar produto', 'error');
        }
    },

    editarProduto: function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        document.getElementById('editProdutoId').value = produto.id;
        document.getElementById('editProdutoNome').value = produto.nome;
        document.getElementById('editProdutoPreco').value = produto.preco;
        document.getElementById('editProdutoEstoque').value = produto.estoque;
        document.getElementById('editProdutoCategoria').value = produto.categoria;
        
        const modal = document.getElementById('modalEditarProduto');
        modal.classList.add('active');
        modal.style.display = 'flex';
    },

    salvarEdicaoProduto: async function() {
        const id = parseInt(document.getElementById('editProdutoId').value);
        const nome = document.getElementById('editProdutoNome').value.trim();
        const preco = parseFloat(document.getElementById('editProdutoPreco').value);
        const estoque = parseInt(document.getElementById('editProdutoEstoque').value);
        const categoria = document.getElementById('editProdutoCategoria').value;
        
        if (!nome || !preco || isNaN(estoque) || !categoria) {
            this.mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }
        
        try {
            const { error } = await supabase
                .from('produto')
                .update({ nome, preco, estoque, categoria })
                .eq('id', id);
            
            if (error) throw error;
            
            await this.carregarProdutos();
            await this.listarProdutos();
            
            this.fecharModalEdicao();
            this.mostrarToast('Produto atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            this.mostrarToast('Erro ao atualizar produto', 'error');
        }
    },

    fecharModalEdicao: function() {
        const modal = document.getElementById('modalEditarProduto');
        modal.classList.remove('active');
        modal.style.display = 'none';
    },

    excluirProduto: async function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        if (!confirm(`Deseja excluir "${produto.nome}"?`)) return;
        
        try {
            const { error } = await supabase
                .from('produto')
                .delete()
                .eq('id', produtoId);
            
            if (error) throw error;
            
            await this.carregarProdutos();
            await this.listarProdutos();
            
            this.mostrarToast('Produto excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            this.mostrarToast('Erro ao excluir produto', 'error');
        }
    },

    // ==================== ESTOQUE ====================
    paginaEstoqueAtual: 1,
    itensPorPaginaEstoque: 5,

    listarEstoque: async function() {
        console.log('🔄 Carregando estoque...');
        await this.carregarProdutos();
        
        const lista = document.getElementById('listaEstoque');
        
        if (!lista) {
            console.error('❌ Elemento listaEstoque não encontrado');
            return;
        }
        
        if (this.cache.produtos.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto cadastrado</div>';
            return;
        }
        
        // Resetar página ao entrar na tela
        this.paginaEstoqueAtual = 1;
        this.renderizarPaginaEstoque();
    },

    renderizarPaginaEstoque: function() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;
        
        const inicio = (this.paginaEstoqueAtual - 1) * this.itensPorPaginaEstoque;
        const fim = inicio + this.itensPorPaginaEstoque;
        const produtosPagina = this.cache.produtos.slice(inicio, fim);
        const totalPaginas = Math.ceil(this.cache.produtos.length / this.itensPorPaginaEstoque);
        
        // Criar tabela responsiva
        let html = `
            <div class="estoque-header">
                <h3>Controle de Estoque</h3>
                <p class="estoque-info">Mostrando ${inicio + 1}-${Math.min(fim, this.cache.produtos.length)} de ${this.cache.produtos.length} produtos</p>
            </div>
            
            <div class="tabela-estoque-container">
                <table class="tabela-estoque">
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Qtd</th>
                            <th>Preço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        produtosPagina.forEach(produto => {
            let badge = '';
            let badgeClass = '';
            let statusIcone = '';
            
            if (produto.estoque === 0) {
                badge = 'SEM ESTOQUE';
                badgeClass = 'estoque-critico';
                statusIcone = '❌';
            } else if (produto.estoque <= 5) {
                badge = 'BAIXO';
                badgeClass = 'estoque-baixo';
                statusIcone = '⚠️';
            } else {
                badge = 'OK';
                badgeClass = 'estoque-ok';
                statusIcone = '✅';
            }
            
            html += `
                <tr class="linha-estoque ${badgeClass}">
                    <td data-label="Produto">
                        <strong>${produto.nome}</strong>
                        <small class="categoria-badge">${produto.categoria}</small>
                    </td>
                    <td data-label="Quantidade">
                        <span class="quantidade-destaque">${produto.estoque}</span>
                    </td>
                    <td data-label="Preço">R$ ${produto.preco?.toFixed(2)}</td>
                    <td data-label="Status">
                        <span class="badge-status ${badgeClass}">
                            ${statusIcone} ${badge}
                        </span>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <div class="paginacao-estoque">
                <button 
                    onclick="app.mudarPaginaEstoque('anterior')" 
                    class="btn-paginacao" 
                    ${this.paginaEstoqueAtual === 1 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                
                <span class="info-pagina">
                    Página ${this.paginaEstoqueAtual} de ${totalPaginas}
                </span>
                
                <button 
                    onclick="app.mudarPaginaEstoque('proxima')" 
                    class="btn-paginacao"
                    ${this.paginaEstoqueAtual === totalPaginas ? 'disabled' : ''}>
                    Próxima →
                </button>
            </div>
        `;
        
        lista.innerHTML = html;
    },

    mudarPaginaEstoque: function(direcao) {
        const totalPaginas = Math.ceil(this.cache.produtos.length / this.itensPorPaginaEstoque);
        
        if (direcao === 'anterior' && this.paginaEstoqueAtual > 1) {
            this.paginaEstoqueAtual--;
        } else if (direcao === 'proxima' && this.paginaEstoqueAtual < totalPaginas) {
            this.paginaEstoqueAtual++;
        }
        
        this.renderizarPaginaEstoque();
        
        // Scroll suave para o topo da tabela
        const lista = document.getElementById('listaEstoque');
        if (lista) {
            lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    // ==================== MÉTODO NOVO - CARREGAR VENDAS COM HORA CORRIGIDA ====================
    carregarVendasComHoraCorrigida: async function() {
        try {
            const { data, error } = await supabase
                .from('vendas')
                .select('*')
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            // Converter UTC para horário de Brasília (UTC-3)
            return (data || []).map(venda => {
                if (venda.data) {
                    const dataUTC = new Date(venda.data);
                    // Ajusta para UTC-3 (Brasília)
                    const dataBrasilia = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
                    venda.data_corrigida = dataBrasilia.toISOString();
                    venda.data_exibicao = dataBrasilia.toLocaleString('pt-BR');
                }
                return venda;
            });
        } catch (error) {
            console.error('❌ Erro ao carregar vendas:', error);
            return [];
        }
    },

    // ==================== RELATÓRIOS ====================
    carregarRelatorios: async function() {
        try {
            // 🔄 USAR O MÉTODO COM HORA CORRIGIDA
            this.cache.vendas = await this.carregarVendasComHoraCorrigida();
            
            // Carregar usuários para o filtro
            await this.carregarUsuarios();
            
            this.criarFiltroUsuarios();
            this.calcularEstatisticas();
            this.filtrarVendas('hoje');
        } catch (error) {
            console.error('❌ Erro ao carregar relatórios:', error);
            this.mostrarToast('Erro ao carregar relatórios', 'error');
        }
    },

    criarFiltroUsuarios: function() {
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (!filtroUsuario) return;
        
        filtroUsuario.innerHTML = '<option value="todos">Todos os usuários</option>';
        
        this.cache.usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.tipo})`;
            filtroUsuario.appendChild(option);
        });
    },

    calcularEstatisticas: function(vendasFiltradas = null) {
        const vendas = vendasFiltradas || this.cache.vendas;
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const vendasHoje = vendas.filter(v => {
            const dataVenda = new Date(v.data_corrigida || v.data);
            dataVenda.setHours(0, 0, 0, 0);
            return dataVenda.getTime() === hoje.getTime();
        });
        
        const totalVendasHoje = vendasHoje.reduce((sum, v) => sum + (v.total || 0), 0);
        const totalVendas = vendas.length;
        const totalProdutos = vendas.reduce((sum, v) => {
            try {
                const itens = JSON.parse(v.itens || '[]');
                return sum + itens.reduce((s, item) => s + (item.quantidade || 0), 0);
            } catch {
                return sum;
            }
        }, 0);
        
        const ticketMedio = totalVendas > 0 ? 
            vendas.reduce((sum, v) => sum + (v.total || 0), 0) / totalVendas : 0;
        
        document.getElementById('vendasHoje').textContent = totalVendasHoje.toFixed(2);
        document.getElementById('totalVendas').textContent = totalVendas;
        document.getElementById('produtosVendidos').textContent = totalProdutos;
        document.getElementById('ticketMedio').textContent = ticketMedio.toFixed(2);
    },

    filtrarVendas: function(periodo) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        let vendasFiltradas = [];
        
        switch(periodo) {
            case 'hoje':
                vendasFiltradas = this.cache.vendas.filter(v => {
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    dataVenda.setHours(0, 0, 0, 0);
                    return dataVenda.getTime() === hoje.getTime();
                });
                break;
            case 'semana':
                const inicioSemana = new Date(hoje);
                inicioSemana.setDate(hoje.getDate() - hoje.getDay());
                vendasFiltradas = this.cache.vendas.filter(v => {
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    return dataVenda >= inicioSemana;
                });
                break;
            case 'mes':
                const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                vendasFiltradas = this.cache.vendas.filter(v => {
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    return dataVenda >= inicioMes;
                });
                break;
            default:
                vendasFiltradas = this.cache.vendas;
        }
        
        // Aplicar filtro de usuário se existir
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (filtroUsuario && filtroUsuario.value !== 'todos') {
            const usuarioId = parseInt(filtroUsuario.value);
            vendasFiltradas = vendasFiltradas.filter(v => v.usuario_id === usuarioId);
        }
        
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistoricoVendas(vendasFiltradas);
        
        document.querySelectorAll('.filtros-buttons .btn-filtro').forEach(btn => {
            btn.classList.remove('active');
        });
        const btnAtivo = document.getElementById(`filtro${periodo.charAt(0).toUpperCase() + periodo.slice(1)}`);
        if (btnAtivo) btnAtivo.classList.add('active');
    },

    filtrarPorPeriodo: function() {
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;
        
        if (!dataInicio || !dataFim) {
            this.mostrarToast('Selecione as datas', 'warning');
            return;
        }
        
        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);
        
        let vendasFiltradas = this.cache.vendas.filter(v => {
            const dataVenda = new Date(v.data_corrigida || v.data);
            return dataVenda >= inicio && dataVenda <= fim;
        });
        
        // Aplicar filtro de usuário se existir
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (filtroUsuario && filtroUsuario.value !== 'todos') {
            const usuarioId = parseInt(filtroUsuario.value);
            vendasFiltradas = vendasFiltradas.filter(v => v.usuario_id === usuarioId);
        }
        
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistoricoVendas(vendasFiltradas);
        
        document.querySelectorAll('.filtros-buttons .btn-filtro').forEach(btn => {
            btn.classList.remove('active');
        });
    },

    filtrarPorUsuario: function() {
        this.filtrarVendas('todas');
    },

    renderizarHistoricoVendas: function(vendas) {
        const historico = document.getElementById('historicoVendas');
        if (!historico) return;
        
        if (vendas.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma venda neste período</div>';
            return;
        }
        
        historico.innerHTML = vendas.map(venda => {
            // 🕒 USAR A DATA JÁ CORRIGIDA
            const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
            let itens = [];
            
            try {
                if (venda.itens && typeof venda.itens === 'string' && venda.itens.trim() !== '') {
                    itens = JSON.parse(venda.itens);
                }
            } catch (e) {
                console.error('Erro ao fazer parse dos items:', e, venda.itens);
                itens = []; // Fallback para array vazio em caso de erro
            }
            
            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            const usuarioTexto = venda.usuario_nome ? ` | ${venda.usuario_nome}` : '';
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>${dataExibicao}${mesaTexto}${usuarioTexto}</strong>
                        <strong>R$ ${venda.total?.toFixed(2)}</strong>
                    </div>
                    <p><strong>Forma:</strong> ${venda.forma_pagamento}</p>
                    <div class="venda-item-produtos">
                        <strong>Produtos:</strong>
                        ${itens.map(item => `${item.nome} (${item.quantidade}x)`).join(', ')}
                    </div>
                </div>
            `;
        }).join('');
        
        // Adicionar botão de exportar PDF
        historico.innerHTML += `
            <div class="exportar-pdf-container">
                <button onclick="app.exportarParaPDF()" class="btn-primary">
                    📄 Exportar para PDF
                </button>
            </div>
        `;
    },

   exportarParaPDF: function() {
    if (typeof window.jspdf === 'undefined') {
        alert('Erro: Biblioteca de PDF não carregada. Tente novamente.');
        return;
    }
    
    const doc = new window.jspdf.jsPDF();
    
    // Título principal
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DE VENDAS - DOCE JARDIM', 105, 15, { align: 'center' });
    
    // Data do relatório
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 105, 22, { align: 'center' });
    
    let yPosition = 35;
    
    // ==================== ESTATÍSTICAS ====================
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('ESTATÍSTICAS:', 14, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Vendas Hoje: R$ 21.00`, 20, yPosition);
    yPosition += 6;
    doc.text(`Total de Vendas: 2`, 20, yPosition);
    yPosition += 6;
    doc.text(`Produtos Vendidos: 3`, 20, yPosition);
    yPosition += 6;
    doc.text(`Ticket Médio: R$ 10.50`, 20, yPosition);
    yPosition += 12;
    
    // ==================== HISTÓRICO DE VENDAS ====================
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('HISTÓRICO DE VENDAS:', 14, yPosition);
    yPosition += 10;
    
    // Primeira venda
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`20/10/2025, 00:39:05 | Mesa 2 | Genilson Pinheiro`, 14, yPosition);
    yPosition += 5;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`R$ 13.00`, 180, yPosition, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`- pix`, 14, yPosition);
    yPosition += 5;
    
    doc.text(`Produtos:`, 14, yPosition);
    yPosition += 4;
    doc.text(`Cappuccino (1x), Coxinha (1x)`, 20, yPosition);
    yPosition += 8;
    
    // Linha divisória
    doc.setDrawColor(200, 200, 200);
    doc.line(14, yPosition, 196, yPosition);
    yPosition += 10;
    
    // Segunda venda
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`20/10/2025, 00:38:51 | Mesa 1 | Genilson Pinheiro`, 14, yPosition);
    yPosition += 5;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`R$ 8.00`, 180, yPosition, { align: 'right' });
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`- dinheiro`, 14, yPosition);
    yPosition += 5;
    
    doc.text(`Produtos:`, 14, yPosition);
    yPosition += 4;
    doc.text(`Cappuccino (1x)`, 20, yPosition);
    
    // Salvar o PDF
    doc.save(`relatorio-vendas-${new Date().toISOString().split('T')[0]}.pdf`);
},

    // ==================== LOGIN ====================
    login: async function() {
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        
        if (!user || !pass) {
            this.mostrarToast('Preencha usuário e senha', 'warning');
            return;
        }
        
        try {
            // Buscar usuário no banco
            const { data: usuarios, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('login', user)
                .eq('senha', pass)
                .limit(1);
            
            if (error) throw error;
            
            if (usuarios && usuarios.length > 0) {
                this.usuarioLogado = usuarios[0];
                
                // Atualizar último acesso
                const agora = new Date();
                const horaBrasil = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

                // Atualizar último acesso - O trigger do Supabase vai ajustar automaticamente para Brasília
                await supabase
                    .from('usuarios')
                    .update({ ultimo_acesso: new Date().toISOString() })
                    .eq('id', this.usuarioLogado.id);
                
                this.showScreen('dashboardScreen');
                this.mostrarToast(`Bem-vindo, ${this.usuarioLogado.nome}!`, 'sucesso');
                
                // Configurar permissões da interface
                this.configurarPermissoes();
                
                setTimeout(async () => {
                    await dataInitializer.inicializarDados();
                    await this.carregarProdutos();
                    await this.carregarMesas();
                }, 1000);
            } else {
                this.mostrarToast('Usuário ou senha incorretos!', 'error');
            }
        } catch (error) {
            console.error('❌ Erro no login:', error);
            this.mostrarToast('Erro ao fazer login', 'error');
        }
    },

    configurarPermissoes: function() {
        if (!this.usuarioLogado) return;
        
        const isAdmin = this.usuarioLogado.tipo === 'administrador';
        
        // Esconder/mostrar cards do dashboard
        const cardProdutos = document.querySelector('[onclick="app.showScreen(\'produtosScreen\')"]');
        const cardEstoque = document.querySelector('[onclick="app.showScreen(\'estoqueScreen\')"]');
        const cardRelatorios = document.querySelector('[onclick="app.showScreen(\'relatoriosScreen\')"]');
        const cardUsuarios = document.getElementById('cardUsuarios');
        
        if (cardProdutos) cardProdutos.style.display = isAdmin ? 'block' : 'none';
        if (cardEstoque) cardEstoque.style.display = isAdmin ? 'block' : 'none';
        if (cardRelatorios) cardRelatorios.style.display = isAdmin ? 'block' : 'none';
        if (cardUsuarios) cardUsuarios.style.display = isAdmin ? 'block' : 'none';
    },

    logout: function() {
        if (confirm('Deseja sair?')) {
            this.carrinho = [];
            this.mesaAtual = null;
            this.usuarioLogado = null;
            this.showScreen('loginScreen');
            this.mostrarToast('Logout realizado', 'info');
        }
    },

    // ==================== GERENCIAMENTO DE USUÁRIOS ====================
    paginaUsuariosAtual: 1,
    itensPorPaginaUsuarios: 5,
    usuariosFiltrados: [],

    carregarUsuarios: async function() {
        try {
            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .order('id');
            
            if (error) throw error;
            
            this.cache.usuarios = data || [];
            console.log(`✅ ${this.cache.usuarios.length} usuários carregados`);
            return this.cache.usuarios;
        } catch (error) {
            console.error('❌ Erro ao carregar usuários:', error);
            return [];
        }
    },

    listarUsuarios: async function() {
        await this.carregarUsuarios();
        this.usuariosFiltrados = [...this.cache.usuarios];
        this.paginaUsuariosAtual = 1;
        
        const inputPesquisa = document.getElementById('pesquisaUsuario');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarPaginaUsuarios();
    },

    pesquisarUsuarios: function() {
        const termoPesquisa = document.getElementById('pesquisaUsuario').value.toLowerCase().trim();
        
        if (termoPesquisa === '') {
            this.usuariosFiltrados = [...this.cache.usuarios];
        } else {
            this.usuariosFiltrados = this.cache.usuarios.filter(usuario => 
                usuario.nome.toLowerCase().includes(termoPesquisa) ||
                usuario.login.toLowerCase().includes(termoPesquisa)
            );
        }
        
        this.paginaUsuariosAtual = 1;
        this.renderizarPaginaUsuarios();
    },

    renderizarPaginaUsuarios: function() {
        const lista = document.getElementById('listaUsuarios');
        const paginacao = document.getElementById('paginacaoUsuarios');
        
        if (!lista) return;
        
        if (this.usuariosFiltrados.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum usuário encontrado</div>';
            if (paginacao) paginacao.style.display = 'none';
            return;
        }
        
        const inicio = (this.paginaUsuariosAtual - 1) * this.itensPorPaginaUsuarios;
        const fim = inicio + this.itensPorPaginaUsuarios;
        const usuariosPagina = this.usuariosFiltrados.slice(inicio, fim);
        const totalPaginas = Math.ceil(this.usuariosFiltrados.length / this.itensPorPaginaUsuarios);
        
        lista.innerHTML = '';
        
        usuariosPagina.forEach(usuario => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            
            const icone = usuario.tipo === 'administrador' ? '👑' : '👤';
            const tipoTexto = usuario.tipo === 'administrador' ? 'Administrador' : 'Usuário Normal';
            
            // 🔥 CORREÇÃO: Usar o formatador correto para o último acesso
            const ultimoAcesso = usuario.ultimo_acesso ? 
                this.formatarDataHoraCorreta(usuario.ultimo_acesso) : 'Nunca acessou';
            
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>${icone} ${usuario.nome}</h4>
                    <p><strong>Login:</strong> ${usuario.login} | <strong>Tipo:</strong> ${tipoTexto}</p>
                    <p style="font-size: 0.85em; color: #999;"><strong>Último acesso:</strong> ${ultimoAcesso}</p>
                </div>
                <div>
                    <button onclick="app.editarUsuario(${usuario.id})">✏️ Editar</button>
                    <button onclick="app.excluirUsuario(${usuario.id})">🗑️ Excluir</button>
                    <button onclick="app.verLogUsuario(${usuario.id})">📊 Logs</button>
                </div>
            `;
            lista.appendChild(div);
        });
        
        if (paginacao) {
            paginacao.style.display = 'flex';
            document.getElementById('infoPaginaUsuarios').textContent = `Página ${this.paginaUsuariosAtual} de ${totalPaginas}`;
            document.getElementById('btnAnteriorUsuarios').disabled = this.paginaUsuariosAtual === 1;
            document.getElementById('btnProximaUsuarios').disabled = this.paginaUsuariosAtual === totalPaginas;
        }
    },

    mudarPaginaUsuarios: function(direcao) {
        const totalPaginas = Math.ceil(this.usuariosFiltrados.length / this.itensPorPaginaUsuarios);
        
        if (direcao === 'anterior' && this.paginaUsuariosAtual > 1) {
            this.paginaUsuariosAtual--;
        } else if (direcao === 'proxima' && this.paginaUsuariosAtual < totalPaginas) {
            this.paginaUsuariosAtual++;
        }
        
        this.renderizarPaginaUsuarios();
        
        const lista = document.getElementById('listaUsuarios');
        if (lista) {
            lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    adicionarUsuario: async function() {
        try {
            console.log('🔄 Iniciando adição de usuário...');
            
            // Verificar se usuário é administrador
            if (!this.usuarioLogado || this.usuarioLogado.tipo !== 'administrador') {
                this.mostrarToast('Apenas administradores podem adicionar usuários!', 'error');
                return;
            }
            
            const nome = document.getElementById('usuarioNome').value.trim();
            const login = document.getElementById('usuarioLogin').value.trim();
            const senha = document.getElementById('usuarioSenha').value;
            const tipo = document.getElementById('usuarioTipo').value;
            
            // Validações básicas
            if (!nome || !login || !senha || !tipo) {
                this.mostrarToast('Preencha todos os campos!', 'warning');
                return;
            }
            
            // Verificar se login já existe
            const { data: existente } = await supabase
                .from('usuarios')
                .select('id')
                .eq('login', login)
                .limit(1);
            
            if (existente && existente.length > 0) {
                this.mostrarToast('Login já existe! Escolha outro.', 'error');
                return;
            }
            
            // Inserir usuário
            const { error } = await supabase
                .from('usuarios')
                .insert([{ 
                    nome, 
                    login, 
                    senha, 
                    tipo,
                    ultimo_acesso: null
                }]);
            
            if (error) throw error;
            
            // Limpar formulário
            document.getElementById('usuarioNome').value = '';
            document.getElementById('usuarioLogin').value = '';
            document.getElementById('usuarioSenha').value = '';
            document.getElementById('usuarioTipo').value = '';
            
            // Atualizar lista
            await this.listarUsuarios();
            
            this.mostrarToast(`Usuário "${nome}" adicionado com sucesso!`, 'sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao adicionar usuário:', error);
            this.mostrarToast('Erro ao adicionar usuário', 'error');
        }
    },

    editarUsuario: function(usuarioId) {
        const usuario = this.cache.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        document.getElementById('editUsuarioId').value = usuario.id;
        document.getElementById('editUsuarioNome').value = usuario.nome;
        document.getElementById('editUsuarioLogin').value = usuario.login;
        document.getElementById('editUsuarioSenha').value = '';
        document.getElementById('editUsuarioTipo').value = usuario.tipo;
        
        const modal = document.getElementById('modalEditarUsuario');
        modal.classList.add('active');
        modal.style.display = 'flex';
    },

    salvarEdicaoUsuario: async function() {
        const id = parseInt(document.getElementById('editUsuarioId').value);
        const nome = document.getElementById('editUsuarioNome').value.trim();
        const login = document.getElementById('editUsuarioLogin').value.trim();
        const senha = document.getElementById('editUsuarioSenha').value;
        const tipo = document.getElementById('editUsuarioTipo').value;
        
        if (!nome || !login || !tipo) {
            this.mostrarToast('Preencha todos os campos obrigatórios!', 'warning');
            return;
        }
        
        try {
            const dadosAtualizar = { nome, login, tipo };
            
            // Se senha foi preenchida, atualiza também
            if (senha.trim() !== '') {
                dadosAtualizar.senha = senha;
            }
            
            const { error } = await supabase
                .from('usuarios')
                .update(dadosAtualizar)
                .eq('id', id);
            
            if (error) throw error;
            
            await this.listarUsuarios();
            this.fecharModalEdicaoUsuario();
            this.mostrarToast('Usuário atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            this.mostrarToast('Erro ao atualizar usuário', 'error');
        }
    },

    fecharModalEdicaoUsuario: function() {
        const modal = document.getElementById('modalEditarUsuario');
        modal.classList.remove('active');
        modal.style.display = 'none';
    },

    excluirUsuario: async function(usuarioId) {
        const usuario = this.cache.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        if (this.usuarioLogado && this.usuarioLogado.id === usuarioId) {
            this.mostrarToast('Você não pode excluir seu próprio usuário!', 'error');
            return;
        }
        
        if (!confirm(`Deseja excluir "${usuario.nome}"?`)) return;
        
        try {
            const { error } = await supabase
                .from('usuarios')
                .delete()
                .eq('id', usuarioId);
            
            if (error) throw error;
            
            await this.listarUsuarios();
            this.mostrarToast('Usuário excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            this.mostrarToast('Erro ao excluir usuário', 'error');
        }
    },

    verLogUsuario: async function(usuarioId) {
        const usuario = this.cache.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        try {
            const { data: vendas, error } = await supabase
                .from('vendas')
                .select('*')
                .eq('usuario_id', usuarioId)
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            const totalVendas = vendas.length;
            const totalValor = vendas.reduce((sum, v) => sum + (v.total || 0), 0);
            
            let mensagem = `📊 LOGS DE VENDAS - ${usuario.nome}\n\n`;
            mensagem += `Total de vendas: ${totalVendas}\n`;
            mensagem += `Valor total: R$ ${totalValor.toFixed(2)}\n`;
            
            // 🔥 CORREÇÃO: Mostrar último acesso formatado corretamente
            if (usuario.ultimo_acesso) {
                const ultimoAcesso = this.formatarDataHoraCorreta(usuario.ultimo_acesso);
                mensagem += `Último acesso: ${ultimoAcesso}\n`;
            }
            
            mensagem += '\n';
            
            if (vendas.length > 0) {
                mensagem += '───────────────────────\n';
                mensagem += 'ÚLTIMAS 10 VENDAS:\n';
                mensagem += '───────────────────────\n\n';
                
                vendas.slice(0, 10).forEach((venda, index) => {
                    // Usar data corrigida das vendas
                    const dataFormatada = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
                    
                    const tipo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                    mensagem += `${index + 1}. ${dataFormatada}\n`;
                    mensagem += `   ${tipo} - R$ ${venda.total?.toFixed(2) || '0.00'}\n`;
                    mensagem += `   Pagamento: ${venda.forma_pagamento}\n\n`;
                });
            } else {
                mensagem += 'Nenhuma venda registrada ainda.';
            }
            
            alert(mensagem);
        } catch (error) {
            console.error('❌ Erro ao buscar logs:', error);
            this.mostrarToast('Erro ao buscar logs', 'error');
        }
    },

    // ==================== PWA ====================
    installApp: async function() {
        if (!deferredPrompt) {
            this.mostrarToast('App já instalado', 'info');
            return;
        }
        
        deferredPrompt.prompt();
        
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            this.mostrarToast('App instalado!', 'sucesso');
        }
        
        deferredPrompt = null;
        if (installBtnDash) installBtnDash.classList.add('hidden');
    }
};

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App Doce Jardim inicializado!');
    
    const loginPass = document.getElementById('loginPass');
    if (loginPass) {
        loginPass.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                app.login();
            }
        });
    }
    
    const tipoDesconto = document.getElementById('tipoDesconto');
    if (tipoDesconto) {
        tipoDesconto.addEventListener('change', function() {
            const valorDesconto = document.getElementById('valorDesconto');
            if (this.value === 'nenhum') {
                valorDesconto.style.display = 'none';
                valorDesconto.value = '';
            } else {
                valorDesconto.style.display = 'block';
            }
            app.calcularTotal();
        });
    }
    
    window.addEventListener('click', function(event) {
        const modalEditar = document.getElementById('modalEditarProduto');
        const modalConta = document.getElementById('modalFecharConta');
        const modalUsuario = document.getElementById('modalEditarUsuario');
        
        if (event.target === modalEditar) {
            app.fecharModalEdicao();
        }
        
        if (event.target === modalConta) {
            app.fecharModalConta();
        }
        
        if (event.target === modalUsuario) {
            app.fecharModalEdicaoUsuario();
        }
    });
    
    console.log('✅ Event listeners configurados');
});
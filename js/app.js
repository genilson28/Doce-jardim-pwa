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
                    const store = db.createObjectStore('vendas_pendentes', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('data', 'data', { unique: false });
                }
                if (!db.objectStoreNames.contains('cache_produtos')) {
                    db.createObjectStore('cache_produtos', { keyPath: 'id' });
                }
            };
        });
    },
    
    salvarVendaOffline: function(venda) {
        return new Promise((resolve, reject) => {
            if (!this.db) return this.init().then(() => this.salvarVendaOffline(venda)).then(resolve).catch(reject);
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
            } catch (error) { reject(error); }
        });
    },
    
    obterVendasPendentes: function() {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB não inicializado'));
            const transaction = this.db.transaction(['vendas_pendentes'], 'readonly');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },
    
    marcarVendaSincronizada: function(id) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB não inicializado'));
            const transaction = this.db.transaction(['vendas_pendentes'], 'readwrite');
            const store = transaction.objectStore('vendas_pendentes');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    salvarCacheProdutos: function(produtos) {
        return new Promise((resolve) => {
            if (!this.db) return resolve();
            const transaction = this.db.transaction(['cache_produtos'], 'readwrite');
            const store = transaction.objectStore('cache_produtos');
            store.clear();
            produtos.forEach(produto => store.add(produto));
            transaction.oncomplete = () => resolve();
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
            await offlineDB.init();
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker registrado!', registration.scope);
        } catch (error) { console.error('❌ Erro na inicialização:', error); }
    });
} else {
    window.addEventListener('load', async () => {
        try { await offlineDB.init(); } catch (error) { console.error('❌ Erro ao inicializar IndexedDB:', error); }
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
    // O hash para '123456' é '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'
    criarUsuarioAdmin: async function() {
        try {
            const { error } = await supabase.from('usuarios').insert([{
                nome: 'Administrador', login: 'admin', senha: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', tipo: 'administrador'
            }]);
            if (error && error.code !== '23505') throw error;
            console.log('✅ Usuário admin pronto.');
            return true;
        } catch (error) { console.error('❌ Erro ao criar usuário admin:', error); return false; }
    },

    criarProdutosIniciais: async function() {
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
            { nome: "Pudim de Leite", preco: 8.00, estoque: 20, categoria: "sobremesa" },
            { nome: "Mousse de Chocolate", preco: 7.50, estoque: 25, categoria: "sobremesa" },
            { nome: "Torta de Limão", preco: 9.00, estoque: 15, categoria: "sobremesa" },
            { nome: "Sorvete Casquinha", preco: 6.00, estoque: 30, categoria: "sobremesa" },
            { nome: "Brigadeiro", preco: 2.50, estoque: 100, categoria: "bomboniere" },
            { nome: "Beijinho", preco: 2.50, estoque: 80, categoria: "bomboniere" },
            { nome: "Paçoca", preco: 1.50, estoque: 120, categoria: "bomboniere" },
            { nome: "Pipoca Doce", preco: 4.00, estoque: 50, categoria: "bomboniere" }
        ];
        const { error } = await supabase.from('produto').insert(produtos);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✅ Produtos iniciais prontos.');
        return true;
    },

    criarMesasIniciais: async function() {
        const mesas = [];
        for (let i = 1; i <= 12; i++) mesas.push({ numero: i, status: 'livre', pedido_atual: null, valor_total: 0 });
        const { error } = await supabase.from('mesas').insert(mesas);
        if (error && error.code !== 'PGRST116') throw error;
        console.log('✅ Mesas iniciais prontas.');
        return true;
    },

    inicializarDados: async function() {
        try {
            const { data: usuarios } = await supabase.from('usuarios').select('*').limit(1);
            if (!usuarios || usuarios.length === 0) await this.criarUsuarioAdmin();
            
            const { data: produtos } = await supabase.from('produto').select('*').limit(1);
            if (!produtos || produtos.length === 0) await this.criarProdutosIniciais();
            
            const { data: mesas } = await supabase.from('mesas').select('*').limit(1);
            if (!mesas || mesas.length === 0) await this.criarMesasIniciais();
            
            console.log('🎉 Dados inicializados!');
            return true;
        } catch (error) { console.error('❌ Erro ao inicializar dados:', error); return false; }
    }
};

// ==================== SISTEMA PRINCIPAL ====================
const app = {
    cache: { produtos: [], vendas: [], mesas: [], usuarios: [] },
    carrinho: [], mesaAtual: null, usuarioLogado: null,
    vendasFiltradasParaRelatorio: [], // Para o PDF dinâmico

    // ==================== SISTEMA DE PAGINAÇÃO GENÉRICO ====================
    pagination: {
        currentPage: 1,
        itemsPerPage: 25,
        totalItems: 0,
        totalPages: 0,
        filteredData: [],

        setup(items, itemsPerPage = 25) {
            this.filteredData = items;
            this.totalItems = items.length;
            this.itemsPerPage = itemsPerPage;
            this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
            this.currentPage = 1;
        },

        getPageItems() {
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return this.filteredData.slice(start, end);
        },

        changePage(direction, containerId, renderFunction) {
            if (direction === 'anterior' && this.currentPage > 1) {
                this.currentPage--;
            } else if (direction === 'proxima' && this.currentPage < this.totalPages) {
                this.currentPage++;
            }
            renderFunction();
            const container = document.getElementById(containerId);
            if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        renderPaginationControls: function(containerId, renderFunction) {
            const paginacaoEl = document.getElementById(containerId);
            if (!paginacaoEl) return;

            if (this.totalPages <= 1) {
                paginacaoEl.style.display = 'none';
                return;
            }

            // Limpa os botões antigos para não duplicar
            paginacaoEl.innerHTML = ''; 
            paginacaoEl.style.display = 'flex';

            // Botão Anterior
            const btnAnterior = document.createElement('button');
            btnAnterior.className = 'btn-paginacao';
            btnAnterior.textContent = '← Anterior';
            if (this.currentPage === 1) {
                btnAnterior.disabled = true;
            }
            btnAnterior.addEventListener('click', () => this.changePage('anterior', containerId.replace('paginacao', 'lista'), renderFunction));
            paginacaoEl.appendChild(btnAnterior);

            // Informação da Página
            const spanInfo = document.createElement('span');
            spanInfo.className = 'info-pagina';
            spanInfo.textContent = `Página ${this.currentPage} de ${this.totalPages}`;
            paginacaoEl.appendChild(spanInfo);

            // Botão Próxima
            const btnProxima = document.createElement('button');
            btnProxima.className = 'btn-paginacao';
            btnProxima.textContent = 'Próxima →';
            if (this.currentPage === this.totalPages) {
                btnProxima.disabled = true;
            }
            btnProxima.addEventListener('click', () => this.changePage('proxima', containerId.replace('paginacao', 'lista'), renderFunction));
            paginacaoEl.appendChild(btnProxima);
        }
    },

    // ==================== SISTEMA DE FILTRO GENÉRICO ====================
    filtering: {
        apply(data, searchTerm, category) {
            let filtered = data;
            if (category && category !== 'todas') filtered = filtered.filter(item => item.categoria === category);
            if (searchTerm) filtered = filtered.filter(item => item.nome.toLowerCase().includes(searchTerm.toLowerCase()));
            return filtered;
        }
    },

    // ==================== FUNÇÃO DE HASH DE SENHA (SEGURANÇA) ====================
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    // ==================== CENTRAL DE TRATAMENTO DE ERROS ====================
    handleSupabaseError(error) {
        if (!error) return 'Ocorreu um erro desconhecido.';
        const errorMap = { 'PGRST116': 'Registro não encontrado.', '23505': 'Este registro já existe.', '23503': 'Violação de chave estrangeira.', '42501': 'Sem permissão para esta ação.' };
        return errorMap[error.code] || `Erro: ${error.message}`;
    },

    // ==================== ESTADO DE CARREGAMENTO NOS BOTÕES (UX) ====================
    setButtonLoading(buttonId, isLoading, originalText = '') {
        const button = document.getElementById(buttonId) || document.querySelector(`button[onclick*="${buttonId}"]`);
        if (!button) return;
        if (isLoading) { button.dataset.originalText = button.innerText; button.disabled = true; button.innerText = 'Processando...'; }
        else { button.disabled = false; button.innerText = button.dataset.originalText || originalText; }
    },

    // ==================== NOTIFICAÇÕES ====================
    mostrarToast: function(mensagem, tipo = 'sucesso') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.textContent = mensagem;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
    },

    // ==================== FORMATADOR DE DATA ====================
    formatarDataHoraCorreta: function(dataString) {
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
        } catch (error) { console.error('Erro ao formatar data:', error); return 'Erro na data'; }
    },

    // ==================== FUNÇÃO PARA GERAR COMPROVANTE PDF ====================
    gerarComprovantePDF: function(venda, mesaNumero = null) {
        if (typeof window.jspdf === 'undefined') {
            console.error('Biblioteca jsPDF não carregada');
            this.mostrarToast('Erro ao gerar comprovante PDF', 'error');
            return false;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Configurações do documento
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(0, 0, 0);
            
            // Cabeçalho
            doc.text('🍰 DOCE JARDIM 🍰', 105, 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text('Comprovante de Venda', 105, 22, { align: 'center' });
            
            // Linha separadora
            doc.setDrawColor(200, 200, 200);
            doc.line(15, 25, 195, 25);
            
            let yPosition = 35;
            
            // Informações da venda
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('INFORMAÇÕES DA VENDA', 15, yPosition);
            yPosition += 10;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            const dataVenda = new Date(venda.data).toLocaleString('pt-BR');
            doc.text(`Data/Hora: ${dataVenda}`, 20, yPosition);
            yPosition += 6;
            
            if (mesaNumero) {
                doc.text(`Mesa: ${mesaNumero}`, 20, yPosition);
                yPosition += 6;
            }
            
            doc.text(`Atendente: ${venda.usuario_nome || 'Sistema'}`, 20, yPosition);
            yPosition += 6;
            
            doc.text(`Forma de Pagamento: ${venda.forma_pagamento}`, 20, yPosition);
            yPosition += 10;
            
            // Itens da venda
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('ITENS VENDIDOS', 15, yPosition);
            yPosition += 10;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Produto', 20, yPosition);
            doc.text('Qtd', 120, yPosition);
            doc.text('Valor', 160, yPosition);
            yPosition += 6;
            
            doc.setDrawColor(200, 200, 200);
            doc.line(15, yPosition, 195, yPosition);
            yPosition += 8;
            
            // Lista de itens
            let itens = [];
            try {
                itens = JSON.parse(venda.itens || '[]');
            } catch (e) {
                console.error('Erro ao parsear itens:', e);
                itens = [];
            }
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            
            itens.forEach(item => {
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                // Nome do produto (com quebra de linha se necessário)
                const nomeProduto = item.nome || 'Produto não identificado';
                const nomeLines = doc.splitTextToSize(nomeProduto, 80);
                doc.text(nomeLines, 20, yPosition);
                
                // Quantidade
                doc.text(`${item.quantidade || 0}x`, 120, yPosition);
                
                // Valor total do item
                const valorItem = ((item.preco || 0) * (item.quantidade || 0)).toFixed(2);
                doc.text(`R$ ${valorItem}`, 160, yPosition);
                
                yPosition += (nomeLines.length * 5) + 2;
            });
            
            yPosition += 5;
            doc.line(15, yPosition, 195, yPosition);
            yPosition += 10;
            
            // Totais
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            
            doc.text('Subtotal:', 120, yPosition);
            doc.text(`R$ ${venda.subtotal?.toFixed(2) || '0.00'}`, 160, yPosition);
            yPosition += 7;
            
            if (venda.desconto && venda.desconto > 0) {
                doc.text('Desconto:', 120, yPosition);
                doc.text(`- R$ ${venda.desconto.toFixed(2)}`, 160, yPosition);
                yPosition += 7;
            }
            
            doc.setFontSize(12);
            doc.text('TOTAL:', 120, yPosition);
            doc.text(`R$ ${venda.total?.toFixed(2) || '0.00'}`, 160, yPosition);
            yPosition += 12;
            
            // Rodapé
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text('Obrigado pela preferência! Volte sempre!', 105, yPosition, { align: 'center' });
            yPosition += 5;
            doc.text('Documento gerado automaticamente pelo sistema', 105, yPosition, { align: 'center' });
            
            // Gerar nome do arquivo
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const mesaInfo = mesaNumero ? `mesa-${mesaNumero}-` : '';
            const fileName = `comprovante-${mesaInfo}${timestamp}.pdf`;
            
            // Salvar PDF
            doc.save(fileName);
            
            console.log('✅ Comprovante PDF gerado com sucesso');
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao gerar comprovante PDF:', error);
            this.mostrarToast('Erro ao gerar comprovante', 'error');
            return false;
        }
    },

    // ==================== NAVEGAÇÃO ====================
   showScreen: async function(screenId) {
    try {
        if (this.usuarioLogado && this.usuarioLogado.tipo === 'normal') {
            const telasPermitidas = ['dashboardScreen', 'mesasScreen', 'pdvScreen', 'comandaScreen'];
            if (!telasPermitidas.includes(screenId)) { 
                this.mostrarToast('Você não tem permissão para acessar esta tela', 'error'); 
                return; 
            }
        }
        
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screenElement = document.getElementById(screenId);
        if (!screenElement) { 
            console.error(`❌ Tela não encontrada: ${screenId}`); 
            return; 
        }
        screenElement.classList.add('active');
        
        switch(screenId) {
            case 'mesasScreen': await this.listarMesas(); break;
            case 'pdvScreen': await this.carregarProdutosPDV(); break;
            case 'produtosScreen': await this.listarProdutos(); break;
            case 'estoqueScreen': await this.listarEstoque(); break;
            case 'relatoriosScreen': await this.carregarRelatorios(); break;
            case 'usuariosScreen': await this.listarUsuarios(); break;
            
            // ✅ ADICIONAR: Cases das telas financeiras
            case 'fornecedoresScreen': await this.listarFornecedores(); break;
            case 'comprasScreen': await this.listarCompras(); break;
            case 'relatorioFinanceiroScreen': await this.carregarRelatorioFinanceiro(); break;
        }
    } catch (error) { 
        console.error('❌ Erro ao mudar tela:', error); 
        this.mostrarToast(this.handleSupabaseError(error), 'error'); 
    }
},

    // ==================== LOGIN ====================
    login: async function() {
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        if (!user || !pass) { this.mostrarToast('Preencha usuário e senha', 'warning'); return; }
        this.setButtonLoading('login', true);
        try {
            const hashedPassword = await this.hashPassword(pass);
            const { data: usuarios, error } = await supabase.from('usuarios').select('*').eq('login', user).eq('senha', hashedPassword).limit(1);
            if (error) throw error;
            if (usuarios && usuarios.length > 0) {
                this.usuarioLogado = usuarios[0];
                await supabase.from('usuarios').update({ ultimo_acesso: new Date().toISOString() }).eq('id', this.usuarioLogado.id);
                this.showScreen('dashboardScreen');
                this.mostrarToast(`Bem-vindo, ${this.usuarioLogado.nome}!`, 'sucesso');
                this.configurarPermissoes();
                setTimeout(async () => { await dataInitializer.inicializarDados(); await this.carregarProdutos(); await this.carregarMesas(); }, 1000);
            } else { this.mostrarToast('Usuário ou senha incorretos!', 'error'); }
        } catch (error) { console.error('❌ Erro no login:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
        finally { this.setButtonLoading('login', false); }
    },

   // app.js - Linha ~430
configurarPermissoes: function() {
    if (!this.usuarioLogado) return;
    const isAdmin = this.usuarioLogado.tipo === 'administrador';
    
    // Cards existentes
    const cardProdutos = document.querySelector('[onclick="app.showScreen(\'produtosScreen\')"]');
    const cardEstoque = document.querySelector('[onclick="app.showScreen(\'estoqueScreen\')"]');
    const cardRelatorios = document.querySelector('[onclick="app.showScreen(\'relatoriosScreen\')"]');
    const cardUsuarios = document.getElementById('cardUsuarios');
    
    // ✅ ADICIONAR: Buscar cards financeiros
    const cardFornecedores = document.getElementById('cardFornecedores');
    const cardCompras = document.getElementById('cardCompras');
    const cardRelatorioFinanceiro = document.getElementById('cardRelatorioFinanceiro');
    
    // Configurar visibilidade dos cards existentes
    if (cardProdutos) cardProdutos.style.display = isAdmin ? 'block' : 'none';
    if (cardEstoque) cardEstoque.style.display = isAdmin ? 'block' : 'none';
    if (cardRelatorios) cardRelatorios.style.display = isAdmin ? 'block' : 'none';
    if (cardUsuarios) cardUsuarios.style.display = isAdmin ? 'block' : 'none';
    
    // ✅ ADICIONAR: Configurar visibilidade dos cards financeiros
    if (cardFornecedores) cardFornecedores.style.display = isAdmin ? 'block' : 'none';
    if (cardCompras) cardCompras.style.display = isAdmin ? 'block' : 'none';
    if (cardRelatorioFinanceiro) cardRelatorioFinanceiro.style.display = isAdmin ? 'block' : 'none';
},
    // ==================== SUPABASE ====================
    carregarProdutos: async function() {
        try {
            let data;
            if (isOnline) {
                const { data: onlineData, error } = await supabase.from('produto').select('*').order('id');
                if (error) throw error;
                data = onlineData;
                if (!data || data.length === 0) { await dataInitializer.criarProdutosIniciais(); return this.carregarProdutos(); }
                await offlineDB.salvarCacheProdutos(data || []);
            } else { data = await offlineDB.obterCacheProdutos(); }
            this.cache.produtos = data || [];
            return this.cache.produtos;
        } catch (error) { console.error('❌ Erro ao carregar produtos:', error); const cacheData = await offlineDB.obterCacheProdutos(); this.cache.produtos = cacheData; return this.cache.produtos; }
    },

    carregarMesas: async function() {
        try { const { data, error } = await supabase.from('mesas').select('*').order('numero'); if (error) throw error; this.cache.mesas = data || []; return this.cache.mesas; }
        catch (error) { console.error('❌ Erro ao carregar mesas:', error); return []; }
    },

    registrarVenda: async function(venda) {
        if (this.usuarioLogado) { venda.usuario_id = this.usuarioLogado.id; venda.usuario_nome = this.usuarioLogado.nome; }
        try {
            if (!isOnline) { const idOffline = await offlineDB.salvarVendaOffline(venda); this.mostrarToast('Venda salva offline', 'info'); return true; }
            const { data, error } = await supabase.from('vendas').insert([venda]).select();
            if (error) throw error;
            this.mostrarToast('Venda registrada com sucesso!', 'sucesso');
            return true;
        } catch (error) { console.error('❌ Erro ao registrar venda:', error); try { const resultado = await offlineDB.salvarVendaOffline(venda); this.mostrarToast('Venda salva offline', 'info'); return true; } catch (offlineError) { console.error('❌ Erro ao salvar offline:', offlineError); this.mostrarToast('ERRO: ' + offlineError.message, 'error'); return false; } }
    },

    sincronizarVendasPendentes: async function() {
        if (!isOnline) return;
        try {
            const vendasPendentes = await offlineDB.obterVendasPendentes();
            if (vendasPendentes.length === 0) return;
            console.log(`🔄 Sincronizando ${vendasPendentes.length} vendas...`);
            for (const venda of vendasPendentes) {
                try { const { error } = await supabase.from('vendas').insert([venda]); if (error) throw error; await offlineDB.marcarVendaSincronizada(venda.id); }
                catch (vendaError) { console.error('❌ Erro ao sincronizar:', vendaError); }
            }
            if (vendasPendentes.length > 0) this.mostrarToast(`${vendasPendentes.length} vendas sincronizadas!`, 'sucesso');
        } catch (error) { console.error('❌ Erro na sincronização:', error); }
    },

    // ==================== MESAS ====================
    listarMesas: async function() {
        await this.carregarMesas();
        const lista = document.getElementById('listaMesas');
        if (!lista) return;
        lista.innerHTML = '';
        if (this.cache.mesas.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhuma mesa cadastrada</div>'; return; }
        this.cache.mesas.forEach(mesa => {
            const div = document.createElement('div'); div.className = `mesa-card ${mesa.status}`;
            const statusTexto = mesa.status === 'livre' ? '✓ Livre' : '👥 Ocupada';
            const valorTexto = mesa.valor_total > 0 ? `R$ ${mesa.valor_total.toFixed(2)}` : '';
            div.innerHTML = `<div class="mesa-numero">🪑</div><h3>Mesa ${mesa.numero}</h3><div class="mesa-status ${mesa.status}">${statusTexto}</div>${valorTexto ? `<div class="mesa-valor">${valorTexto}</div>` : ''}${mesa.pedido_atual ? `<div class="mesa-info"><p>Comanda aberta</p></div>` : ''}`;
            div.onclick = () => this.abrirMenuMesa(mesa);
            lista.appendChild(div);
        });
    },

    filtrarMesas: function(filtro) {
        const todasMesas = document.querySelectorAll('.mesa-card');
        todasMesas.forEach(card => {
            if (filtro === 'todas') card.style.display = 'block';
            else if (filtro === 'ocupadas') card.style.display = card.classList.contains('ocupada') ? 'block' : 'none';
            else if (filtro === 'livres') card.style.display = card.classList.contains('livre') ? 'block' : 'none';
        });
        document.querySelectorAll('.mesas-filtros .btn-filtro').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`filtroTodasMesas`) || document.getElementById(`filtroOcupadas`) || document.getElementById(`filtroLivres`);
        if (btnAtivo) btnAtivo.classList.add('active');
    },

    abrirMenuMesa: async function(mesa) {
        if (mesa.status === 'livre') { if (confirm(`Abrir comanda na Mesa ${mesa.numero}?`)) await this.abrirComanda(mesa); }
        else { const opcao = confirm(`Mesa ${mesa.numero} - R$ ${mesa.valor_total.toFixed(2)}\n\nOK = Ver Comanda\nCancelar = Fechar Conta`); if (opcao) await this.abrirComanda(mesa); else await this.mostrarModalFecharConta(mesa); }
    },

    abrirComanda: async function(mesa) {
        this.mesaAtual = mesa; await this.carregarProdutos();
        this.pagination.setup(this.cache.produtos, 25);
        this.carrinho = mesa.pedido_atual ? JSON.parse(mesa.pedido_atual) : [];
        if (mesa.status === 'livre') {
            const { error } = await supabase.from('mesas').update({ status: 'ocupada', pedido_atual: '[]', valor_total: 0 }).eq('id', mesa.id);
            if (error) console.error('❌ Erro ao ocupar mesa:', error);
            else { this.mesaAtual.status = 'ocupada'; }
        }
        document.getElementById('comandaTitulo').textContent = `📋 Mesa ${mesa.numero}`;
        this.showScreen('comandaScreen');
        this.carregarProdutosComanda();
        this.atualizarComanda();
    },

    carregarProdutosComanda: function() { this.renderizarCategoriasMesas(); this.renderizarProdutosMesas(); },
    
    renderizarCategoriasMesas: function() {
        const container = document.getElementById('categoriasMesas');
        if (!container) return;
        const categorias = [{ id: 'todas', nome: '🍽️ Todas' }, { id: 'lanches', nome: '🥪 Lanches' }, { id: 'salgados', nome: '🥟 Salgados' }, { id: 'bolos', nome: '🍰 Bolos' }, { id: 'bebidas', nome: '🥤 Bebidas' }, { id: 'sobremesa', nome: '🍨 Sobremesas' }, { id: 'bomboniere', nome: '🍬 Bomboniere' }];
        container.innerHTML = categorias.map(cat => `<button class="btn-filtro ${app.pagination.currentCategory === cat.id ? 'active' : ''}" onclick="app.filtrarCategoriaMesas('${cat.id}')">${cat.nome}</button>`).join('');
    },

    filtrarCategoriaMesas: function(categoria) {
        app.pagination.currentCategory = categoria;
        app.pagination.currentPage = 1;
        const termoPesquisa = document.getElementById('pesquisaMesas')?.value.toLowerCase().trim() || '';
        app.pagination.filteredData = app.filtering.apply(app.cache.produtos, termoPesquisa, categoria);
        this.renderizarProdutosMesas();
    },

    pesquisarProdutosMesas: function() {
        const termoPesquisa = document.getElementById('pesquisaMesas').value.toLowerCase().trim();
        app.pagination.currentPage = 1;
        app.pagination.filteredData = app.filtering.apply(app.cache.produtos, termoPesquisa, app.pagination.currentCategory || 'todas');
        this.renderizarProdutosMesas();
    },

    renderizarProdutosMesas: function() {
        const lista = document.getElementById('listaProdutosComanda');
        if (!lista) return;
        if (app.pagination.filteredData.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>'; app.pagination.renderPaginationControls('paginacaoMesas', this.renderizarProdutosMesas.bind(this)); return; }
        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(produto => {
            const div = document.createElement('div'); div.className = 'produto-card'; div.onclick = () => this.adicionarAoCarrinhoComanda(produto.id);
            div.innerHTML = `<h4>${produto.nome}</h4><p>R$ ${produto.preco?.toFixed(2)}</p><small>Estoque: ${produto.estoque}</small><div class="categoria-badge-small">${this.getIconeCategoria(produto.categoria)} ${produto.categoria}</div>`;
            lista.appendChild(div);
        });
        app.pagination.renderPaginationControls('paginacaoMesas', this.renderizarProdutosMesas.bind(this));
    },

    adicionarAoCarrinhoComanda: function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        if (produto.estoque <= 0) { this.mostrarToast('Produto sem estoque!', 'error'); return; }
        const itemExistente = this.carrinho.find(item => item.id === produtoId);
        if (itemExistente) { if (itemExistente.quantidade < produto.estoque) itemExistente.quantidade += 1; else { this.mostrarToast('Estoque insuficiente!', 'warning'); return; } }
        else { this.carrinho.push({ id: produto.id, nome: produto.nome, preco: produto.preco, quantidade: 1 }); }
        this.atualizarComanda(); this.salvarComanda(); this.mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    },

    atualizarComanda: function() {
        const comandaItens = document.getElementById('comandaItens');
        if (!comandaItens) return;
        if (this.carrinho.length === 0) { comandaItens.innerHTML = '<div class="empty-state">Comanda vazia</div>'; }
        else {
            comandaItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info"><h4>${item.nome}</h4><p>R$ ${item.preco?.toFixed(2)} x ${item.quantidade}</p></div>
                    <div class="carrinho-item-acoes"><span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span><button onclick="app.removerDoCarrinhoComanda(${item.id})">🗑️</button></div>
                </div>
            `).join('');
        }
        const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        document.getElementById('comandaTotal').textContent = total.toFixed(2);
    },

    removerDoCarrinhoComanda: function(produtoId) { const index = this.carrinho.findIndex(item => item.id === produtoId); if (index !== -1) { this.carrinho.splice(index, 1); this.atualizarComanda(); this.salvarComanda(); } },

    salvarComanda: async function() {
        if (!this.mesaAtual) return;
        const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
        const { error } = await supabase.from('mesas').update({ status: 'ocupada', pedido_atual: JSON.stringify(this.carrinho), valor_total: total }).eq('id', this.mesaAtual.id);
        if (error) console.error('❌ Erro ao salvar comanda:', error);
        else { this.mesaAtual.valor_total = total; this.mesaAtual.pedido_atual = JSON.stringify(this.carrinho); }
    },

    voltarParaMesas: async function() { this.mesaAtual = null; this.carrinho = []; await this.carregarMesas(); this.showScreen('mesasScreen'); },

    imprimirComanda: function() { if (this.carrinho.length === 0) { this.mostrarToast('Comanda vazia!', 'warning'); return; } const total = this.carrinho.reduce((sum, item) => sum + (item.preco * item.quantidade), 0); let conteudo = `═══════════════════════════════\n      🍰 DOCE JARDIM 🍰\n═══════════════════════════════\n\nMesa: ${this.mesaAtual.numero}\nData: ${new Date().toLocaleString('pt-BR')}\n\n───────────────────────────────\nITENS\n───────────────────────────────\n`; this.carrinho.forEach(item => { conteudo += `\n${item.nome}\n`; conteudo += `${item.quantidade}x R$ ${item.preco.toFixed(2)} = R$ ${(item.preco * item.quantidade).toFixed(2)}\n`; }); conteudo += `\n───────────────────────────────`; conteudo += `\nTOTAL: R$ ${total.toFixed(2)}`; conteudo += `\n═══════════════════════════════`; alert(conteudo); this.mostrarToast('Comanda impressa!', 'info'); },

    mostrarModalFecharConta: function(mesa) {
        this.mesaAtual = mesa;
        if (mesa.pedido_atual) { try { this.carrinho = JSON.parse(mesa.pedido_atual); } catch (e) { this.carrinho = []; } }
        const total = mesa.valor_total || 0;
        document.getElementById('modalMesaNumero').textContent = mesa.numero;
        document.getElementById('modalSubtotal').textContent = total.toFixed(2);
        document.getElementById('modalTotalConta').textContent = total.toFixed(2);
        document.getElementById('modalTotalFinal').textContent = total.toFixed(2);
        const modal = document.getElementById('modalFecharConta');
        modal.classList.add('active'); modal.style.display = 'flex';
        const tipoDesconto = document.getElementById('modalTipoDesconto'); const valorDesconto = document.getElementById('modalValorDesconto');
        const tipoDescontoNovo = tipoDesconto.cloneNode(true); const valorDescontoNovo = valorDesconto.cloneNode(true);
        tipoDesconto.parentNode.replaceChild(tipoDescontoNovo, tipoDesconto); valorDesconto.parentNode.replaceChild(valorDescontoNovo, valorDesconto);
        document.getElementById('modalTipoDesconto').addEventListener('change', () => { const tipo = document.getElementById('modalTipoDesconto').value; const valor = document.getElementById('modalValorDesconto'); if (tipo === 'nenhum') { valor.style.display = 'none'; valor.value = ''; } else { valor.style.display = 'block'; setTimeout(() => valor.focus(), 100); } this.calcularTotalModal(); });
        document.getElementById('modalValorDesconto').addEventListener('input', () => this.calcularTotalModal());
    },

    calcularTotalModal: function() {
        const subtotal = this.mesaAtual.valor_total || 0;
        const tipoDesconto = document.getElementById('modalTipoDesconto').value;
        const valorDescontoInput = document.getElementById('modalValorDesconto').value;
        let desconto = 0;
        if (tipoDesconto !== 'nenhum' && valorDescontoInput) { const valorDesconto = parseFloat(valorDescontoInput); if (tipoDesconto === 'percentual') desconto = (subtotal * valorDesconto) / 100; else desconto = valorDesconto; }
        if (desconto > 0) { document.getElementById('modalDescontoAplicado').style.display = 'block'; document.getElementById('modalValorDescontoAplicado').textContent = desconto.toFixed(2); }
        else { document.getElementById('modalDescontoAplicado').style.display = 'none'; }
        const totalFinal = subtotal - desconto;
        document.getElementById('modalTotalFinal').textContent = totalFinal.toFixed(2);
    },

    fecharModalConta: function() { const modal = document.getElementById('modalFecharConta'); modal.classList.remove('active'); modal.style.display = 'none'; document.getElementById('modalTipoDesconto').value = 'nenhum'; document.getElementById('modalValorDesconto').value = ''; document.getElementById('modalValorDesconto').style.display = 'none'; },

    confirmarFechamentoConta: async function() {
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
        
        const venda = {
            itens: JSON.stringify(this.carrinho),
            subtotal: subtotal,
            desconto: desconto,
            total: total,
            forma_pagamento: formaPagamento,
            mesa_numero: this.mesaAtual.numero,
            data: new Date().toISOString()
        };
        
        // Adicionar informações do usuário se estiver logado
        if (this.usuarioLogado) {
            venda.usuario_id = this.usuarioLogado.id;
            venda.usuario_nome = this.usuarioLogado.nome;
        }
        
        const sucesso = await this.registrarVenda(venda);
        
        if (!sucesso) {
            this.mostrarToast('Erro ao registrar venda', 'error');
            return;
        }
        
        // Atualizar estoque dos produtos vendidos
        for (const item of this.carrinho) {
            const produto = this.cache.produtos.find(p => p.id === item.id);
            if (produto) {
                produto.estoque -= item.quantidade;
                await this.atualizarProduto(produto);
            }
        }
        
        // Gerar comprovante PDF
        setTimeout(() => {
            this.gerarComprovantePDF(venda, this.mesaAtual.numero);
        }, 500);
        
        // Liberar mesa
        const { data, error } = await supabase.from('mesas')
            .update({ 
                status: 'livre', 
                pedido_atual: null, 
                valor_total: 0 
            })
            .eq('id', this.mesaAtual.id)
            .select();
        
        if (error) {
            console.error('❌ ERRO AO LIBERAR MESA:', error);
            this.mostrarToast('Erro ao liberar mesa: ' + error.message, 'error');
            return;
        }
        
        this.fecharModalConta();
        this.carrinho = [];
        const mesaNumero = this.mesaAtual.numero;
        this.mesaAtual = null;
        
        this.mostrarToast(`Mesa ${mesaNumero} fechada e comprovante gerado!`, 'sucesso');
        await this.carregarMesas();
        this.showScreen('mesasScreen');
    },

    finalizarComanda: function() { if (!this.mesaAtual) return; if (this.carrinho.length === 0) { this.mostrarToast('Comanda vazia!', 'warning'); return; } this.mostrarModalFecharConta(this.mesaAtual); },

    // ==================== PDV ====================
    carregarProdutosPDV: async function() {
        await this.carregarProdutos();
        app.pagination.setup(this.cache.produtos, 25);
        app.pagination.currentCategory = 'todas';
        const inputPesquisa = document.getElementById('pesquisaPDV'); if (inputPesquisa) inputPesquisa.value = '';
        this.renderizarCategoriasPDV();
        this.renderizarProdutosPDV();
        this.atualizarCarrinho();
    },

    renderizarCategoriasPDV: function() {
        const container = document.getElementById('categoriasPDV');
        if (!container) return;
        const categorias = [{ id: 'todas', nome: '🍽️ Todas' }, { id: 'lanches', nome: '🥪 Lanches' }, { id: 'salgados', nome: '🥟 Salgados' }, { id: 'bolos', nome: '🍰 Bolos' }, { id: 'bebidas', nome: '🥤 Bebidas' }, { id: 'sobremesa', nome: '🍨 Sobremesas' }, { id: 'bomboniere', nome: '🍬 Bomboniere' }];
        container.innerHTML = categorias.map(cat => `<button class="btn-filtro ${app.pagination.currentCategory === cat.id ? 'active' : ''}" onclick="app.filtrarCategoriaPDV('${cat.id}')">${cat.nome}</button>`).join('');
    },

    filtrarCategoriaPDV: function(categoria) {
        app.pagination.currentCategory = categoria;
        app.pagination.currentPage = 1;
        const termoPesquisa = document.getElementById('pesquisaPDV')?.value.toLowerCase().trim() || '';
        app.pagination.filteredData = app.filtering.apply(app.cache.produtos, termoPesquisa, categoria);
        this.renderizarProdutosPDV();
    },

    pesquisarProdutosPDV: function() {
        const termoPesquisa = document.getElementById('pesquisaPDV').value.toLowerCase().trim();
        app.pagination.currentPage = 1;
        app.pagination.filteredData = app.filtering.apply(app.cache.produtos, termoPesquisa, app.pagination.currentCategory || 'todas');
        this.renderizarProdutosPDV();
    },

    renderizarProdutosPDV: function() {
        const lista = document.getElementById('listaProdutosPDV');
        if (!lista) return;
        if (app.pagination.filteredData.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>'; app.pagination.renderPaginationControls('paginacaoPDV', this.renderizarProdutosPDV.bind(this)); return; }
        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(produto => {
            const div = document.createElement('div'); div.className = 'produto-card'; div.onclick = () => this.adicionarAoCarrinho(produto.id);
            div.innerHTML = `<h4>${produto.nome}</h4><p>R$ ${produto.preco?.toFixed(2)}</p><small>Estoque: ${produto.estoque}</small><div class="categoria-badge-small">${this.getIconeCategoria(produto.categoria)} ${produto.categoria}</div>`;
            lista.appendChild(div);
        });
        app.pagination.renderPaginationControls('paginacaoPDV', this.renderizarProdutosPDV.bind(this));
    },

    adicionarAoCarrinho: function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        if (produto.estoque <= 0) { this.mostrarToast('Produto sem estoque!', 'error'); return; }
        const itemExistente = this.carrinho.find(item => item.id === produtoId);
        if (itemExistente) { if (itemExistente.quantidade < produto.estoque) itemExistente.quantidade += 1; else { this.mostrarToast('Estoque insuficiente!', 'warning'); return; } }
        else { this.carrinho.push({ id: produto.id, nome: produto.nome, preco: produto.preco, quantidade: 1 }); }
        this.atualizarCarrinho(); this.mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    },

    removerDoCarrinho: function(produtoId) { const index = this.carrinho.findIndex(item => item.id === produtoId); if (index !== -1) { this.carrinho.splice(index, 1); this.atualizarCarrinho(); } },

    atualizarCarrinho: function() {
        const carrinhoItens = document.getElementById('carrinhoItens');
        if (!carrinhoItens) return;
        if (this.carrinho.length === 0) { carrinhoItens.innerHTML = '<div class="empty-state">Carrinho vazio</div>'; }
        else {
            carrinhoItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info"><h4>${item.nome}</h4><p>R$ ${item.preco?.toFixed(2)} x ${item.quantidade}</p></div>
                    <div class="carrinho-item-acoes"><span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span><button onclick="app.removerDoCarrinho(${item.id})">🗑️</button></div>
                </div>
            `).join('');
        }
        this.calcularTotal();
    },

    calcularTotal: function() {
        const subtotal = this.carrinho.reduce((total, item) => total + ((item.preco || 0) * item.quantidade), 0);
        document.getElementById('subtotalCarrinho').textContent = subtotal.toFixed(2);
        const tipoDesconto = document.getElementById('tipoDesconto').value;
        const valorDescontoInput = document.getElementById('valorDesconto');
        const descontoAplicadoDiv = document.getElementById('descontoAplicado');
        let desconto = 0;
        if (tipoDesconto === 'nenhum') { valorDescontoInput.style.display = 'none'; descontoAplicadoDiv.style.display = 'none'; }
        else {
            valorDescontoInput.style.display = 'block';
            const valorDesconto = parseFloat(valorDescontoInput.value) || 0;
            if (tipoDesconto === 'percentual') desconto = (subtotal * valorDesconto) / 100;
            else desconto = valorDesconto;
            if (desconto > 0) { descontoAplicadoDiv.style.display = 'block'; document.getElementById('valorDescontoAplicado').textContent = desconto.toFixed(2); }
            else { descontoAplicadoDiv.style.display = 'none'; }
        }
        const total = subtotal - desconto;
        document.getElementById('carrinhoTotal').textContent = total.toFixed(2);
    },

    finalizarVenda: async function() {
        if (this.carrinho.length === 0) {
            this.mostrarToast('Carrinho vazio!', 'warning');
            return;
        }
        
        this.setButtonLoading('finalizarVenda', true, 'Finalizar Venda');
        
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
        
        // Adicionar informações do usuário se estiver logado
        if (this.usuarioLogado) {
            venda.usuario_id = this.usuarioLogado.id;
            venda.usuario_nome = this.usuarioLogado.nome;
        }
        
        const sucesso = await this.registrarVenda(venda);
        
        if (sucesso) {
            // Atualizar estoque
            for (const item of this.carrinho) {
                const produto = this.cache.produtos.find(p => p.id === item.id);
                if (produto) {
                    produto.estoque -= item.quantidade;
                    await this.atualizarProduto(produto);
                }
            }
            
            // Gerar comprovante PDF
            setTimeout(() => {
                this.gerarComprovantePDF(venda);
            }, 500);
            
            // Limpar carrinho e resetar interface
            this.carrinho = [];
            this.atualizarCarrinho();
            document.getElementById('tipoDesconto').value = 'nenhum';
            document.getElementById('valorDesconto').value = '';
            document.getElementById('valorDesconto').style.display = 'none';
            this.calcularTotal();
            await this.carregarProdutosPDV();
            
            this.mostrarToast('Venda finalizada e comprovante gerado!', 'sucesso');
        }
        
        this.setButtonLoading('finalizarVenda', false, 'Finalizar Venda');
    },

    limparCarrinho: function() { if (this.carrinho.length === 0) return; if (confirm('Deseja realmente limpar o carrinho?')) { this.carrinho = []; this.atualizarCarrinho(); this.mostrarToast('Carrinho limpo', 'info'); } },

    // ==================== UTILITÁRIOS ====================
    getIconeCategoria: function(categoria) { const icones = { 'lanches': '🥪', 'salgados': '🥟', 'bolos': '🍰', 'bebidas': '🥤', 'sobremesa': '🍨', 'bomboniere': '🍬' }; return icones[categoria] || '📦'; },

    // ==================== PRODUTOS ====================
    listarProdutos: async function() { await this.carregarProdutos(); app.pagination.setup(this.cache.produtos, 5); const inputPesquisa = document.getElementById('pesquisaProduto'); if (inputPesquisa) inputPesquisa.value = ''; this.renderizarPaginaProdutos(); },

    pesquisarProdutos: function() {
        const termoPesquisa = document.getElementById('pesquisaProduto').value.toLowerCase().trim();
        app.pagination.currentPage = 1;
        app.pagination.filteredData = app.filtering.apply(app.cache.produtos, termoPesquisa, 'todas');
        this.renderizarPaginaProdutos();
    },

    renderizarPaginaProdutos: function() {
        const lista = document.getElementById('listaProdutos');
        if (!lista) return;
        if (app.pagination.filteredData.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>'; app.pagination.renderPaginationControls('paginacaoProdutos', this.renderizarPaginaProdutos.bind(this)); return; }
        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(produto => {
            const div = document.createElement('div'); div.className = 'produto-item';
            div.innerHTML = `<div class="produto-item-info"><h4>${produto.nome}</h4><p>Preço: R$ ${produto.preco?.toFixed(2)} | Estoque: ${produto.estoque} | Categoria: ${produto.categoria}</p></div><div><button onclick="app.editarProduto(${produto.id})">✏️ Editar</button><button onclick="app.excluirProduto(${produto.id})">🗑️ Excluir</button></div>`;
            lista.appendChild(div);
        });
        app.pagination.renderPaginationControls('paginacaoProdutos', this.renderizarPaginaProdutos.bind(this));
    },

    adicionarProduto: async function() {
        const nome = document.getElementById('produtoNome').value.trim();
        const preco = parseFloat(document.getElementById('produtoPreco').value);
        const estoque = parseInt(document.getElementById('produtoEstoque').value);
        const categoria = document.getElementById('produtoCategoria').value;
        if (!nome || !preco || isNaN(estoque) || !categoria) { this.mostrarToast('Preencha todos os campos!', 'warning'); return; }
        this.setButtonLoading('adicionarProduto', true, 'Adicionar Produto');
        try {
            const { error } = await supabase.from('produto').insert([{ nome, preco, estoque, categoria }]);
            if (error) throw error;
            document.getElementById('produtoNome').value = ''; document.getElementById('produtoPreco').value = ''; document.getElementById('produtoEstoque').value = ''; document.getElementById('produtoCategoria').value = '';
            await this.carregarProdutos(); await this.listarProdutos();
            this.mostrarToast('Produto adicionado!', 'sucesso');
        } catch (error) { console.error('❌ Erro ao adicionar produto:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
        finally { this.setButtonLoading('adicionarProduto', false, 'Adicionar Produto'); }
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
        modal.classList.add('active'); modal.style.display = 'flex';
    },

    salvarEdicaoProduto: async function() {
        const id = parseInt(document.getElementById('editProdutoId').value);
        const nome = document.getElementById('editProdutoNome').value.trim();
        const preco = parseFloat(document.getElementById('editProdutoPreco').value);
        const estoque = parseInt(document.getElementById('editProdutoEstoque').value);
        const categoria = document.getElementById('editProdutoCategoria').value;
        if (!nome || !preco || isNaN(estoque) || !categoria) { this.mostrarToast('Preencha todos os campos!', 'warning'); return; }
        try {
            const { error } = await supabase.from('produto').update({ nome, preco, estoque, categoria }).eq('id', id);
            if (error) throw error;
            await this.carregarProdutos(); await this.listarProdutos();
            this.fecharModalEdicao();
            this.mostrarToast('Produto atualizado!', 'sucesso');
        } catch (error) { console.error('❌ Erro ao atualizar:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
    },

    fecharModalEdicao: function() { const modal = document.getElementById('modalEditarProduto'); modal.classList.remove('active'); modal.style.display = 'none'; },

    excluirProduto: async function(produtoId) {
        const produto = this.cache.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        if (!confirm(`Deseja excluir "${produto.nome}"?`)) return;
        try {
            const { error } = await supabase.from('produto').delete().eq('id', produtoId);
            if (error) throw error;
            await this.carregarProdutos(); await this.listarProdutos();
            this.mostrarToast('Produto excluído!', 'sucesso');
        } catch (error) { console.error('❌ Erro ao excluir:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
    },

    atualizarProduto: async function(produto) {
        try { if (!isOnline) return true; const { error } = await supabase.from('produto').update(produto).eq('id', produto.id); if (error) throw error; return true; }
        catch (error) { console.error('❌ Erro ao atualizar produto:', error); return false; }
    },

    // ==================== ESTOQUE ====================
    listarEstoque: async function() {
        console.log('🔄 Carregando estoque...');
        await this.carregarProdutos();
        const lista = document.getElementById('listaEstoque');
        if (!lista) { console.error('❌ Elemento listaEstoque não encontrado'); return; }
        if (this.cache.produtos.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhum produto cadastrado</div>'; return; }
        app.pagination.setup(this.cache.produtos, 5);
        this.renderizarPaginaEstoque();
    },

    renderizarPaginaEstoque: function() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;
        const produtosPagina = app.pagination.getPageItems();
        let html = `
            <div class="estoque-header"><h3>Controle de Estoque</h3><p class="estoque-info">Mostrando ${(app.pagination.currentPage - 1) * app.pagination.itemsPerPage + 1}-${Math.min(app.pagination.currentPage * app.pagination.itemsPerPage, this.cache.produtos.length)} de ${this.cache.produtos.length} produtos</p></div>
            <div class="tabela-estoque-container"><table class="tabela-estoque"><thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Status</th></tr></thead><tbody>
        `;
        produtosPagina.forEach(produto => {
            let badge = '', badgeClass = '', statusIcone = '';
            if (produto.estoque === 0) { badge = 'SEM ESTOQUE'; badgeClass = 'estoque-critico'; statusIcone = '❌'; }
            else if (produto.estoque <= 5) { badge = 'BAIXO'; badgeClass = 'estoque-baixo'; statusIcone = '⚠️'; }
            else { badge = 'OK'; badgeClass = 'estoque-ok'; statusIcone = '✅'; }
            html += `<tr class="linha-estoque ${badgeClass}"><td data-label="Produto"><strong>${produto.nome}</strong><small class="categoria-badge">${produto.categoria}</small></td><td data-label="Quantidade"><span class="quantidade-destaque">${produto.estoque}</span></td><td data-label="Preço">R$ ${produto.preco?.toFixed(2)}</td><td data-label="Status"><span class="badge-status ${badgeClass}">${statusIcone} ${badge}</span></td></tr>`;
        });
        html += `</tbody></table></div><div class="paginacao-estoque"><button onclick="app.pagination.changePage('anterior', 'listaEstoque', app.renderizarPaginaEstoque.bind(app))" class="btn-paginacao" ${app.pagination.currentPage === 1 ? 'disabled' : ''}>← Anterior</button><span class="info-pagina">Página ${app.pagination.currentPage} de ${app.pagination.totalPages}</span><button onclick="app.pagination.changePage('proxima', 'listaEstoque', app.renderizarPaginaEstoque.bind(app))" class="btn-paginacao" ${app.pagination.currentPage === app.pagination.totalPages ? 'disabled' : ''}>Próxima →</button></div>`;
        lista.innerHTML = html;
    },

    // ==================== RELATÓRIOS ====================
    carregarRelatorios: async function() {
        try {
            this.cache.vendas = await this.carregarVendasComHoraCorrigida();
            await this.carregarUsuarios();
            this.criarFiltroUsuarios();
            this.calcularEstatisticas();
            this.filtrarVendas('hoje');
        } catch (error) { 
            console.error('❌ Erro ao carregar relatórios:', error); 
            this.mostrarToast('Erro ao carregar relatórios', 'error'); 
        }
    },

    carregarVendasComHoraCorrigida: async function() {
        try {
            const { data, error } = await supabase.from('vendas').select('*').order('data', { ascending: false });
            if (error) throw error;
            return (data || []).map(venda => {
                if (venda.data) {
                    const dataUTC = new Date(venda.data);
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
        const vendas = vendasFiltradas || this.vendasFiltradasParaRelatorio;
        
        // CORREÇÃO: Calcular vendas de hoje corretamente
        const hoje = new Date(); 
        hoje.setHours(0, 0, 0, 0);
        
        const vendasHoje = vendas.filter(v => { 
            if (!v.data_corrigida && !v.data) return false;
            const dataVenda = new Date(v.data_corrigida || v.data); 
            dataVenda.setHours(0, 0, 0, 0); 
            return dataVenda.getTime() === hoje.getTime(); 
        });
        
        // CORREÇÃO: Somar corretamente os valores totais
        const totalVendasHoje = vendasHoje.reduce((sum, v) => {
            const total = parseFloat(v.total) || 0;
            return sum + total;
        }, 0);
        
        const totalVendas = vendas.length;
        
        // CORREÇÃO: Contar produtos vendidos corretamente
        const totalProdutos = vendas.reduce((sum, v) => { 
            try { 
                const itens = JSON.parse(v.itens || '[]'); 
                return sum + itens.reduce((s, item) => s + (parseInt(item.quantidade) || 0), 0); 
            } catch { 
                return sum; 
            } 
        }, 0);
        
        // CORREÇÃO: Calcular ticket médio corretamente
        const totalGeralVendas = vendas.reduce((sum, v) => {
            const total = parseFloat(v.total) || 0;
            return sum + total;
        }, 0);
        
        const ticketMedio = totalVendas > 0 ? totalGeralVendas / totalVendas : 0;
        
        // Atualizar a interface
        document.getElementById('vendasHoje').textContent = totalVendasHoje.toFixed(2);
        document.getElementById('totalVendas').textContent = totalVendas;
        document.getElementById('produtosVendidos').textContent = totalProdutos;
        document.getElementById('ticketMedio').textContent = ticketMedio.toFixed(2);
        
        console.log('📊 Estatísticas calculadas:', {
            vendasHoje: totalVendasHoje,
            totalVendas: totalVendas,
            totalProdutos: totalProdutos,
            ticketMedio: ticketMedio,
            periodo: vendasFiltradas ? 'Filtrado' : 'Geral'
        });
    },

    filtrarVendas: function(periodo) {
        const hoje = new Date(); 
        hoje.setHours(0, 0, 0, 0);
        let vendasFiltradas = [];
        
        switch(periodo) {
            case 'hoje': 
                vendasFiltradas = this.cache.vendas.filter(v => { 
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data); 
                    dataVenda.setHours(0, 0, 0, 0); 
                    return dataVenda.getTime() === hoje.getTime(); 
                }); 
                break;
                
            case 'semana': 
                const inicioSemana = new Date(hoje); 
                inicioSemana.setDate(hoje.getDate() - hoje.getDay()); 
                vendasFiltradas = this.cache.vendas.filter(v => { 
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data); 
                    return dataVenda >= inicioSemana; 
                }); 
                break;
                
            case 'mes': 
                const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1); 
                vendasFiltradas = this.cache.vendas.filter(v => { 
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data); 
                    return dataVenda >= inicioMes; 
                }); 
                break;
                
            default: 
                vendasFiltradas = this.cache.vendas;
        }
        
        // Aplicar filtro de usuário se selecionado
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (filtroUsuario && filtroUsuario.value !== 'todos') { 
            const usuarioId = parseInt(filtroUsuario.value); 
            vendasFiltradas = vendasFiltradas.filter(v => v.usuario_id === usuarioId); 
        }
        
        this.vendasFiltradasParaRelatorio = vendasFiltradas;
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistoricoVendas(vendasFiltradas);
        
        // Atualizar botões de filtro ativos
        document.querySelectorAll('.filtros-buttons .btn-filtro').forEach(btn => btn.classList.remove('active'));
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
            if (!v.data_corrigida && !v.data) return false;
            const dataVenda = new Date(v.data_corrigida || v.data); 
            return dataVenda >= inicio && dataVenda <= fim; 
        });
        
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (filtroUsuario && filtroUsuario.value !== 'todos') { 
            const usuarioId = parseInt(filtroUsuario.value); 
            vendasFiltradas = vendasFiltradas.filter(v => v.usuario_id === usuarioId); 
        }
        
        this.vendasFiltradasParaRelatorio = vendasFiltradas;
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistoricoVendas(vendasFiltradas);
        
        document.querySelectorAll('.filtros-buttons .btn-filtro').forEach(btn => btn.classList.remove('active'));
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
        
        // CORREÇÃO: Calcular totais para exibição no histórico
        const totalPeriodo = vendas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
        
        let html = `
            <div class="resumo-periodo">
                <strong>Total do período: R$ ${totalPeriodo.toFixed(2)}</strong> | 
                ${vendas.length} venda(s)
            </div>
        `;
        
        html += vendas.map(venda => {
            const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
            let itens = [];
            try { 
                if (venda.itens && typeof venda.itens === 'string' && venda.itens.trim() !== '') { 
                    itens = JSON.parse(venda.itens); 
                } 
            } catch (e) { 
                console.error('Erro ao fazer parse dos items:', e, venda.itens); 
                itens = []; 
            }
            
            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            const usuarioTexto = venda.usuario_nome ? ` | ${venda.usuario_nome}` : '';
            const totalVenda = parseFloat(venda.total) || 0;
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>${dataExibicao}${mesaTexto}${usuarioTexto}</strong>
                        <strong class="valor-venda">R$ ${totalVenda.toFixed(2)}</strong>
                    </div>
                    <p><strong>Forma de pagamento:</strong> ${venda.forma_pagamento}</p>
                    <div class="venda-item-produtos">
                        <strong>Produtos:</strong> ${itens.map(item => `${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`).join(', ')}
                    </div>
                    ${venda.desconto > 0 ? `<p><strong>Desconto:</strong> R$ ${parseFloat(venda.desconto).toFixed(2)}</p>` : ''}
                </div>
            `;
        }).join('');
        
        html += `<div class="exportar-pdf-container"><button onclick="app.exportarParaPDF()" class="btn-primary">📄 Exportar para PDF</button></div>`;
        
        historico.innerHTML = html;
    },

    exportarParaPDF: function() {
        if (typeof window.jspdf === 'undefined') { 
            this.mostrarToast('Erro: Biblioteca de PDF não carregada.', 'error'); 
            return; 
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Cabeçalho
        doc.setFontSize(16); 
        doc.setFont(undefined, 'bold');
        doc.text('RELATÓRIO DE VENDAS - DOCE JARDIM', 105, 15, { align: 'center' });
        
        doc.setFontSize(10); 
        doc.setFont(undefined, 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 105, 22, { align: 'center' });
        
        let yPosition = 35;
        
        // Estatísticas
        doc.setFontSize(12); 
        doc.setFont(undefined, 'bold');
        doc.text('ESTATÍSTICAS:', 14, yPosition); 
        yPosition += 8;
        
        doc.setFontSize(10); 
        doc.setFont(undefined, 'normal');
        
        // CORREÇÃO: Usar os valores calculados corretamente
        doc.text(`Vendas Hoje: R$ ${document.getElementById('vendasHoje').textContent}`, 20, yPosition); 
        yPosition += 6;
        doc.text(`Total de Vendas: ${document.getElementById('totalVendas').textContent}`, 20, yPosition); 
        yPosition += 6;
        doc.text(`Produtos Vendidos: ${document.getElementById('produtosVendidos').textContent}`, 20, yPosition); 
        yPosition += 6;
        doc.text(`Ticket Médio: R$ ${document.getElementById('ticketMedio').textContent}`, 20, yPosition); 
        yPosition += 12;
        
        // Histórico de vendas
        doc.setFontSize(12); 
        doc.setFont(undefined, 'bold');
        doc.text('HISTÓRICO DE VENDAS:', 14, yPosition); 
        yPosition += 10;
        
        if (this.vendasFiltradasParaRelatorio.length === 0) { 
            doc.setFontSize(10); 
            doc.text('Nenhuma venda no período selecionado.', 20, yPosition); 
        } else {
            // CORREÇÃO: Calcular total para o PDF também
            const totalPDF = this.vendasFiltradasParaRelatorio.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`Total do período: R$ ${totalPDF.toFixed(2)} | ${this.vendasFiltradasParaRelatorio.length} venda(s)`, 14, yPosition);
            yPosition += 8;
            
            this.vendasFiltradasParaRelatorio.forEach((venda, index) => {
                if (yPosition > 270) { 
                    doc.addPage(); 
                    yPosition = 20; 
                }
                
                doc.setFontSize(9); 
                doc.setFont(undefined, 'bold');
                
                const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
                const mesaInfo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                const usuarioInfo = venda.usuario_nome || 'Sistema';
                
                doc.text(`${index + 1}. ${dataExibicao}`, 14, yPosition);
                yPosition += 4;
                
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.text(`${mesaInfo} | ${usuarioInfo} | ${venda.forma_pagamento}`, 14, yPosition);
                yPosition += 4;
                
                // Itens da venda
                let itens = []; 
                try { 
                    itens = JSON.parse(venda.itens || '[]'); 
                } catch (e) { 
                    itens = []; 
                }
                
                itens.forEach(item => {
                    if (yPosition > 270) { 
                        doc.addPage(); 
                        yPosition = 20; 
                    }
                    doc.text(`   ${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`, 14, yPosition);
                    yPosition += 4;
                });
                
                // Total da venda
                if (yPosition > 270) { 
                    doc.addPage(); 
                    yPosition = 20; 
                }
                
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                const totalVenda = parseFloat(venda.total) || 0;
                doc.text(`Total: R$ ${totalVenda.toFixed(2)}`, 160, yPosition, { align: 'right' });
                yPosition += 8;
                
                // Linha separadora
                doc.setDrawColor(200, 200, 200); 
                doc.line(14, yPosition, 196, yPosition); 
                yPosition += 10;
            });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`relatorio-vendas-${timestamp}.pdf`);
        
        this.mostrarToast('Relatório PDF gerado com sucesso!', 'sucesso');
    },

    // ==================== USUÁRIOS ====================
    carregarUsuarios: async function() {
        try { const { data, error } = await supabase.from('usuarios').select('*').order('id'); if (error) throw error; this.cache.usuarios = data || []; return this.cache.usuarios; }
        catch (error) { console.error('❌ Erro ao carregar usuários:', error); return []; }
    },

    listarUsuarios: async function() {
        await this.carregarUsuarios();
        app.pagination.setup(this.cache.usuarios, 5);
        const inputPesquisa = document.getElementById('pesquisaUsuario');
        if (inputPesquisa) inputPesquisa.value = '';
        this.renderizarPaginaUsuarios();
    },

    pesquisarUsuarios: function() {
        const termoPesquisa = document.getElementById('pesquisaUsuario').value.toLowerCase().trim();
        app.pagination.currentPage = 1;
        app.pagination.filteredData = app.filtering.apply(this.cache.usuarios, termoPesquisa, 'todas');
        this.renderizarPaginaUsuarios();
    },

    renderizarPaginaUsuarios: function() {
        const lista = document.getElementById('listaUsuarios');
        if (!lista) return;
        if (app.pagination.filteredData.length === 0) { lista.innerHTML = '<div class="empty-state">Nenhum usuário encontrado</div>'; app.pagination.renderPaginationControls('paginacaoUsuarios', this.renderizarPaginaUsuarios.bind(this)); return; }
        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(usuario => {
            const div = document.createElement('div'); div.className = 'produto-item';
            const icone = usuario.tipo === 'administrador' ? '👑' : '👤';
            const tipoTexto = usuario.tipo === 'administrador' ? 'Administrador' : 'Usuário Normal';
            const ultimoAcesso = usuario.ultimo_acesso ? this.formatarDataHoraCorreta(usuario.ultimo_acesso) : 'Nunca acessou';
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
        app.pagination.renderPaginationControls('paginacaoUsuarios', this.renderizarPaginaUsuarios.bind(this));
    },

    adicionarUsuario: async function() {
        this.setButtonLoading('adicionarUsuario', true, 'Adicionar Usuário');
        try {
            const nome = document.getElementById('usuarioNome').value.trim();
            const login = document.getElementById('usuarioLogin').value.trim();
            const senha = document.getElementById('usuarioSenha').value;
            const tipo = document.getElementById('usuarioTipo').value;
            if (!nome || !login || !senha || !tipo) { this.mostrarToast('Preencha todos os campos!', 'warning'); return; }
            const { data: existente } = await supabase.from('usuarios').select('id').eq('login', login).limit(1);
            if (existente && existente.length > 0) { this.mostrarToast('Login já existe! Escolha outro.', 'error'); return; }
            const hashedPassword = await this.hashPassword(senha);
            const { error } = await supabase.from('usuarios').insert([{ nome, login, senha: hashedPassword, tipo, ultimo_acesso: null }]);
            if (error) throw error;
            document.getElementById('usuarioNome').value = ''; document.getElementById('usuarioLogin').value = ''; document.getElementById('usuarioSenha').value = ''; document.getElementById('usuarioTipo').value = '';
            await this.listarUsuarios();
            this.mostrarToast(`Usuário "${nome}" adicionado com sucesso!`, 'sucesso');
        } catch (error) { console.error('❌ Erro ao adicionar usuário:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
        finally { this.setButtonLoading('adicionarUsuario', false, 'Adicionar Usuário'); }
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
        modal.classList.add('active'); modal.style.display = 'flex';
    },

    salvarEdicaoUsuario: async function() {
        const id = parseInt(document.getElementById('editUsuarioId').value);
        const nome = document.getElementById('editUsuarioNome').value.trim();
        const login = document.getElementById('editUsuarioLogin').value.trim();
        const senha = document.getElementById('editUsuarioSenha').value;
        const tipo = document.getElementById('editUsuarioTipo').value;
        if (!nome || !login || !tipo) { this.mostrarToast('Preencha todos os campos obrigatórios!', 'warning'); return; }
        try {
            const dadosAtualizar = { nome, login, tipo };
            if (senha.trim() !== '') { dadosAtualizar.senha = await this.hashPassword(senha); }
            const { error } = await supabase.from('usuarios').update(dadosAtualizar).eq('id', id);
            if (error) throw error;
            await this.listarUsuarios();
            this.fecharModalEdicaoUsuario();
            this.mostrarToast('Usuário atualizado!', 'sucesso');
        } catch (error) { console.error('❌ Erro ao atualizar:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
    },

    fecharModalEdicaoUsuario: function() { const modal = document.getElementById('modalEditarUsuario'); modal.classList.remove('active'); modal.style.display = 'none'; },

    excluirUsuario: async function(usuarioId) {
        const usuario = this.cache.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        if (this.usuarioLogado && this.usuarioLogado.id === usuarioId) { this.mostrarToast('Você não pode excluir seu próprio usuário!', 'error'); return; }
        if (!confirm(`Deseja excluir "${usuario.nome}"?`)) return;
        try {
            const { error } = await supabase.from('usuarios').delete().eq('id', usuarioId);
            if (error) throw error;
            await this.listarUsuarios();
            this.mostrarToast('Usuário excluído!', 'sucesso');
        } catch (error) { console.error('❌ Erro ao excluir:', error); this.mostrarToast(this.handleSupabaseError(error), 'error'); }
    },

    verLogUsuario: async function(usuarioId) {
        const usuario = this.cache.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        try {
            const { data: vendas, error } = await supabase.from('vendas').select('*').eq('usuario_id', usuarioId).order('data', { ascending: false });
            if (error) throw error;
            const totalVendas = vendas.length;
            const totalValor = vendas.reduce((sum, v) => sum + (v.total || 0), 0);
            let mensagem = `📊 LOGS DE VENDAS - ${usuario.nome}\n\nTotal de vendas: ${totalVendas}\nValor total: R$ ${totalValor.toFixed(2)}\n`;
            if (usuario.ultimo_acesso) { const ultimoAcesso = this.formatarDataHoraCorreta(usuario.ultimo_acesso); mensagem += `Último acesso: ${ultimoAcesso}\n`; }
            mensagem += '\n';
            if (vendas.length > 0) {
                mensagem += '───────────────────────\nÚLTIMAS 10 VENDAS:\n───────────────────────\n\n';
                vendas.slice(0, 10).forEach((venda, index) => {
                    const dataFormatada = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
                    const tipo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                    mensagem += `${index + 1}. ${dataFormatada}\n${tipo} - R$ ${venda.total?.toFixed(2) || '0.00'}\nPagamento: ${venda.forma_pagamento}\n\n`;
                });
            } else { mensagem += 'Nenhuma venda registrada ainda.'; }
            alert(mensagem);
        } catch (error) { console.error('❌ Erro ao buscar logs:', error); this.mostrarToast('Erro ao buscar logs', 'error'); }
    },

    // ==================== PWA ====================
    installApp: async function() {
        if (!deferredPrompt) { this.mostrarToast('App já instalado', 'info'); return; }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') { this.mostrarToast('App instalado!', 'sucesso'); }
        deferredPrompt = null;
        if (installBtnDash) installBtnDash.classList.add('hidden');
    }
};

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App Doce Jardim inicializado!');
    const loginPass = document.getElementById('loginPass');
    if (loginPass) { loginPass.addEventListener('keypress', function(e) { if (e.key === 'Enter') { app.login(); } }); }
    const tipoDesconto = document.getElementById('tipoDesconto'); const valorDesconto = document.getElementById('valorDesconto');
    if (tipoDesconto && valorDesconto) {
        tipoDesconto.addEventListener('change', function() { if (this.value === 'nenhum') { valorDesconto.style.display = 'none'; valorDesconto.value = ''; } else { valorDesconto.style.display = 'block'; setTimeout(() => valorDesconto.focus(), 100); } app.calcularTotal(); });
        valorDesconto.addEventListener('input', function() { app.calcularTotal(); });
        valorDesconto.addEventListener('touchstart', function(e) { e.target.focus(); });
    }
    window.addEventListener('click', function(event) {
        const modalEditar = document.getElementById('modalEditarProduto');
        const modalConta = document.getElementById('modalFecharConta');
        const modalUsuario = document.getElementById('modalEditarUsuario');
        if (event.target === modalEditar) { app.fecharModalEdicao(); }
        if (event.target === modalConta) { app.fecharModalConta(); }
        if (event.target === modalUsuario) { app.fecharModalEdicaoUsuario(); }
    });
    console.log('✅ Event listeners configurados');
});

// ==================== LISTENER PARA ATUALIZAÇÃO DO SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
            console.log('🎉 Nova versão do app detectada!');
            const container = document.getElementById('toastContainer');
            if (container) {
                const toast = document.createElement('div');
                toast.className = 'toast info';
                toast.innerHTML = `🎉 Nova versão disponível! <button onclick="window.location.reload()" style="margin-left: 10px; padding: 5px 10px; border: none; border-radius: 5px; background: white; color: #2196F3; cursor: pointer; font-weight: bold;">Atualizar</button>`;
                container.appendChild(toast);
                setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 30000);
            }
        }
    });
}


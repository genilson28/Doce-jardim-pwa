// ==================== IMPORTS ====================
import { supabase } from './config/supabase.js';
import { CATEGORIAS_EMOJIS } from './config/constants.js';
import { mostrarToast, setButtonLoading, handleSupabaseError } from './utils/ui.js';
import { formatarMoeda, formatarDataHora } from './utils/formatters.js';
import { hashPassword } from './utils/security.js';
import { ConnectionService } from './services/connectionService.js';
import { DataInitializer } from './services/dataInitializer.js';
import { serviceWorkerManager } from './services/serviceWorkerManager.js';
import { Pagination } from './utils/pagination.js';
import { Filtering } from './utils/filtering.js';

// Imports dos módulos
import { AuthModule } from './modules/auth/authModule.js';
import { ProdutosModule } from './modules/produtos/produtosModule.js';
import { MesasModule } from './modules/mesas/mesasModule.js';
import { PDVModule } from './modules/pdv/pdvModule.js';
import { VendasModule } from './modules/vendas/vendasModule.js';
import { EstoqueModule } from './modules/estoque/estoqueModule.js';
import { RelatoriosModule } from './modules/relatorios/relatoriosModule.js';
import { UsuariosModule } from './modules/usuarios/usuariosModule.js';
import { FornecedoresModule } from './modules/fornecedores/fornecedoresModule.js';
import { ComprasModule } from './modules/compras/comprasModule.js';
import { RelatorioFinanceiroModule } from './modules/relatorio-financeiro/relatorioFinanceiroModule.js';

// ==================== CLASSE PRINCIPAL ====================
class DoceJardimApp {
    constructor() {
        this.usuarioAtual = null;
        this.telaAtual = 'loginScreen';
        this.deferredPrompt = null;

        // Inicializar utilitários
        this.pagination = new Pagination();
        this.filtering = new Filtering();

        // Inicializar serviços
        this.connectionService = new ConnectionService();
        this.dataInitializer = new DataInitializer();
        this.serviceWorkerManager = serviceWorkerManager;

        // Inicializar módulos
        this.auth = new AuthModule(this);
        this.produtos = new ProdutosModule(this);
        this.mesas = new MesasModule(this);
        this.pdv = new PDVModule(this);
        this.vendas = new VendasModule(this);
        this.estoque = new EstoqueModule(this);
        this.relatorios = new RelatoriosModule(this);
        this.usuarios = new UsuariosModule(this);
        this.fornecedores = new FornecedoresModule(this);
        this.compras = new ComprasModule(this);
        this.relatorioFinanceiro = new RelatorioFinanceiroModule(this);

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Doce Jardim PDV...');
        
        // Inicializar dados
        await this.dataInitializer.init();
        
        // Inicializar Service Worker
        await this.serviceWorkerManager.init();
        
        // Verificar login
        this.auth.verificarLogin();
        
        // Event listeners globais
        this.setupEventListeners();
        
        // PWA Install
        this.setupPWA();

        console.log('✅ App inicializado com sucesso!');
    }

    setupEventListeners() {
        // Evento de mudança no tipo de desconto (PDV)
        const tipoDesconto = document.getElementById('tipoDesconto');
        if (tipoDesconto) {
            tipoDesconto.addEventListener('change', () => this.pdv.handleDescontoChange());
        }

        const valorDesconto = document.getElementById('valorDesconto');
        if (valorDesconto) {
            valorDesconto.addEventListener('input', () => this.pdv.calcularTotal());
        }

        // Evento de mudança no tipo de desconto (Modal Mesa)
        const modalTipoDesconto = document.getElementById('modalTipoDesconto');
        if (modalTipoDesconto) {
            modalTipoDesconto.addEventListener('change', () => this.mesas.handleDescontoChange());
        }

        const modalValorDesconto = document.getElementById('modalValorDesconto');
        if (modalValorDesconto) {
            modalValorDesconto.addEventListener('input', () => this.mesas.calcularTotalModal());
        }

        // Fechar modais ao clicar fora
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });

        // Fechar modal editar fornecedor
        const modalEditarFornecedor = document.getElementById('modalEditarFornecedor');
        if (modalEditarFornecedor) {
            modalEditarFornecedor.addEventListener('click', (e) => {
                if (e.target === modalEditarFornecedor) {
                    this.fornecedores.fecharModalEdicao();
                }
            });
        }

        // Enter no login
        const loginPass = document.getElementById('loginPass');
        if (loginPass) {
            loginPass.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.auth.login();
                }
            });
        }
    }

    setupPWA() {
        // Capturar evento de instalação
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            
            const installBtn = document.getElementById('installBtnDash');
            if (installBtn) {
                installBtn.classList.remove('hidden');
            }
        });

        // Detectar quando o app foi instalado
        window.addEventListener('appinstalled', () => {
            mostrarToast('App instalado com sucesso!', 'success');
            this.deferredPrompt = null;
        });
    }

    installApp() {
        if (!this.deferredPrompt) {
            mostrarToast('App já está instalado ou não pode ser instalado', 'info');
            return;
        }

        this.deferredPrompt.prompt();
        
        this.deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                mostrarToast('Instalando app...', 'success');
            }
            this.deferredPrompt = null;
        });
    }

    async showScreen(screenId) {
        // Esconder todas as telas
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Mostrar tela selecionada
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            this.telaAtual = screenId;

            // Carregar dados específicos de cada tela
            switch(screenId) {
                case 'dashboardScreen':
                    await this.auth.verificarPermissoes();
                    break;
                case 'mesasScreen':
                    await this.mesas.listar();
                    break;
                case 'pdvScreen':
                    await this.pdv.carregar();
                    break;
                case 'produtosScreen':
                    await this.produtos.listar();
                    break;
                case 'estoqueScreen':
                    await this.estoque.listar();
                    break;
                case 'vendasScreen':
                    await this.vendas.listar();
                    break;
                case 'relatoriosScreen':
                    await this.relatorios.carregar();
                    break;
                case 'usuariosScreen':
                    await this.usuarios.listar();
                    break;
                case 'fornecedoresScreen':
                    await this.fornecedores.listar();
                    break;
                case 'comprasScreen':
                    await this.compras.listar();
                    break;
                case 'relatorioFinanceiroScreen':
                    await this.relatorioFinanceiro.carregar();
                    break;
            }
        }
    }

    logout() {
        if (confirm('Deseja realmente sair do sistema?')) {
            localStorage.removeItem('usuarioLogado');
            this.usuarioAtual = null;
            this.showScreen('loginScreen');
            mostrarToast('Logout realizado com sucesso', 'success');
        }
    }
}

// ==================== INICIALIZAÇÃO ====================
const app = new DoceJardimApp();
window.app = app;
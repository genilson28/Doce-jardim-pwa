// ==================== MÓDULO DE AUTENTICAÇÃO ====================

import { supabase } from '../../config/supabase.js';
import { hashPassword } from '../../utils/security.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { dataInitializer } from '../../services/dataInitializer.js';

export class AuthModule {
    constructor(app) {
        this.app = app;
        this.usuarioLogado = null;
    }

    verificarLogin() {
        // DESCOMENTE A LINHA ABAIXO PARA FORÇAR SEMPRE MOSTRAR TELA DE LOGIN
        // localStorage.removeItem('usuarioLogado');
        
        const usuarioSalvo = localStorage.getItem('usuarioLogado');
        
        if (usuarioSalvo) {
            try {
                this.usuarioLogado = JSON.parse(usuarioSalvo);
                
                // Aguarda o DOM estar totalmente carregado
                requestAnimationFrame(() => {
                    this.app.showScreen('dashboardScreen');
                    this.configurarPermissoes();
                    console.log('✅ Usuário já logado:', this.usuarioLogado.nome);
                });
            } catch (error) {
                console.error('Erro ao recuperar usuário:', error);
                localStorage.removeItem('usuarioLogado');
                this.app.showScreen('loginScreen');
            }
        } else {
            this.app.showScreen('loginScreen');
        }
    }

    async login() {
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value;
        
        if (!user || !pass) {
            mostrarToast('Preencha usuário e senha', 'warning');
            return;
        }

        setButtonLoading('login', true);

        try {
            const hashedPassword = await hashPassword(pass);
            const { data: usuarios, error } = await supabase
                .from('usuarios')
                .select('*')
                .eq('login', user)
                .eq('senha', hashedPassword)
                .limit(1);

            if (error) throw error;

            if (usuarios && usuarios.length > 0) {
                this.usuarioLogado = usuarios[0];
                
                // Salvar no localStorage
                localStorage.setItem('usuarioLogado', JSON.stringify(this.usuarioLogado));
                
                await supabase
                    .from('usuarios')
                    .update({ ultimo_acesso: new Date().toISOString() })
                    .eq('id', this.usuarioLogado.id);

                this.app.showScreen('dashboardScreen');
                mostrarToast(`Bem-vindo, ${this.usuarioLogado.nome}!`, 'sucesso');
                this.configurarPermissoes();

                setTimeout(async () => {
                    await dataInitializer.inicializarDados();
                    await this.app.produtos.carregar();
                    await this.app.mesas.carregar();
                }, 1000);
            } else {
                mostrarToast('Usuário ou senha incorretos!', 'error');
            }
        } catch (error) {
            console.error('❌ Erro no login:', error);
            mostrarToast('Erro ao fazer login', 'error');
        } finally {
            setButtonLoading('login', false);
        }
    }

    verificarPermissoes() {
        this.configurarPermissoes();
    }

    configurarPermissoes() {
        if (!this.usuarioLogado) return;
        
        const isAdmin = this.usuarioLogado.tipo === 'administrador';
        
        // Cards existentes
        const cardProdutos = document.querySelector('[onclick="app.showScreen(\'produtosScreen\')"]');
        const cardEstoque = document.querySelector('[onclick="app.showScreen(\'estoqueScreen\')"]');
        const cardRelatorios = document.querySelector('[onclick="app.showScreen(\'relatoriosScreen\')"]');
        const cardUsuarios = document.getElementById('cardUsuarios');
        
        // Cards financeiros
        const cardFornecedores = document.getElementById('cardFornecedores');
        const cardCompras = document.getElementById('cardCompras');
        const cardRelatorioFinanceiro = document.getElementById('cardRelatorioFinanceiro');
        
        if (cardProdutos) cardProdutos.style.display = isAdmin ? 'block' : 'none';
        if (cardEstoque) cardEstoque.style.display = isAdmin ? 'block' : 'none';
        if (cardRelatorios) cardRelatorios.style.display = isAdmin ? 'block' : 'none';
        if (cardUsuarios) cardUsuarios.style.display = isAdmin ? 'block' : 'none';
        if (cardFornecedores) cardFornecedores.style.display = isAdmin ? 'block' : 'none';
        if (cardCompras) cardCompras.style.display = isAdmin ? 'block' : 'none';
        if (cardRelatorioFinanceiro) cardRelatorioFinanceiro.style.display = isAdmin ? 'block' : 'none';
    }

    getUsuarioLogado() {
        return this.usuarioLogado;
    }
}
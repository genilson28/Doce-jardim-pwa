// ==================== MÓDULO DE AUTENTICAÇÃO ====================

import { supabase } from '../../config/supabase.js';
import { loginParaEmail } from '../../utils/loginEmail.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { dataInitializer } from '../../services/dataInitializer.js';

export class AuthModule {
    constructor(app) {
        this.app = app;
        this.usuarioLogado = null;
    }

    // Busca o cadastro (nome, tipo...) do usuário logado no Supabase Auth
    async carregarCadastro(authId) {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nome, login, tipo, ultimo_acesso')
            .eq('auth_id', authId)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async verificarLogin() {
        // A sessão de verdade é a do Supabase (fica guardada pelo próprio supabase-js
        // e funciona offline). O "usuarioLogado" no localStorage é só para exibir
        // nome/tipo na tela; sozinho ele não dá acesso a nenhum dado.
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                localStorage.removeItem('usuarioLogado');
                this.usuarioLogado = null;
                this.app.showScreen('loginScreen');
                return;
            }

            let usuario = null;
            try {
                usuario = await this.carregarCadastro(session.user.id);
            } catch (e) {
                // Sem internet: usa o cadastro guardado, se for do mesmo login
                const salvo = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
                if (salvo && salvo.auth_id === session.user.id) usuario = salvo;
            }

            if (!usuario) {
                await supabase.auth.signOut();
                localStorage.removeItem('usuarioLogado');
                this.app.showScreen('loginScreen');
                return;
            }

            this.usuarioLogado = { ...usuario, auth_id: session.user.id };
            localStorage.setItem('usuarioLogado', JSON.stringify(this.usuarioLogado));

            requestAnimationFrame(() => {
                this.app.showScreen(this.app.telaInicialSolicitada || 'dashboardScreen');
                this.configurarPermissoes();
                console.log('✅ Usuário já logado:', this.usuarioLogado.nome);
            });
        } catch (error) {
            console.error('Erro ao verificar login:', error);
            localStorage.removeItem('usuarioLogado');
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
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginParaEmail(user),
                password: pass
            });

            if (error) {
                if (/invalid login credentials/i.test(error.message)) {
                    mostrarToast('Usuário ou senha incorretos!', 'error');
                } else {
                    mostrarToast('Erro ao fazer login: ' + error.message, 'error');
                }
                return;
            }

            const usuario = await this.carregarCadastro(data.user.id);
            if (!usuario) {
                await supabase.auth.signOut();
                mostrarToast('Usuário sem cadastro no sistema. Fale com o administrador.', 'error');
                return;
            }

            this.usuarioLogado = { ...usuario, auth_id: data.user.id };
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
        } catch (error) {
            console.error('❌ Erro no login:', error);
            mostrarToast('Erro ao fazer login', 'error');
        } finally {
            setButtonLoading('login', false);
        }
    }

    async sair() {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn('Erro ao sair:', e);
        }
        localStorage.removeItem('usuarioLogado');
        this.usuarioLogado = null;
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
        const cardClientes = document.getElementById('cardClientes');
        const cardDizimo = document.getElementById('cardDizimo');

        if (cardProdutos) cardProdutos.style.display = isAdmin ? 'block' : 'none';
        if (cardEstoque) cardEstoque.style.display = isAdmin ? 'block' : 'none';
        if (cardRelatorios) cardRelatorios.style.display = isAdmin ? 'block' : 'none';
        if (cardUsuarios) cardUsuarios.style.display = isAdmin ? 'block' : 'none';
        if (cardFornecedores) cardFornecedores.style.display = isAdmin ? 'block' : 'none';
        if (cardCompras) cardCompras.style.display = isAdmin ? 'block' : 'none';
        if (cardRelatorioFinanceiro) cardRelatorioFinanceiro.style.display = isAdmin ? 'block' : 'none';
        if (cardClientes) cardClientes.style.display = isAdmin ? 'block' : 'none';
        if (cardDizimo) cardDizimo.style.display = isAdmin ? 'block' : 'none';
    }

    getUsuarioLogado() {
        return this.usuarioLogado;
    }
}
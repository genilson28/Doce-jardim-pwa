// ==================== MÓDULO DE USUÁRIOS ====================

import { supabase } from '../../config/supabase.js';
import { handleSupabaseError } from '../../utils/security.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';


// Tudo que mexe em login/senha passa pela Edge Function admin-usuarios
async function adminUsuarios(action, dados = {}) {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', {
        body: { action, ...dados }
    });
    if (error) {
        let msg = error.message;
        try {
            const corpo = await error.context?.json?.();
            if (corpo?.error) msg = corpo.error;
        } catch (_) { /* mantém a mensagem padrão */ }
        throw new Error(msg);
    }
    if (!data?.success) throw new Error(data?.error || 'Erro desconhecido');
    return data;
}

export class UsuariosModule {
    constructor(app) {
        this.app = app;
        this.usuarios = [];
    }

    async carregar() {
        try {
            const { data, error } = await supabase
                .from('usuarios')
                .select('*')
                .order('id');
            
            if (error) throw error;
            this.usuarios = data || [];
            return this.usuarios;
        } catch (error) {
            console.error('❌ Erro ao carregar usuários:', error);
            return [];
        }
    }

    async listar() {
        await this.carregar();
        this.app.pagination.setup(this.usuarios, 5);
        
        const inputPesquisa = document.getElementById('pesquisaUsuario');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarPagina();
    }

    pesquisar() {
        const termoPesquisa = document.getElementById('pesquisaUsuario').value.toLowerCase().trim();
        this.app.pagination.currentPage = 1;
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.usuarios,
            termoPesquisa,
            'todas'
        );
        this.renderizarPagina();
    }

    renderizarPagina() {
        const lista = document.getElementById('listaUsuarios');
        if (!lista) return;
        
        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum usuário encontrado</div>';
            this.app.pagination.renderPaginationControls('paginacaoUsuarios', this.renderizarPagina.bind(this));
            return;
        }
        
        lista.innerHTML = '';
        
        this.app.pagination.getPageItems().forEach(usuario => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            
            const icone = usuario.tipo === 'administrador' ? '👑' : '👤';
            const tipoTexto = usuario.tipo === 'administrador' ? 'Administrador' : 'Usuário Normal';
            const ultimoAcesso = usuario.ultimo_acesso ? 
                formatarDataHoraCorreta(usuario.ultimo_acesso) : 'Nunca acessou';
            
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>${icone} ${usuario.nome}</h4>
                    <p><strong>Login:</strong> ${usuario.login} | <strong>Tipo:</strong> ${tipoTexto}</p>
                    <p style="font-size: 0.85em; color: #999;"><strong>Último acesso:</strong> ${ultimoAcesso}</p>
                    ${usuario.auth_id ? '' : '<p style="font-size: 0.85em; color: #d97706;"><strong>⚠️ Sem senha definida:</strong> clique em Editar e defina uma senha para liberar o acesso.</p>'}
                </div>
                <div>
                    <button onclick="app.usuarios.editar(${usuario.id})">✏️ Editar</button>
                    <button onclick="app.usuarios.excluir(${usuario.id})">🗑️ Excluir</button>
                    <button onclick="app.usuarios.verLogs(${usuario.id})">📊 Logs</button>
                </div>
            `;
            
            lista.appendChild(div);
        });
        
        this.app.pagination.renderPaginationControls('paginacaoUsuarios', this.renderizarPagina.bind(this));
    }

    async adicionar() {
        setButtonLoading('adicionarUsuario', true, 'Adicionar Usuário');
        
        try {
            const nome = document.getElementById('usuarioNome').value.trim();
            const login = document.getElementById('usuarioLogin').value.trim();
            const senha = document.getElementById('usuarioSenha').value;
            const tipo = document.getElementById('usuarioTipo').value;
            
            if (!nome || !login || !senha || !tipo) {
                mostrarToast('Preencha todos os campos!', 'warning');
                return;
            }
            
            if (senha.length < 6) {
                mostrarToast('A senha deve ter no mínimo 6 caracteres', 'warning');
                return;
            }

            await adminUsuarios('criar', { nome, login, senha, tipo });
            
            document.getElementById('usuarioNome').value = '';
            document.getElementById('usuarioLogin').value = '';
            document.getElementById('usuarioSenha').value = '';
            document.getElementById('usuarioTipo').value = '';
            
            await this.listar();
            mostrarToast(`Usuário "${nome}" adicionado com sucesso!`, 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao adicionar usuário:', error);
            mostrarToast(error.message || handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('adicionarUsuario', false, 'Adicionar Usuário');
        }
    }

    editar(usuarioId) {
        const usuario = this.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        document.getElementById('editUsuarioId').value = usuario.id;
        document.getElementById('editUsuarioNome').value = usuario.nome;
        document.getElementById('editUsuarioLogin').value = usuario.login;
        document.getElementById('editUsuarioSenha').value = '';
        document.getElementById('editUsuarioTipo').value = usuario.tipo;
        
        const modal = document.getElementById('modalEditarUsuario');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async salvarEdicao() {
        const id = parseInt(document.getElementById('editUsuarioId').value);
        const nome = document.getElementById('editUsuarioNome').value.trim();
        const login = document.getElementById('editUsuarioLogin').value.trim();
        const senha = document.getElementById('editUsuarioSenha').value;
        const tipo = document.getElementById('editUsuarioTipo').value;
        
        if (!nome || !login || !tipo) {
            mostrarToast('Preencha todos os campos obrigatórios!', 'warning');
            return;
        }
        
        try {
            if (senha.trim() !== '' && senha.length < 6) {
                mostrarToast('A senha deve ter no mínimo 6 caracteres', 'warning');
                return;
            }

            await adminUsuarios('editar', {
                id, nome, login, tipo,
                senha: senha.trim() !== '' ? senha : undefined
            });
            
            await this.listar();
            this.fecharModalEdicao();
            mostrarToast('Usuário atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            mostrarToast(error.message || handleSupabaseError(error), 'error');
        }
    }

    fecharModalEdicao() {
        const modal = document.getElementById('modalEditarUsuario');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async excluir(usuarioId) {
        const usuario = this.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        const usuarioLogado = this.app.auth.getUsuarioLogado();
        if (usuarioLogado && usuarioLogado.id === usuarioId) {
            mostrarToast('Você não pode excluir seu próprio usuário!', 'error');
            return;
        }
        
        if (!confirm(`Deseja excluir "${usuario.nome}"?`)) return;
        
        try {
            await adminUsuarios('excluir', { id: usuarioId });
            
            await this.listar();
            mostrarToast('Usuário excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            mostrarToast(error.message || handleSupabaseError(error), 'error');
        }
    }

    async verLogs(usuarioId) {
        const usuario = this.usuarios.find(u => u.id === usuarioId);
        if (!usuario) return;
        
        try {
            const { data: vendas, error } = await supabase
                .from('vendas')
                .select('*')
                .eq('usuario_id', usuarioId)
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            const vendasValidas = vendas.filter(v => !v.cancelada);
            const totalVendas = vendasValidas.length;
            const totalValor = vendasValidas.reduce((sum, v) => sum + (v.total || 0), 0);
            
            let mensagem = `📊 LOGS DE VENDAS - ${usuario.nome}\n\n`;
            mensagem += `Total de vendas: ${totalVendas}\n`;
            mensagem += `Valor total: R$ ${totalValor.toFixed(2)}\n`;
            
            if (usuario.ultimo_acesso) {
                const ultimoAcesso = formatarDataHoraCorreta(usuario.ultimo_acesso);
                mensagem += `Último acesso: ${ultimoAcesso}\n`;
            }
            
            mensagem += '\n';
            
            if (vendas.length > 0) {
                mensagem += '───────────────────────\nÚLTIMAS 10 VENDAS:\n───────────────────────\n\n';
                
                vendas.slice(0, 10).forEach((venda, index) => {
                    const dataFormatada = venda.data_exibicao || 
                        new Date(venda.data).toLocaleString('pt-BR');
                    const tipo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                    
                    mensagem += `${index + 1}. ${dataFormatada}\n`;
                    mensagem += `${tipo} - R$ ${venda.total?.toFixed(2) || '0.00'}\n`;
                    mensagem += `Pagamento: ${venda.forma_pagamento}\n\n`;
                });
            } else {
                mensagem += 'Nenhuma venda registrada ainda.';
            }
            
            alert(mensagem);
        } catch (error) {
            console.error('❌ Erro ao buscar logs:', error);
            mostrarToast('Erro ao buscar logs', 'error');
        }
    }

    getUsuarios() {
        return this.usuarios;
    }
}
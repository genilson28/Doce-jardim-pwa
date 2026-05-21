// ==================== MÓDULO FORNECEDORES ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';

export class FornecedoresModule {
    constructor(app) {
        this.app = app;
        this.fornecedores = [];
    }

    async carregar() {
        try {
            const { data, error } = await supabase
                .from('fornecedores')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            this.fornecedores = data || [];
            return this.fornecedores;
        } catch (error) {
            console.error('❌ Erro ao carregar fornecedores:', error);
            return [];
        }
    }

    async listar() {
        await this.carregar();
        this.app.pagination.setup(this.fornecedores, 10);
        
        const inputPesquisa = document.getElementById('pesquisaFornecedor');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizar();
    }

    pesquisar() {
        const termoPesquisa = document.getElementById('pesquisaFornecedor').value.toLowerCase().trim();
        this.app.pagination.currentPage = 1;
        this.app.pagination.filteredData = this.fornecedores.filter(f => 
            f.nome.toLowerCase().includes(termoPesquisa) ||
            (f.cnpj && f.cnpj.includes(termoPesquisa))
        );
        this.renderizar();
    }

    renderizar() {
        const lista = document.getElementById('listaFornecedores');
        if (!lista) return;

        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum fornecedor encontrado</div>';
            this.app.pagination.renderPaginationControls('paginacaoFornecedores', this.renderizar.bind(this));
            return;
        }

        lista.innerHTML = '';
        this.app.pagination.getPageItems().forEach(fornecedor => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            
            const statusBadge = fornecedor.ativo 
                ? '<span style="color: green;">✓ Ativo</span>' 
                : '<span style="color: red;">✗ Inativo</span>';
            
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>🏢 ${fornecedor.nome} ${statusBadge}</h4>
                    <p><strong>CNPJ:</strong> ${fornecedor.cnpj || 'Não informado'}</p>
                    <p><strong>Contato:</strong> ${fornecedor.contato || 'Não informado'}</p>
                    ${fornecedor.endereco ? `<p><strong>Endereço:</strong> ${fornecedor.endereco}</p>` : ''}
                    ${fornecedor.observacoes ? `<p><strong>Obs:</strong> ${fornecedor.observacoes}</p>` : ''}
                </div>
                <div>
                    <button onclick="app.fornecedores.editar(${fornecedor.id})">✏️ Editar</button>
                    <button onclick="app.fornecedores.excluir(${fornecedor.id})">🗑️ Excluir</button>
                </div>
            `;
            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoFornecedores', this.renderizar.bind(this));
    }

    async adicionar() {
        const nome = document.getElementById('fornecedorNome').value.trim();
        const contato = document.getElementById('fornecedorContato').value.trim();
        const cnpj = document.getElementById('fornecedorCNPJ').value.trim();
        const endereco = document.getElementById('fornecedorEndereco').value.trim();
        const observacoes = document.getElementById('fornecedorObservacoes').value.trim();

        if (!nome) {
            mostrarToast('Informe o nome do fornecedor!', 'warning');
            return;
        }

        setButtonLoading('adicionarFornecedor', true);

        try {
            const { error } = await supabase.from('fornecedores').insert([{
                nome,
                contato,
                cnpj,
                endereco,
                observacoes,
                ativo: true
            }]);

            if (error) throw error;

            document.getElementById('fornecedorNome').value = '';
            document.getElementById('fornecedorContato').value = '';
            document.getElementById('fornecedorCNPJ').value = '';
            document.getElementById('fornecedorEndereco').value = '';
            document.getElementById('fornecedorObservacoes').value = '';

            await this.listar();
            mostrarToast('Fornecedor adicionado com sucesso!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao adicionar fornecedor:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('adicionarFornecedor', false);
        }
    }

    editar(fornecedorId) {
        const fornecedor = this.fornecedores.find(f => f.id === fornecedorId);
        if (!fornecedor) return;

        document.getElementById('editFornecedorId').value = fornecedor.id;
        document.getElementById('editFornecedorNome').value = fornecedor.nome;
        document.getElementById('editFornecedorContato').value = fornecedor.contato || '';
        document.getElementById('editFornecedorCNPJ').value = fornecedor.cnpj || '';
        document.getElementById('editFornecedorEndereco').value = fornecedor.endereco || '';
        document.getElementById('editFornecedorObservacoes').value = fornecedor.observacoes || '';
        document.getElementById('editFornecedorAtivo').checked = fornecedor.ativo;

        const modal = document.getElementById('modalEditarFornecedor');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async salvarEdicao() {
        const id = parseInt(document.getElementById('editFornecedorId').value);
        const nome = document.getElementById('editFornecedorNome').value.trim();
        const contato = document.getElementById('editFornecedorContato').value.trim();
        const cnpj = document.getElementById('editFornecedorCNPJ').value.trim();
        const endereco = document.getElementById('editFornecedorEndereco').value.trim();
        const observacoes = document.getElementById('editFornecedorObservacoes').value.trim();
        const ativo = document.getElementById('editFornecedorAtivo').checked;

        if (!nome) {
            mostrarToast('Informe o nome do fornecedor!', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('fornecedores').update({
                nome, contato, cnpj, endereco, observacoes, ativo
            }).eq('id', id);

            if (error) throw error;

            await this.listar();
            this.fecharModalEdicao();
            mostrarToast('Fornecedor atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar fornecedor:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    fecharModalEdicao() {
        const modal = document.getElementById('modalEditarFornecedor');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async excluir(fornecedorId) {
        const fornecedor = this.fornecedores.find(f => f.id === fornecedorId);
        if (!fornecedor) return;

        if (!confirm(`Deseja excluir o fornecedor "${fornecedor.nome}"?`)) return;

        try {
            const { error } = await supabase.from('fornecedores').delete().eq('id', fornecedorId);
            if (error) throw error;

            await this.listar();
            mostrarToast('Fornecedor excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir fornecedor:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    getFornecedoresAtivos() {
        return this.fornecedores.filter(f => f.ativo);
    }
}
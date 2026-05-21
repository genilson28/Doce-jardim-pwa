// ==================== MÓDULO DE PRODUTOS ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading, handleSupabaseError } from '../../utils/ui.js';
import { formatarMoeda } from '../../utils/formatters.js';
import { offlineDB } from '../../services/offlineDB.js';
import { connectionService } from '../../services/connectionService.js';

export class ProdutosModule {
    constructor(app) {
        this.app = app;
        this.produtos = [];
    }

    async carregar() {
        try {
            let data;
            
            if (connectionService.getStatus()) {
                const { data: onlineData, error } = await supabase
                    .from('produto')
                    .select('*')
                    .order('id');
                
                if (error) throw error;
                data = onlineData;
                
                if (!data || data.length === 0) {
                    await dataInitializer.criarProdutosIniciais();
                    return this.carregar();
                }
                
                await offlineDB.salvarCacheProdutos(data || []);
            } else {
                data = await offlineDB.obterCacheProdutos();
            }
            
            this.produtos = data || [];
            return this.produtos;
        } catch (error) {
            console.error('❌ Erro ao carregar produtos:', error);
            const cacheData = await offlineDB.obterCacheProdutos();
            this.produtos = cacheData;
            return this.produtos;
        }
    }

    async listar() {
        await this.carregar();
        this.app.pagination.setup(this.produtos, 5);
        
        const inputPesquisa = document.getElementById('pesquisaProduto');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarPagina();
    }

    pesquisar() {
        const termoPesquisa = document.getElementById('pesquisaProduto').value.toLowerCase().trim();
        this.app.pagination.currentPage = 1;
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.produtos, 
            termoPesquisa, 
            'todas'
        );
        this.renderizarPagina();
    }

    renderizarPagina() {
        const lista = document.getElementById('listaProdutos');
        if (!lista) return;
        
        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            this.app.pagination.renderPaginationControls('paginacaoProdutos', this.renderizarPagina.bind(this));
            return;
        }
        
        lista.innerHTML = '';
        
        this.app.pagination.getPageItems().forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>${produto.nome}</h4>
                    <p>Preço: R$ ${produto.preco?.toFixed(2)} | Estoque: ${produto.estoque} | Categoria: ${produto.categoria}</p>
                </div>
                <div>
                    <button onclick="app.produtos.editar(${produto.id})">✏️ Editar</button>
                    <button onclick="app.produtos.excluir(${produto.id})">🗑️ Excluir</button>
                </div>
            `;
            lista.appendChild(div);
        });
        
        this.app.pagination.renderPaginationControls('paginacaoProdutos', this.renderizarPagina.bind(this));
    }

    async adicionar() {
        const nome = document.getElementById('produtoNome').value.trim();
        const preco = parseFloat(document.getElementById('produtoPreco').value);
        const estoque = parseInt(document.getElementById('produtoEstoque').value);
        const categoria = document.getElementById('produtoCategoria').value;
        
        if (!nome || !preco || isNaN(estoque) || !categoria) {
            mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }

        setButtonLoading('adicionarProduto', true, 'Adicionar Produto');

        try {
            const { error } = await supabase.from('produto').insert([{
                nome, preco, estoque, categoria
            }]);
            
            if (error) throw error;
            
            document.getElementById('produtoNome').value = '';
            document.getElementById('produtoPreco').value = '';
            document.getElementById('produtoEstoque').value = '';
            document.getElementById('produtoCategoria').value = '';
            
            await this.carregar();
            await this.listar();
            
            mostrarToast('Produto adicionado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao adicionar produto:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('adicionarProduto', false, 'Adicionar Produto');
        }
    }

    editar(produtoId) {
        const produto = this.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        document.getElementById('editProdutoId').value = produto.id;
        document.getElementById('editProdutoNome').value = produto.nome;
        document.getElementById('editProdutoPreco').value = produto.preco;
        document.getElementById('editProdutoEstoque').value = produto.estoque;
        document.getElementById('editProdutoCategoria').value = produto.categoria;
        
        const modal = document.getElementById('modalEditarProduto');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async salvarEdicao() {
        const id = parseInt(document.getElementById('editProdutoId').value);
        const nome = document.getElementById('editProdutoNome').value.trim();
        const preco = parseFloat(document.getElementById('editProdutoPreco').value);
        const estoque = parseInt(document.getElementById('editProdutoEstoque').value);
        const categoria = document.getElementById('editProdutoCategoria').value;
        
        if (!nome || !preco || isNaN(estoque) || !categoria) {
            mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('produto').update({
                nome, preco, estoque, categoria
            }).eq('id', id);
            
            if (error) throw error;
            
            await this.carregar();
            await this.listar();
            this.fecharModalEdicao();
            
            mostrarToast('Produto atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    fecharModalEdicao() {
        const modal = document.getElementById('modalEditarProduto');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async excluir(produtoId) {
        const produto = this.produtos.find(p => p.id === produtoId);
        if (!produto) return;
        
        if (!confirm(`Deseja excluir "${produto.nome}"?`)) return;

        try {
            const { error } = await supabase.from('produto').delete().eq('id', produtoId);
            if (error) throw error;
            
            await this.carregar();
            await this.listar();
            
            mostrarToast('Produto excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    async atualizar(produto) {
        try {
            if (!connectionService.getStatus()) return true;
            
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
    }

    getProdutos() {
        return this.produtos;
    }
}

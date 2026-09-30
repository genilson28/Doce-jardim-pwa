// ==================== MÓDULO DE PRODUTOS ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading, handleSupabaseError } from '../../utils/ui.js';
import { formatarMoeda } from '../../utils/formatters.js';
import { offlineDB } from '../../services/offlineDB.js';
import { connectionService } from '../../services/connectionService.js';
import { dataInitializer } from '../../services/dataInitializer.js';

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
                
                // Cadastra os produtos de exemplo no máximo 1 vez (evita laço infinito)
                if ((!data || data.length === 0) && !this._seedTentado) {
                    this._seedTentado = true;
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
        
        this.preencherSelectBase('produtoBase');
        this.alternarCampoEstoque('');
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
                    <p>Preço: R$ ${produto.preco?.toFixed(2)}${parseFloat(produto.preco_com_leite) > 0 ? ` (c/ leite R$ ${parseFloat(produto.preco_com_leite).toFixed(2)})` : ''} | ${this.descricaoEstoque(produto)} | Categoria: ${produto.categoria}</p>
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
        const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
        const categoria = document.getElementById('produtoCategoria').value;
        const vinculo = this.lerVinculo('');
        vinculo.preco_com_leite = parseFloat(document.getElementById('produtoPrecoLeite').value) || null;
        const estoque = vinculo.produto_base_id ? 0 : parseInt(document.getElementById('produtoEstoque').value);
        
        // Item só de estoque (polpa) pode ficar sem preço de venda
        if (!nome || (!preco && !vinculo.somente_estoque) || isNaN(estoque) || !categoria) {
            mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }

        setButtonLoading('adicionarProduto', true, 'Adicionar Produto');

        try {
            const { error } = await supabase.from('produto').insert([{
                nome, preco, estoque, categoria, ...vinculo
            }]);
            
            if (error) throw error;
            
            document.getElementById('produtoNome').value = '';
            document.getElementById('produtoPreco').value = '';
            document.getElementById('produtoEstoque').value = '';
            document.getElementById('produtoCategoria').value = '';
            document.getElementById('produtoBase').value = '';
            document.getElementById('produtoQtdBase').value = '1';
            document.getElementById('produtoPrecoLeite').value = '';
            document.getElementById('produtoSomenteEstoque').checked = false;
            
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
        this.preencherSelectBase('editProdutoBase', produto.id);
        document.getElementById('editProdutoBase').value = produto.produto_base_id || '';
        document.getElementById('editProdutoQtdBase').value = produto.qtd_base || 1;
        document.getElementById('editProdutoPrecoLeite').value = produto.preco_com_leite || '';
        document.getElementById('editProdutoSomenteEstoque').checked = !!produto.somente_estoque;
        this.alternarCampoEstoque('edit');
        
        const modal = document.getElementById('modalEditarProduto');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async salvarEdicao() {
        const id = parseInt(document.getElementById('editProdutoId').value);
        const nome = document.getElementById('editProdutoNome').value.trim();
        const preco = parseFloat(document.getElementById('editProdutoPreco').value) || 0;
        const categoria = document.getElementById('editProdutoCategoria').value;
        const vinculo = this.lerVinculo('edit');
        vinculo.preco_com_leite = parseFloat(document.getElementById('editProdutoPrecoLeite').value) || null;
        const estoque = vinculo.produto_base_id ? 0 : parseInt(document.getElementById('editProdutoEstoque').value);
        
        // Item só de estoque (polpa) pode ficar sem preço de venda
        if (!nome || (!preco && !vinculo.somente_estoque) || isNaN(estoque) || !categoria) {
            mostrarToast('Preencha todos os campos!', 'warning');
            return;
        }

        if (vinculo.produto_base_id && this.produtos.some(p => p.produto_base_id === id)) {
            mostrarToast('Outros produtos baixam o estoque deste. Ele não pode baixar de outro.', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('produto').update({
                nome, preco, estoque, categoria, ...vinculo
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
        
        const dependentes = this.produtos.filter(p => p.produto_base_id === produtoId);
        if (dependentes.length > 0) {
            mostrarToast(`Não dá para excluir: ${dependentes.map(p => p.nome).join(', ')} baixa(m) o estoque deste produto.`, 'warning');
            return;
        }

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

    // ==================== ESTOQUE COMPARTILHADO ====================
    // Um produto de venda pode baixar o estoque de outro (ex.: "Suco de Acerola"
    // e "Suco de Acerola com Leite" baixam de "Polpa de Acerola").
    // produto_base_id = de quem baixa | qtd_base = quanto baixa por unidade vendida
    // somente_estoque = item só de estoque (a polpa), não aparece no PDV/mesas

    getProdutoBase(produto) {
        if (!produto?.produto_base_id) return null;
        return this.produtos.find(p => p.id === produto.produto_base_id) || null;
    }

    fatorBaixa(produto) {
        const fator = parseInt(produto?.qtd_base);
        return fator > 0 ? fator : 1;
    }

    // Produtos que aparecem no PDV e nas mesas
    getProdutosVenda() {
        return this.produtos.filter(p => !p.somente_estoque);
    }

    // Opções de preço do produto (ex.: suco sem leite / com leite)
    opcoesPreco(produto) {
        const opcoes = [{ rotulo: 'Sem leite', preco: produto.preco || 0, com_leite: false }];
        if (parseFloat(produto.preco_com_leite) > 0) {
            opcoes.push({ rotulo: 'Com leite', preco: parseFloat(produto.preco_com_leite), com_leite: true });
        }
        return opcoes;
    }

    textoPreco(produto) {
        return this.opcoesPreco(produto).map(o => (o.preco || 0).toFixed(2)).join(' / ');
    }

    // Janela para escolher sem leite / com leite
    escolherOpcao(produto, aoEscolher) {
        const opcoes = this.opcoesPreco(produto);
        document.getElementById('modalOpcaoPreco')?.remove();
        const modal = document.createElement('div');
        modal.id = 'modalOpcaoPreco';
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <span class="modal-close" aria-label="Fechar">×</span>
                <h3 style="margin-bottom:12px;">${produto.nome}</h3>
                ${opcoes.map((o, i) => `
                    <button class="btn-primary" data-i="${i}"
                        style="display:flex;justify-content:space-between;width:100%;margin:6px 0;padding:14px 16px;font-size:1rem;">
                        <span>${o.rotulo}</span><strong>R$ ${o.preco.toFixed(2)}</strong>
                    </button>`).join('')}
            </div>`;
        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) return fechar();
            const btn = e.target.closest('button[data-i]');
            if (btn) { fechar(); aoEscolher(opcoes[Number(btn.dataset.i)]); }
        });
        document.body.appendChild(modal);
    }

    // Produtos que têm estoque próprio (entram em compras e na tela de estoque)
    getProdutosComEstoque() {
        return this.produtos.filter(p => !p.produto_base_id);
    }

    // Quantas unidades deste produto dá para vender com o estoque atual
    estoqueDisponivel(produto) {
        const base = this.getProdutoBase(produto);
        if (!base) return produto?.estoque || 0;
        return Math.floor((base.estoque || 0) / this.fatorBaixa(produto));
    }

    descricaoEstoque(produto) {
        const base = this.getProdutoBase(produto);
        if (!base) return `Estoque: ${produto.estoque}${produto.somente_estoque ? ' (só estoque)' : ''}`;
        const fator = this.fatorBaixa(produto);
        return `Baixa ${fator > 1 ? fator + 'x ' : ''}de: ${base.nome} (${this.estoqueDisponivel(produto)} disp.)`;
    }

    // Custo de 1 unidade vendida (produto vinculado usa o custo da base)
    custoUnitario(produto) {
        const base = this.getProdutoBase(produto);
        if (base) return (base.custo_unitario || 0) * this.fatorBaixa(produto);
        return produto?.custo_unitario || 0;
    }

    // Converte itens vendidos em { idQueTemEstoque: quantidade }
    consumoDeEstoque(itens) {
        const consumo = {};
        for (const item of itens || []) {
            const produto = this.produtos.find(p => p.id === item.id);
            const base = this.getProdutoBase(produto);
            const id = base ? base.id : item.id;
            const qtd = (item.quantidade || 1) * (base ? this.fatorBaixa(produto) : 1);
            consumo[id] = (consumo[id] || 0) + qtd;
        }
        return consumo;
    }

    // Verifica se cabe mais 1 unidade do produto no carrinho, contando
    // os outros itens do carrinho que usam o mesmo estoque
    cabeNoCarrinho(carrinho, produtoId) {
        const simulado = [...(carrinho || []).map(i => ({ id: i.id, quantidade: i.quantidade })), { id: produtoId, quantidade: 1 }];
        const consumo = this.consumoDeEstoque(simulado);
        return Object.entries(consumo).every(([id, qtd]) => {
            const p = this.produtos.find(x => x.id === Number(id));
            return !p || qtd <= (p.estoque || 0);
        });
    }

    // Baixa (sinal -1) ou devolve (sinal +1) estoque no servidor e no aparelho
    async movimentarEstoque(itens, sinal = -1) {
        const consumo = this.consumoDeEstoque(itens);
        for (const [idTxt, qtd] of Object.entries(consumo)) {
            const id = Number(idTxt);
            try {
                const { data: atual, error } = await supabase
                    .from('produto').select('estoque').eq('id', id).single();
                if (error) throw error;
                const novo = Math.max(0, (atual?.estoque || 0) + sinal * qtd);
                const { error: errUpd } = await supabase.from('produto').update({ estoque: novo }).eq('id', id);
                if (errUpd) throw errUpd;
                const local = this.produtos.find(p => p.id === id);
                if (local) local.estoque = novo;
            } catch (e) {
                console.error(`Erro ao movimentar estoque do produto ${id}:`, e);
            }
        }
    }

    // Sem internet: baixa só no aparelho (o servidor é atualizado no envio)
    async baixarEstoqueLocal(itens) {
        const consumo = this.consumoDeEstoque(itens);
        for (const [idTxt, qtd] of Object.entries(consumo)) {
            const local = this.produtos.find(p => p.id === Number(idTxt));
            if (local) local.estoque = Math.max(0, (local.estoque || 0) - qtd);
        }
        await offlineDB.salvarCacheProdutos(this.produtos);
    }

    // ----- Formulário: "Baixa estoque de" -----
    preencherSelectBase(selectId, ignorarId = null) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const opcoes = this.produtos
            .filter(p => !p.produto_base_id && p.id !== ignorarId)
            .sort((a, b) => a.nome.localeCompare(b.nome));
        select.innerHTML = '<option value="">Estoque próprio</option>' +
            opcoes.map(p => `<option value="${p.id}">Baixa de: ${p.nome}</option>`).join('');
    }

    // prefixo '' = formulário novo | 'edit' = modal de edição
    alternarCampoEstoque(prefixo) {
        const id = (nome) => prefixo ? `edit${nome}` : nome.charAt(0).toLowerCase() + nome.slice(1);
        const base = document.getElementById(id('ProdutoBase'))?.value;
        const estoque = document.getElementById(id('ProdutoEstoque'));
        const qtd = document.getElementById(id('ProdutoQtdBase'));
        const somente = document.getElementById(id('ProdutoSomenteEstoqueLabel'));
        if (estoque) estoque.style.display = base ? 'none' : '';
        if (qtd) qtd.style.display = base ? '' : 'none';
        if (somente) somente.style.display = base ? 'none' : '';
    }

    lerVinculo(prefixo) {
        const id = (nome) => prefixo ? `edit${nome}` : nome.charAt(0).toLowerCase() + nome.slice(1);
        const baseId = parseInt(document.getElementById(id('ProdutoBase'))?.value) || null;
        const qtd = parseInt(document.getElementById(id('ProdutoQtdBase'))?.value);
        return {
            produto_base_id: baseId,
            qtd_base: baseId ? (qtd > 0 ? qtd : 1) : 1,
            somente_estoque: baseId ? false : !!document.getElementById(id('ProdutoSomenteEstoque'))?.checked
        };
    }

    getProdutos() {
        return this.produtos;
    }
}

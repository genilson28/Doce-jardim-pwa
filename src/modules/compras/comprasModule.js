// ==================== MÓDULO COMPRAS COM SELECT PESQUISÁVEL ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
        this.fornecedorSelecionado = null;
        this.produtoSelecionado = null;
    }

    async carregar() {
        try {
            const { data, error } = await supabase
                .from('compras')
                .select('*')
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            this.compras = (data || []).map(compra => ({
                ...compra,
                data_exibicao: formatarDataHoraCorreta(compra.data)
            }));
            
            return this.compras;
        } catch (error) {
            console.error('❌ Erro ao carregar compras:', error);
            return [];
        }
    }

    async carregarItens(compraId) {
        try {
            const { data, error } = await supabase
                .from('compras_itens')
                .select('*')
                .eq('compra_id', compraId);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('❌ Erro ao carregar itens da compra:', error);
            return [];
        }
    }

    async listar() {
        await this.carregar();
        await this.app.fornecedores.carregar();
        
        this.app.pagination.setup(this.compras, 10);
        this.renderizar();
        this.inicializarSelectFornecedor();
        this.popularSelectProdutos();
    }

    renderizar() {
        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma compra registrada</div>';
            this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
            return;
        }

        lista.innerHTML = '';
        this.app.pagination.getPageItems().forEach(compra => {
            const div = document.createElement('div');
            div.className = 'venda-item';
            
            div.innerHTML = `
                <div class="venda-item-header">
                    <strong>📦 ${compra.data_exibicao}</strong>
                    <strong class="valor-venda">R$ ${compra.valor_total.toFixed(2)}</strong>
                </div>
                <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                ${compra.usuario_nome ? `<p><strong>Registrado por:</strong> ${compra.usuario_nome}</p>` : ''}
                ${compra.observacoes ? `<p><strong>Observações:</strong> ${compra.observacoes}</p>` : ''}
                <button onclick="app.compras.verDetalhes(${compra.id})" style="margin-top: 10px;">📋 Ver Detalhes</button>
                <button onclick="app.compras.excluir(${compra.id})" style="margin-top: 10px; background: #f44336;">🗑️ Excluir</button>
            `;
            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
    }

    inicializarSelectFornecedor() {
        const selectOriginal = document.getElementById('compraFornecedor');
        if (!selectOriginal) return;

        // Criar container para o novo componente
        const container = document.createElement('div');
        container.id = 'compraFornecedorContainer';
        
        // Substituir o select antigo
        selectOriginal.parentNode.replaceChild(container, selectOriginal);

        const fornecedoresAtivos = this.app.fornecedores.getFornecedoresAtivos();

        container.innerHTML = `
            <div class="select-pesquisavel">
                <div class="select-pesquisavel-header" id="selectFornecedorHeader">
                    <span id="fornecedorSelecionadoText">Selecione um fornecedor</span>
                    <span class="select-arrow">▼</span>
                </div>
                <div class="select-pesquisavel-dropdown" id="selectFornecedorDropdown" style="display: none;">
                    <div class="select-pesquisavel-search">
                        <input 
                            type="text" 
                            id="searchFornecedor" 
                            placeholder="🔍 Pesquisar fornecedor..."
                            autocomplete="off"
                        >
                    </div>
                    <div class="select-pesquisavel-list" id="listaFornecedores">
                        ${fornecedoresAtivos.map(f => `
                            <div class="select-pesquisavel-item" data-id="${f.id}" data-nome="${f.nome}">
                                <strong>${f.nome}</strong>
                                ${f.contato ? `<small>${f.contato}</small>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        this.configurarEventosSelectFornecedor();
    }

    configurarEventosSelectFornecedor() {
        const header = document.getElementById('selectFornecedorHeader');
        const dropdown = document.getElementById('selectFornecedorDropdown');
        const searchInput = document.getElementById('searchFornecedor');
        const lista = document.getElementById('listaFornecedores');

        if (!header || !dropdown || !searchInput || !lista) return;

        // Toggle dropdown
        header.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                setTimeout(() => searchInput.focus(), 100);
            }
        };

        // Pesquisa
        searchInput.oninput = (e) => {
            const termo = e.target.value.toLowerCase().trim();
            const itens = lista.querySelectorAll('.select-pesquisavel-item');
            
            itens.forEach(item => {
                const nome = item.dataset.nome.toLowerCase();
                item.style.display = nome.includes(termo) ? 'block' : 'none';
            });
        };

        // Prevenir fechar ao clicar no input
        searchInput.onclick = (e) => {
            e.stopPropagation();
        };

        // Seleção de fornecedor - DELEGAÇÃO DE EVENTOS
        lista.onclick = (e) => {
            e.stopPropagation();
            
            // Buscar o elemento clicado ou seu pai
            let item = e.target;
            if (!item.classList.contains('select-pesquisavel-item')) {
                item = item.closest('.select-pesquisavel-item');
            }
            
            if (!item) return;

            const fornecedorId = parseInt(item.dataset.id);
            const fornecedorNome = item.dataset.nome;

            this.fornecedorSelecionado = fornecedorId;
            document.getElementById('fornecedorSelecionadoText').textContent = fornecedorNome;
            
            // Marcar como selecionado
            lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.classList.remove('selected');
            });
            item.classList.add('selected');

            dropdown.style.display = 'none';
            searchInput.value = '';
            
            // Resetar visualização
            lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.style.display = 'block';
            });
        };

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#selectFornecedorDropdown') && !e.target.closest('#selectFornecedorHeader')) {
                dropdown.style.display = 'none';
            }
        }, { once: false });
    }

    popularSelectProdutos() {
        const selectOriginal = document.getElementById('compraProduto');
        if (!selectOriginal) return;

        // Criar container para o novo componente
        const container = document.createElement('div');
        container.id = 'compraProdutoContainer';
        
        // Substituir o select antigo
        selectOriginal.parentNode.replaceChild(container, selectOriginal);

        const produtos = this.app.produtos.getProdutos();

        container.innerHTML = `
            <div class="select-pesquisavel">
                <div class="select-pesquisavel-header" id="selectProdutoHeader">
                    <span id="produtoSelecionadoText">Selecione um produto</span>
                    <span class="select-arrow">▼</span>
                </div>
                <div class="select-pesquisavel-dropdown" id="selectProdutoDropdown" style="display: none;">
                    <div class="select-pesquisavel-search">
                        <input 
                            type="text" 
                            id="searchProduto" 
                            placeholder="🔍 Pesquisar produto..."
                            autocomplete="off"
                        >
                    </div>
                    <div class="select-pesquisavel-list" id="listaProdutosSelect">
                        ${produtos.map(p => `
                            <div class="select-pesquisavel-item" data-id="${p.id}" data-nome="${p.nome}">
                                <strong>${p.nome}</strong>
                                <small>Estoque: ${p.estoque} | R$ ${p.preco.toFixed(2)}</small>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        this.configurarEventosSelectProduto();
    }

    configurarEventosSelectProduto() {
        const header = document.getElementById('selectProdutoHeader');
        const dropdown = document.getElementById('selectProdutoDropdown');
        const searchInput = document.getElementById('searchProduto');
        const lista = document.getElementById('listaProdutosSelect');

        if (!header || !dropdown || !searchInput || !lista) return;

        // Toggle dropdown
        header.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                setTimeout(() => searchInput.focus(), 100);
            }
        };

        // Pesquisa
        searchInput.oninput = (e) => {
            const termo = e.target.value.toLowerCase().trim();
            const itens = lista.querySelectorAll('.select-pesquisavel-item');
            
            itens.forEach(item => {
                const nome = item.dataset.nome.toLowerCase();
                item.style.display = nome.includes(termo) ? 'block' : 'none';
            });
        };

        // Prevenir fechar ao clicar no input
        searchInput.onclick = (e) => {
            e.stopPropagation();
        };

        // Seleção de produto - DELEGAÇÃO DE EVENTOS
        lista.onclick = (e) => {
            e.stopPropagation();
            
            // Buscar o elemento clicado ou seu pai
            let item = e.target;
            if (!item.classList.contains('select-pesquisavel-item')) {
                item = item.closest('.select-pesquisavel-item');
            }
            
            if (!item) return;

            const produtoId = item.dataset.id;
            const produtoNome = item.dataset.nome;

            // Armazenar produto selecionado
            this.produtoSelecionado = produtoId;
            document.getElementById('produtoSelecionadoText').textContent = produtoNome;
            
            // Marcar como selecionado
            lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.classList.remove('selected');
            });
            item.classList.add('selected');

            dropdown.style.display = 'none';
            searchInput.value = '';
            
            // Resetar visualização
            lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.style.display = 'block';
            });
        };

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#selectProdutoDropdown') && !e.target.closest('#selectProdutoHeader')) {
                dropdown.style.display = 'none';
            }
        }, { once: false });
    }

    adicionarItem() {
        const produtoId = this.produtoSelecionado;
        const quantidade = parseInt(document.getElementById('compraQuantidade').value);
        const valorCusto = parseFloat(document.getElementById('compraValorCusto').value);
        const valorVenda = parseFloat(document.getElementById('compraValorVenda').value);

        if (!produtoId) {
            mostrarToast('Selecione um produto!', 'warning');
            return;
        }

        if (!quantidade || !valorCusto || !valorVenda) {
            mostrarToast('Preencha todos os campos do item!', 'warning');
            return;
        }

        if (quantidade <= 0 || valorCusto <= 0 || valorVenda <= 0) {
            mostrarToast('Valores devem ser maiores que zero!', 'warning');
            return;
        }

        const produto = this.app.produtos.getProdutos().find(p => p.id === parseInt(produtoId));
        if (!produto) return;

        const itemExistente = this.carrinho.find(item => item.produto_id === parseInt(produtoId));
        
        if (itemExistente) {
            itemExistente.quantidade += quantidade;
            itemExistente.total_custo = itemExistente.quantidade * itemExistente.valor_custo;
        } else {
            this.carrinho.push({
                produto_id: parseInt(produtoId),
                produto_nome: produto.nome,
                quantidade: quantidade,
                valor_custo: valorCusto,
                valor_venda: valorVenda,
                total_custo: quantidade * valorCusto
            });
        }

        // Resetar seleção
        this.produtoSelecionado = null;
        document.getElementById('produtoSelecionadoText').textContent = 'Selecione um produto';
        document.querySelectorAll('#listaProdutosSelect .select-pesquisavel-item').forEach(i => {
            i.classList.remove('selected');
        });
        
        document.getElementById('compraQuantidade').value = '1';
        document.getElementById('compraValorCusto').value = '';
        document.getElementById('compraValorVenda').value = '';

        this.atualizarCarrinho();
        mostrarToast('Item adicionado!', 'sucesso');
    }

    removerItem(produtoId) {
        const index = this.carrinho.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarCarrinho();
        }
    }

    atualizarCarrinho() {
        const lista = document.getElementById('itensCompraLista');
        if (!lista) return;

        if (this.carrinho.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum item adicionado</div>';
            document.getElementById('totalCompra').textContent = '0.00';
            return;
        }

        lista.innerHTML = '';
        let totalGeral = 0;

        this.carrinho.forEach(item => {
            totalGeral += item.total_custo;
            
            const margem = ((item.valor_venda - item.valor_custo) / item.valor_custo * 100).toFixed(1);
            
            const div = document.createElement('div');
            div.className = 'carrinho-item';
            div.innerHTML = `
                <div class="carrinho-item-info">
                    <h4>${item.produto_nome}</h4>
                    <p>Qtd: ${item.quantidade} | Custo: R$ ${item.valor_custo.toFixed(2)} | Venda: R$ ${item.valor_venda.toFixed(2)}</p>
                    <small style="color: ${margem > 0 ? 'green' : 'red'};">Margem: ${margem}%</small>
                </div>
                <div class="carrinho-item-acoes">
                    <span>R$ ${item.total_custo.toFixed(2)}</span>
                    <button onclick="app.compras.removerItem(${item.produto_id})">🗑️</button>
                </div>
            `;
            lista.appendChild(div);
        });

        document.getElementById('totalCompra').textContent = totalGeral.toFixed(2);
    }

    async finalizar() {
        if (!this.fornecedorSelecionado) {
            mostrarToast('Selecione um fornecedor!', 'warning');
            return;
        }

        if (this.carrinho.length === 0) {
            mostrarToast('Adicione ao menos um item!', 'warning');
            return;
        }

        setButtonLoading('finalizarCompra', true);

        try {
            const fornecedor = this.app.fornecedores.fornecedores.find(f => f.id === this.fornecedorSelecionado);
            const totalCompra = this.carrinho.reduce((sum, item) => sum + item.total_custo, 0);
            const usuarioLogado = this.app.auth.getUsuarioLogado();
            const observacoes = document.getElementById('compraObservacoes')?.value.trim() || '';

            const { data: compraData, error: compraError } = await supabase.from('compras').insert([{
                fornecedor_id: this.fornecedorSelecionado,
                fornecedor_nome: fornecedor.nome,
                valor_total: totalCompra,
                observacoes: observacoes,
                usuario_id: usuarioLogado?.id,
                usuario_nome: usuarioLogado?.nome,
                data: new Date().toISOString()
            }]).select();

            if (compraError) throw compraError;

            const compraId = compraData[0].id;

            const itensParaInserir = this.carrinho.map(item => ({
                compra_id: compraId,
                produto_id: item.produto_id,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade,
                valor_custo: item.valor_custo,
                valor_venda: item.valor_venda,
                total_custo: item.total_custo
            }));

            const { error: itensError } = await supabase.from('compras_itens').insert(itensParaInserir);
            if (itensError) throw itensError;

            for (const item of this.carrinho) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === item.produto_id);
                if (produto) {
                    const novoEstoque = produto.estoque + item.quantidade;
                    
                    await supabase.from('produto').update({
                        estoque: novoEstoque,
                        custo_unitario: item.valor_custo,
                        preco: item.valor_venda
                    }).eq('id', produto.id);
                }
            }

            this.carrinho = [];
            this.fornecedorSelecionado = null;
            this.atualizarCarrinho();
            document.getElementById('fornecedorSelecionadoText').textContent = 'Selecione um fornecedor';
            if (document.getElementById('compraObservacoes')) {
                document.getElementById('compraObservacoes').value = '';
            }

            // Resetar seleção visual
            document.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.classList.remove('selected');
            });

            await this.app.produtos.carregar();
            await this.listar();

            mostrarToast('Compra registrada com sucesso!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao registrar compra:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('finalizarCompra', false);
        }
    }

    async verDetalhes(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) return;

        const itens = await this.carregarItens(compraId);
        
        let mensagem = `📦 DETALHES DA COMPRA\n\n`;
        mensagem += `Data: ${compra.data_exibicao}\n`;
        mensagem += `Fornecedor: ${compra.fornecedor_nome}\n`;
        mensagem += `Total: R$ ${compra.valor_total.toFixed(2)}\n`;
        if (compra.observacoes) mensagem += `Observações: ${compra.observacoes}\n`;
        mensagem += `\n────────────────────────\nITENS:\n────────────────────────\n\n`;

        itens.forEach((item, index) => {
            const margem = ((item.valor_venda - item.valor_custo) / item.valor_custo * 100).toFixed(1);
            mensagem += `${index + 1}. ${item.produto_nome}\n`;
            mensagem += `   Qtd: ${item.quantidade} | Custo: R$ ${item.valor_custo.toFixed(2)} | Venda: R$ ${item.valor_venda.toFixed(2)}\n`;
            mensagem += `   Margem: ${margem}% | Total: R$ ${item.total_custo.toFixed(2)}\n\n`;
        });

        alert(mensagem);
    }

    async excluir(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) return;

        if (!confirm(`Deseja excluir esta compra de R$ ${compra.valor_total.toFixed(2)}?\nO estoque será ajustado.`)) return;

        try {
            const itens = await this.carregarItens(compraId);

            for (const item of itens) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === item.produto_id);
                if (produto) {
                    const novoEstoque = Math.max(0, produto.estoque - item.quantidade);
                    await supabase.from('produto').update({
                        estoque: novoEstoque
                    }).eq('id', produto.id);
                }
            }

            const { error } = await supabase.from('compras').delete().eq('id', compraId);
            if (error) throw error;

            await this.app.produtos.carregar();
            await this.listar();
            mostrarToast('Compra excluída e estoque ajustado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir compra:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

}

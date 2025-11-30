// ==================== MÓDULO COMPRAS ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
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
        this.popularSelectFornecedores();
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

    popularSelectFornecedores() {
        const select = document.getElementById('compraFornecedor');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione um fornecedor</option>';
        
        this.app.fornecedores.getFornecedoresAtivos().forEach(fornecedor => {
            const option = document.createElement('option');
            option.value = fornecedor.id;
            option.textContent = fornecedor.nome;
            select.appendChild(option);
        });
    }

    popularSelectProdutos() {
        const select = document.getElementById('compraProduto');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione um produto</option>';
        
        this.app.produtos.getProdutos().forEach(produto => {
            const option = document.createElement('option');
            option.value = produto.id;
            option.textContent = `${produto.nome} (Estoque: ${produto.estoque})`;
            select.appendChild(option);
        });
    }

    adicionarItem() {
        const produtoId = document.getElementById('compraProduto').value;
        const quantidade = parseInt(document.getElementById('compraQuantidade').value);
        const valorCusto = parseFloat(document.getElementById('compraValorCusto').value);
        const valorVenda = parseFloat(document.getElementById('compraValorVenda').value);

        if (!produtoId || !quantidade || !valorCusto || !valorVenda) {
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

        document.getElementById('compraProduto').value = '';
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
        const fornecedorId = document.getElementById('compraFornecedor').value;
        const observacoes = document.getElementById('compraObservacoes').value.trim();

        if (!fornecedorId) {
            mostrarToast('Selecione um fornecedor!', 'warning');
            return;
        }

        if (this.carrinho.length === 0) {
            mostrarToast('Adicione ao menos um item!', 'warning');
            return;
        }

        setButtonLoading('finalizarCompra', true);

        try {
            const fornecedor = this.app.fornecedores.fornecedores.find(f => f.id === parseInt(fornecedorId));
            const totalCompra = this.carrinho.reduce((sum, item) => sum + item.total_custo, 0);
            const usuarioLogado = this.app.auth.getUsuarioLogado();

            const { data: compraData, error: compraError } = await supabase.from('compras').insert([{
                fornecedor_id: parseInt(fornecedorId),
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
            this.atualizarCarrinho();
            document.getElementById('compraFornecedor').value = '';
            document.getElementById('compraObservacoes').value = '';

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
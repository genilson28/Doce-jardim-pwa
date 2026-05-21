// ==================== MÓDULO PDV ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { gerarComprovantePDF } from '../../services/pdfService.js';
import { CATEGORIAS } from '../../config/constants.js';
import { getIconeCategoria } from '../../utils/formatters.js';

export class PDVModule {
    constructor(app) {
        this.app = app;
        this.carrinho = [];
        this.clienteFiadoSelecionado = null;
    }

    async carregar() {
        await this.app.produtos.carregar();
        this.app.pagination.setup(this.app.produtos.getProdutos(), 5);
        this.app.pagination.currentCategory = 'todas';
        
        const inputPesquisa = document.getElementById('pesquisaPDV');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarCategorias();
        this.renderizarProdutos();
        this.atualizarCarrinho();

        // Carregar clientes para fiado
        await this.app.clientes.carregar();
        this.renderizarListaClientesFiado();
    }

    renderizarCategorias() {
        const container = document.getElementById('categoriasPDV');
        if (!container) return;
        
        container.innerHTML = CATEGORIAS.map(cat => `
            <button class="categoria-btn ${this.app.pagination.currentCategory === cat.id ? 'active' : ''}" 
                    onclick="app.pdv.filtrarCategoria('${cat.id}')"
                    aria-label="Filtrar por ${cat.nome}">
                <span class="categoria-icon">${getIconeCategoria(cat.id)}</span>
                <span class="categoria-nome">${cat.nome}</span>
            </button>
        `).join('');
    }

    filtrarCategoria(categoria) {
        this.app.pagination.currentCategory = categoria;
        this.app.pagination.currentPage = 1;
        
        const termoPesquisa = document.getElementById('pesquisaPDV')?.value.toLowerCase().trim() || '';
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.app.produtos.getProdutos(),
            termoPesquisa,
            categoria
        );
        
        this.renderizarCategorias();
        this.renderizarProdutos();
    }

    pesquisar() {
        const termoPesquisa = document.getElementById('pesquisaPDV').value.toLowerCase().trim();
        this.app.pagination.currentPage = 1;
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.app.produtos.getProdutos(),
            termoPesquisa,
            this.app.pagination.currentCategory || 'todas'
        );
        this.renderizarProdutos();
    }

    renderizarProdutos() {
        const lista = document.getElementById('listaProdutosPDV');
        if (!lista) return;
        
        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            this.renderizarControlesPaginacao();
            return;
        }
        
        lista.innerHTML = '';
        
        this.app.pagination.getPageItems().forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-card-pdv';
            
            let estoqueClass = 'estoque-ok';
            if (produto.estoque === 0) estoqueClass = 'estoque-zero';
            else if (produto.estoque <= 5) estoqueClass = 'estoque-baixo';
            
            div.onclick = () => this.adicionarAoCarrinho(produto.id);
            
            div.innerHTML = `
                <div class="produto-card-header">
                    <div class="produto-icon">${getIconeCategoria(produto.categoria)}</div>
                    <div class="produto-estoque-badge ${estoqueClass}">${produto.estoque}</div>
                </div>
                <div class="produto-card-body">
                    <h4 class="produto-nome">${produto.nome}</h4>
                    <div class="produto-categoria-tag">${produto.categoria}</div>
                </div>
                <div class="produto-card-footer">
                    <div class="produto-preco-container">
                        <span class="produto-preco-label">Preço</span>
                        <span class="produto-preco">R$ ${produto.preco?.toFixed(2)}</span>
                    </div>
                    <button class="btn-adicionar" onclick="event.stopPropagation(); app.pdv.adicionarAoCarrinho(${produto.id})">
                        <span class="btn-icon">🛒</span>
                        <span class="btn-text">Adicionar</span>
                    </button>
                </div>
            `;
            
            lista.appendChild(div);
        });
        
        this.renderizarControlesPaginacao();
    }

    renderizarControlesPaginacao() {
        const container = document.getElementById('paginacaoPDV');
        if (!container) return;

        const totalPages = Math.ceil(this.app.pagination.filteredData.length / this.app.pagination.itemsPerPage);
        const currentPage = this.app.pagination.currentPage;

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="pagination-controls">
                <button class="btn-pagination" onclick="app.pdv.paginaAnterior()" ${currentPage === 1 ? 'disabled' : ''}>
                    <span>←</span> Anterior
                </button>
                <div class="pagination-info">
                    <span>${currentPage}</span> / <span>${totalPages}</span>
                </div>
                <button class="btn-pagination" onclick="app.pdv.proximaPagina()" ${currentPage === totalPages ? 'disabled' : ''}>
                    Próxima <span>→</span>
                </button>
            </div>
        `;
    }

    proximaPagina() {
        const totalPages = Math.ceil(this.app.pagination.filteredData.length / this.app.pagination.itemsPerPage);
        if (this.app.pagination.currentPage < totalPages) {
            this.app.pagination.currentPage++;
            this.renderizarProdutos();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    paginaAnterior() {
        if (this.app.pagination.currentPage > 1) {
            this.app.pagination.currentPage--;
            this.renderizarProdutos();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    adicionarAoCarrinho(produtoId) {
        const produto = this.app.produtos.getProdutos().find(p => p.id === produtoId);
        if (!produto) return;
        
        if (produto.estoque <= 0) {
            mostrarToast('Produto sem estoque!', 'error');
            return;
        }
        
        const itemExistente = this.carrinho.find(item => item.id === produtoId);
        
        if (itemExistente) {
            if (itemExistente.quantidade < produto.estoque) {
                itemExistente.quantidade += 1;
            } else {
                mostrarToast('Estoque insuficiente!', 'warning');
                return;
            }
        } else {
            this.carrinho.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                quantidade: 1
            });
        }
        
        this.atualizarCarrinho();
        mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    }

    removerDoCarrinho(produtoId) {
        const index = this.carrinho.findIndex(item => item.id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarCarrinho();
        }
    }

    atualizarCarrinho() {
        const carrinhoItens = document.getElementById('carrinhoItens');
        if (!carrinhoItens) return;
        
        if (this.carrinho.length === 0) {
            carrinhoItens.innerHTML = '<div class="empty-state">Carrinho vazio</div>';
        } else {
            carrinhoItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info">
                        <h4>${item.nome}</h4>
                        <p>R$ ${item.preco?.toFixed(2)} x ${item.quantidade}</p>
                    </div>
                    <div class="carrinho-item-acoes">
                        <span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span>
                        <button onclick="app.pdv.removerDoCarrinho(${item.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
        
        this.calcularTotal();
    }

    calcularTotal() {
        const subtotal = this.carrinho.reduce((total, item) => 
            total + ((item.preco || 0) * item.quantidade), 0
        );
        
        document.getElementById('subtotalCarrinho').textContent = subtotal.toFixed(2);
        
        const tipoDesconto = document.getElementById('tipoDesconto').value;
        const valorDescontoInput = document.getElementById('valorDesconto');
        const descontoAplicadoDiv = document.getElementById('descontoAplicado');
        
        let desconto = 0;
        
        if (tipoDesconto === 'nenhum') {
            valorDescontoInput.style.display = 'none';
            descontoAplicadoDiv.style.display = 'none';
        } else {
            valorDescontoInput.style.display = 'block';
            const valorDesconto = parseFloat(valorDescontoInput.value) || 0;
            
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
            
            if (desconto > 0) {
                descontoAplicadoDiv.style.display = 'block';
                document.getElementById('valorDescontoAplicado').textContent = desconto.toFixed(2);
            } else {
                descontoAplicadoDiv.style.display = 'none';
            }
        }
        
        const total = subtotal - desconto;
        document.getElementById('carrinhoTotal').textContent = total.toFixed(2);
    }

    handleDescontoChange() {
        this.calcularTotal();
    }

    // ==================== FIADO NO PDV ====================

    handleFormaPagamentoChange() {
        const forma = document.getElementById('formaPagamento').value;
        const container = document.getElementById('pdvClienteFiadoContainer');
        if (forma === 'fiado') {
            container.style.display = 'block';
            this.renderizarListaClientesFiado();
        } else {
            container.style.display = 'none';
            this.clienteFiadoSelecionado = null;
            document.getElementById('pdvClienteFiadoSelecionadoText').textContent = 'Selecione um cliente';
        }
    }

    renderizarListaClientesFiado() {
        const lista = document.getElementById('pdvListaClientesFiado');
        if (!lista) return;

        const clientes = this.app.clientes.getClientes();
        if (!clientes || clientes.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado. Vá em Clientes para cadastrar.</div>';
            return;
        }

        lista.innerHTML = clientes.map(c => `
            <div class="select-pesquisavel-item"
                 data-id="${c.id}"
                 data-nome="${(c.nome || '').replace(/'/g, "\\'")}"
                 onclick="app.pdv.selecionarClienteFiado(${c.id}, '${(c.nome || '').replace(/'/g, "\\'")}')">
                <strong>${c.nome || 'Sem nome'}</strong>
                ${c.telefone ? `<small>${c.telefone}</small>` : ''}
                <small style="color:#e57373;">Saldo: R$ ${parseFloat(c.saldo_devedor || 0).toFixed(2)}</small>
            </div>
        `).join('');
    }

    toggleClienteFiado() {
        const dropdown = document.getElementById('pdvSelectClienteFiadoDropdown');
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }

    pesquisarClienteFiado(termo) {
        const lista = document.getElementById('pdvListaClientesFiado');
        const itens = lista.querySelectorAll('.select-pesquisavel-item');
        termo = termo.toLowerCase().trim();
        itens.forEach(item => {
            const nome = item.dataset.nome.toLowerCase();
            item.style.display = nome.includes(termo) ? 'block' : 'none';
        });
    }

    selecionarClienteFiado(id, nome) {
        this.clienteFiadoSelecionado = id;
        document.getElementById('pdvClienteFiadoSelecionadoText').textContent = nome;
        document.getElementById('pdvSelectClienteFiadoDropdown').style.display = 'none';
        document.getElementById('pdvSearchClienteFiado').value = '';
        document.querySelectorAll('#pdvListaClientesFiado .select-pesquisavel-item').forEach(i => i.classList.remove('selected'));
        const item = document.querySelector(`#pdvListaClientesFiado [data-id="${id}"]`);
        if (item) item.classList.add('selected');
    }

    // ==================== FINALIZAR VENDA ====================

    async finalizarVenda() {
        if (this.carrinho.length === 0) {
            mostrarToast('Carrinho vazio!', 'warning');
            return;
        }

        const formaPagamento = document.getElementById('formaPagamento').value;

        // Validar cliente para venda fiado
        if (formaPagamento === 'fiado') {
            if (!this.clienteFiadoSelecionado) {
                mostrarToast('Selecione um cliente para venda fiado!', 'warning');
                return;
            }
        }

        setButtonLoading('finalizarVenda', true, 'Finalizar Venda');

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

        if (formaPagamento === 'fiado' && this.clienteFiadoSelecionado) {
            const cliente = this.app.clientes.getClientes().find(c => c.id === this.clienteFiadoSelecionado);
            venda.cliente_id = this.clienteFiadoSelecionado;
            venda.cliente_nome = cliente ? cliente.nome : '';
        }

        const usuario = this.app.auth.getUsuarioLogado();
        if (usuario) {
            venda.usuario_id = usuario.id;
            venda.usuario_nome = usuario.nome;
        }

        const sucesso = await this.app.vendas.registrar(venda);

        if (sucesso) {
            for (const item of this.carrinho) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === item.id);
                if (produto) {
                    produto.estoque -= item.quantidade;
                    await this.app.produtos.atualizar(produto);
                }
            }

            // Atualizar saldo devedor do cliente se for fiado
            if (formaPagamento === 'fiado' && this.clienteFiadoSelecionado) {
                try {
                    const { data: clienteAtual } = await supabase
                        .from('clientes')
                        .select('saldo_devedor')
                        .eq('id', this.clienteFiadoSelecionado)
                        .single();
                    const saldoAtual = parseFloat(clienteAtual?.saldo_devedor || 0);
                    await supabase.from('clientes').update({
                        saldo_devedor: saldoAtual + total
                    }).eq('id', this.clienteFiadoSelecionado);
                } catch (e) {
                    console.error('Erro ao atualizar saldo do cliente:', e);
                }
            }

            setTimeout(() => {
                gerarComprovantePDF(venda);
            }, 500);

            // Resetar carrinho e formulário
            this.carrinho = [];
            this.clienteFiadoSelecionado = null;
            this.atualizarCarrinho();
            document.getElementById('tipoDesconto').value = 'nenhum';
            document.getElementById('valorDesconto').value = '';
            document.getElementById('valorDesconto').style.display = 'none';
            document.getElementById('formaPagamento').value = 'dinheiro';
            document.getElementById('pdvClienteFiadoContainer').style.display = 'none';
            document.getElementById('pdvClienteFiadoSelecionadoText').textContent = 'Selecione um cliente';
            this.calcularTotal();
            await this.carregar();

            mostrarToast('Venda finalizada e comprovante gerado!', 'sucesso');
        }

        setButtonLoading('finalizarVenda', false, 'Finalizar Venda');
    }

    limparCarrinho() {
        if (this.carrinho.length === 0) return;
        
        if (confirm('Deseja realmente limpar o carrinho?')) {
            this.carrinho = [];
            this.atualizarCarrinho();
            mostrarToast('Carrinho limpo', 'info');
        }
    }
}

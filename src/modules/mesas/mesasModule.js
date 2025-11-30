// ==================== MÓDULO DE MESAS ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading, handleSupabaseError } from '../../utils/ui.js';
import { formatarMoeda, formatarDataHora } from '../../utils/formatters.js';
import { pdfService } from '../../services/pdfService.js';
import { CATEGORIAS_EMOJIS } from '../../config/constants.js';

// CONSTANTES DE CATEGORIAS (adicionadas para resolver o erro)
const CATEGORIAS = [
    { id: 'todas', nome: '🛒 Todos' },
    { id: 'bebidas', nome: '🥤 Bebidas' },
    { id: 'lanches', nome: '🍔 Lanches' },
    { id: 'sobremesas', nome: '🍰 Sobremesas' },
    { id: 'doces', nome: '🍬 Doces' },
    { id: 'salgados', nome: '🥨 Salgados' },
    { id: 'outros', nome: '📦 Outros' }
];

// Função auxiliar para obter ícone da categoria
function getIconeCategoria(categoria) {
    const icones = {
        'bebidas': '🥤',
        'lanches': '🍔',
        'sobremesas': '🍰',
        'doces': '🍬',
        'salgados': '🥨',
        'outros': '📦'
    };
    return icones[categoria] || '📦';
}

export class MesasModule {
    constructor(app) {
        this.app = app;
        this.mesas = [];
        this.mesaAtual = null;
        this.carrinho = [];
    }

    async carregar() {
        try {
            const { data, error } = await supabase
                .from('mesas')
                .select('*')
                .order('numero');
            
            if (error) throw error;
            this.mesas = data || [];
            return this.mesas;
        } catch (error) {
            console.error('❌ Erro ao carregar mesas:', error);
            return [];
        }
    }

    async listar() {
        await this.carregar();
        const lista = document.getElementById('listaMesas');
        if (!lista) return;
        
        lista.innerHTML = '';
        
        if (this.mesas.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma mesa cadastrada</div>';
            return;
        }
        
        this.mesas.forEach(mesa => {
            const div = document.createElement('div');
            div.className = `mesa-card ${mesa.status}`;
            
            const statusTexto = mesa.status === 'livre' ? '✓ Livre' : '👥 Ocupada';
            const valorTexto = mesa.valor_total > 0 ? `R$ ${mesa.valor_total.toFixed(2)}` : '';
            
            div.innerHTML = `
                <div class="mesa-numero">🪑</div>
                <h3>Mesa ${mesa.numero}</h3>
                <div class="mesa-status ${mesa.status}">${statusTexto}</div>
                ${valorTexto ? `<div class="mesa-valor">${valorTexto}</div>` : ''}
                ${mesa.pedido_atual ? `<div class="mesa-info"><p>Comanda aberta</p></div>` : ''}
            `;
            
            div.onclick = () => this.abrirMenu(mesa);
            lista.appendChild(div);
        });
    }

    filtrar(filtro) {
        const todasMesas = document.querySelectorAll('.mesa-card');
        todasMesas.forEach(card => {
            if (filtro === 'todas') {
                card.style.display = 'block';
            } else if (filtro === 'ocupadas') {
                card.style.display = card.classList.contains('ocupada') ? 'block' : 'none';
            } else if (filtro === 'livres') {
                card.style.display = card.classList.contains('livre') ? 'block' : 'none';
            }
        });
        
        document.querySelectorAll('.mesas-filtros .btn-filtro').forEach(btn => 
            btn.classList.remove('active')
        );
        
        // Ativar botão do filtro atual
        const botaoAtivo = document.querySelector(`[data-filtro="${filtro}"]`);
        if (botaoAtivo) {
            botaoAtivo.classList.add('active');
        }
    }

    async abrirMenu(mesa) {
        if (mesa.status === 'livre') {
            if (confirm(`Abrir comanda na Mesa ${mesa.numero}?`)) {
                await this.abrirComanda(mesa);
            }
        } else {
            const opcao = confirm(
                `Mesa ${mesa.numero} - R$ ${mesa.valor_total?.toFixed(2) || '0.00'}\n\n` +
                `OK = Ver Comanda\nCancelar = Fechar Conta`
            );
            
            if (opcao) {
                await this.abrirComanda(mesa);
            } else {
                await this.mostrarModalFecharConta(mesa);
            }
        }
    }

    async abrirComanda(mesa) {
        this.mesaAtual = mesa;
        await this.app.produtos.carregar();
        
        // Inicializar paginação se existir
        if (this.app.pagination) {
            this.app.pagination.setup(this.app.produtos.getProdutos(), 25);
        }
        
        this.carrinho = mesa.pedido_atual ? JSON.parse(mesa.pedido_atual) : [];
        
        if (mesa.status === 'livre') {
            const { error } = await supabase.from('mesas').update({
                status: 'ocupada',
                pedido_atual: '[]',
                valor_total: 0
            }).eq('id', mesa.id);
            
            if (error) {
                console.error('❌ Erro ao ocupar mesa:', error);
                mostrarToast('Erro ao abrir comanda', 'error');
                return;
            } else {
                this.mesaAtual.status = 'ocupada';
            }
        }
        
        document.getElementById('comandaTitulo').textContent = `📋 Mesa ${mesa.numero}`;
        this.app.showScreen('comandaScreen');
        this.carregarProdutosComanda();
        this.atualizarComanda();
    }

    carregarProdutosComanda() {
        this.renderizarCategorias();
        this.renderizarProdutos();
    }

    renderizarCategorias() {
        const container = document.getElementById('categoriasMesas');
        if (!container) return;
        
        container.innerHTML = CATEGORIAS.map(cat => `
            <button class="btn-filtro ${this.app.pagination?.currentCategory === cat.id ? 'active' : ''}" 
                    onclick="app.mesas.filtrarCategoria('${cat.id}')">
                ${cat.nome}
            </button>
        `).join('');
    }

    filtrarCategoria(categoria) {
        if (!this.app.pagination) return;
        
        this.app.pagination.currentCategory = categoria;
        this.app.pagination.currentPage = 1;
        
        const termoPesquisa = document.getElementById('pesquisaMesas')?.value.toLowerCase().trim() || '';
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.app.produtos.getProdutos(),
            termoPesquisa,
            categoria
        );
        
        this.renderizarProdutos();
    }

    pesquisarProdutos() {
        if (!this.app.pagination) return;
        
        const termoPesquisa = document.getElementById('pesquisaMesas').value.toLowerCase().trim();
        this.app.pagination.currentPage = 1;
        this.app.pagination.filteredData = this.app.filtering.apply(
            this.app.produtos.getProdutos(),
            termoPesquisa,
            this.app.pagination.currentCategory || 'todas'
        );
        this.renderizarProdutos();
    }

    renderizarProdutos() {
        const lista = document.getElementById('listaProdutosComanda');
        if (!lista) return;
        
        let produtosParaExibir = [];
        
        if (this.app.pagination) {
            produtosParaExibir = this.app.pagination.getPageItems();
        } else {
            // Fallback: mostrar todos os produtos se paginação não estiver disponível
            produtosParaExibir = this.app.produtos.getProdutos().slice(0, 25);
        }
        
        if (produtosParaExibir.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado</div>';
            if (this.app.pagination) {
                this.app.pagination.renderPaginationControls('paginacaoMesas', this.renderizarProdutos.bind(this));
            }
            return;
        }
        
        lista.innerHTML = '';
        
        produtosParaExibir.forEach(produto => {
            const div = document.createElement('div');
            div.className = 'produto-card';
            div.onclick = () => this.adicionarAoCarrinho(produto.id);
            
            div.innerHTML = `
                <h4>${produto.nome}</h4>
                <p>R$ ${produto.preco?.toFixed(2) || '0.00'}</p>
                <small>Estoque: ${produto.estoque || 0}</small>
                <div class="categoria-badge-small">
                    ${getIconeCategoria(produto.categoria)} ${produto.categoria}
                </div>
            `;
            
            lista.appendChild(div);
        });
        
        if (this.app.pagination) {
            this.app.pagination.renderPaginationControls('paginacaoMesas', this.renderizarProdutos.bind(this));
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
        
        this.atualizarComanda();
        this.salvarComanda();
        mostrarToast(`${produto.nome} adicionado`, 'sucesso');
    }

    atualizarComanda() {
        const comandaItens = document.getElementById('comandaItens');
        if (!comandaItens) return;
        
        if (this.carrinho.length === 0) {
            comandaItens.innerHTML = '<div class="empty-state">Comanda vazia</div>';
        } else {
            comandaItens.innerHTML = this.carrinho.map(item => `
                <div class="carrinho-item">
                    <div class="carrinho-item-info">
                        <h4>${item.nome}</h4>
                        <p>R$ ${(item.preco || 0).toFixed(2)} x ${item.quantidade}</p>
                    </div>
                    <div class="carrinho-item-acoes">
                        <span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span>
                        <button onclick="app.mesas.removerDoCarrinho(${item.id})">🗑️</button>
                    </div>
                </div>
            `).join('');
        }
        
        const total = this.carrinho.reduce((sum, item) => 
            sum + ((item.preco || 0) * item.quantidade), 0
        );
        
        document.getElementById('comandaTotal').textContent = total.toFixed(2);
    }

    removerDoCarrinho(produtoId) {
        const index = this.carrinho.findIndex(item => item.id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarComanda();
            this.salvarComanda();
            mostrarToast('Item removido', 'info');
        }
    }

    async salvarComanda() {
        if (!this.mesaAtual) return;
        
        const total = this.carrinho.reduce((sum, item) => 
            sum + ((item.preco || 0) * item.quantidade), 0
        );
        
        const { error } = await supabase.from('mesas').update({
            status: 'ocupada',
            pedido_atual: JSON.stringify(this.carrinho),
            valor_total: total
        }).eq('id', this.mesaAtual.id);
        
        if (error) {
            console.error('❌ Erro ao salvar comanda:', error);
            mostrarToast('Erro ao salvar comanda', 'error');
        } else {
            this.mesaAtual.valor_total = total;
            this.mesaAtual.pedido_atual = JSON.stringify(this.carrinho);
        }
    }

    async voltarParaMesas() {
        this.mesaAtual = null;
        this.carrinho = [];
        await this.carregar();
        this.app.showScreen('mesasScreen');
    }

    imprimirComanda() {
        if (this.carrinho.length === 0) {
            mostrarToast('Comanda vazia!', 'warning');
            return;
        }
        
        const total = this.carrinho.reduce((sum, item) => 
            sum + ((item.preco || 0) * item.quantidade), 0
        );
        
        let conteudo = `
═══════════════════════════════
      🍰 DOCE JARDIM 🍰
═══════════════════════════════

Mesa: ${this.mesaAtual.numero}
Data: ${new Date().toLocaleString('pt-BR')}

───────────────────────────────
ITENS
───────────────────────────────
`;
        
        this.carrinho.forEach(item => {
            conteudo += `\n${item.nome}\n`;
            conteudo += `${item.quantidade}x R$ ${(item.preco || 0).toFixed(2)} = R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}\n`;
        });
        
        conteudo += `\n───────────────────────────────`;
        conteudo += `\nTOTAL: R$ ${total.toFixed(2)}`;
        conteudo += `\n═══════════════════════════════`;
        
        // Tenta usar a API de impressão se disponível
        if (window.print) {
            const janelaImpressao = window.open('', '_blank');
            janelaImpressao.document.write(`<pre>${conteudo}</pre>`);
            janelaImpressao.print();
            janelaImpressao.close();
        } else {
            alert(conteudo);
        }
        
        mostrarToast('Comanda impressa!', 'info');
    }

    mostrarModalFecharConta(mesa) {
        this.mesaAtual = mesa;
        
        if (mesa.pedido_atual) {
            try {
                this.carrinho = JSON.parse(mesa.pedido_atual);
            } catch (e) {
                this.carrinho = [];
            }
        }
        
        const total = mesa.valor_total || 0;
        
        document.getElementById('modalMesaNumero').textContent = mesa.numero;
        document.getElementById('modalSubtotal').textContent = total.toFixed(2);
        document.getElementById('modalTotalConta').textContent = total.toFixed(2);
        document.getElementById('modalTotalFinal').textContent = total.toFixed(2);
        
        const modal = document.getElementById('modalFecharConta');
        modal.classList.add('active');
        modal.style.display = 'flex';
        
        // Configurar eventos de desconto
        const tipoDesconto = document.getElementById('modalTipoDesconto');
        const valorDesconto = document.getElementById('modalValorDesconto');
        
        tipoDesconto.onchange = () => {
            this.calcularTotalModal();
        };
        
        valorDesconto.oninput = () => {
            this.calcularTotalModal();
        };
        
        // Resetar valores
        tipoDesconto.value = 'nenhum';
        valorDesconto.value = '';
        document.getElementById('modalDescontoAplicado').style.display = 'none';
    }

    calcularTotalModal() {
        const subtotal = this.mesaAtual.valor_total || 0;
        const tipoDesconto = document.getElementById('modalTipoDesconto').value;
        const valorDescontoInput = document.getElementById('modalValorDesconto').value;
        
        let desconto = 0;
        
        if (tipoDesconto !== 'nenhum' && valorDescontoInput) {
            const valorDesconto = parseFloat(valorDescontoInput) || 0;
            
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
            
            // Limitar desconto ao valor máximo do subtotal
            if (desconto > subtotal) {
                desconto = subtotal;
            }
        }
        
        if (desconto > 0) {
            document.getElementById('modalDescontoAplicado').style.display = 'block';
            document.getElementById('modalValorDescontoAplicado').textContent = desconto.toFixed(2);
        } else {
            document.getElementById('modalDescontoAplicado').style.display = 'none';
        }
        
        const totalFinal = Math.max(0, subtotal - desconto);
        document.getElementById('modalTotalFinal').textContent = totalFinal.toFixed(2);
    }

    fecharModalConta() {
        const modal = document.getElementById('modalFecharConta');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async confirmarFechamento() {
        const subtotal = this.mesaAtual.valor_total || 0;
        const tipoDesconto = document.getElementById('modalTipoDesconto').value;
        const valorDescontoInput = document.getElementById('modalValorDesconto').value;
        const formaPagamento = document.getElementById('modalFormaPagamento').value;
        
        if (!formaPagamento) {
            mostrarToast('Selecione a forma de pagamento', 'warning');
            return;
        }
        
        let desconto = 0;
        
        if (tipoDesconto !== 'nenhum' && valorDescontoInput) {
            const valorDesconto = parseFloat(valorDescontoInput) || 0;
            if (tipoDesconto === 'percentual') {
                desconto = (subtotal * valorDesconto) / 100;
            } else {
                desconto = valorDesconto;
            }
            
            if (desconto > subtotal) {
                desconto = subtotal;
            }
        }
        
        const total = Math.max(0, subtotal - desconto);
        
        const venda = {
            itens: JSON.stringify(this.carrinho),
            subtotal: subtotal,
            desconto: desconto,
            total: total,
            forma_pagamento: formaPagamento,
            mesa_numero: this.mesaAtual.numero,
            data: new Date().toISOString()
        };
        
        const usuario = this.app.auth.getUsuarioLogado();
        if (usuario) {
            venda.usuario_id = usuario.id;
            venda.usuario_nome = usuario.nome;
        }
        
        const sucesso = await this.app.vendas.registrar(venda);
        
        if (!sucesso) {
            mostrarToast('Erro ao registrar venda', 'error');
            return;
        }
        
        // Atualizar estoque
        for (const item of this.carrinho) {
            const produto = this.app.produtos.getProdutos().find(p => p.id === item.id);
            if (produto) {
                produto.estoque -= item.quantidade;
                await this.app.produtos.atualizar(produto);
            }
        }
        
        // Gerar PDF (se o serviço existir)
        if (typeof gerarComprovantePDF === 'function') {
            setTimeout(() => {
                gerarComprovantePDF(venda, this.mesaAtual.numero);
            }, 500);
        }
        
        // Liberar mesa
        const { error } = await supabase.from('mesas').update({
            status: 'livre',
            pedido_atual: null,
            valor_total: 0
        }).eq('id', this.mesaAtual.id);
        
        if (error) {
            console.error('❌ ERRO AO LIBERAR MESA:', error);
            mostrarToast('Erro ao liberar mesa: ' + error.message, 'error');
            return;
        }
        
        this.fecharModalConta();
        this.carrinho = [];
        const mesaNumero = this.mesaAtual.numero;
        this.mesaAtual = null;
        
        mostrarToast(`Mesa ${mesaNumero} fechada com sucesso!`, 'sucesso');
        await this.carregar();
        this.app.showScreen('mesasScreen');
    }

    finalizarComanda() {
        if (!this.mesaAtual) return;
        
        if (this.carrinho.length === 0) {
            mostrarToast('Comanda vazia!', 'warning');
            return;
        }
        
        this.mostrarModalFecharConta(this.mesaAtual);
    }
}

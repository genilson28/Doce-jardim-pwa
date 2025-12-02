// ==================== MÓDULO COMPRAS - COMPLETO E PROFISSIONAL ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
        this.produtosDisponiveis = []; // Lista completa de produtos
        this.fornecedorSelecionado = null;
        this.valorFrete = 0;
        this.filtroAtivo = 'todos'; // 'todos', 'selecionados', 'nao-selecionados'
        this.termoPesquisa = '';
        this.produtosSelecionados = new Set(); // Usando Set para melhor performance
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
        await this.app.produtos.carregar();
        
        this.app.pagination.setup(this.compras, 10);
        this.renderizar();
        
        this.inicializarSelectFornecedor();
        this.renderizarListaProdutosMultiplos();
        
        // Adiciona pesquisa no histórico
        document.getElementById('pesquisaCompras')?.addEventListener('input', (e) => this.pesquisarHistorico(e.target.value));
    }

    renderizar() {
        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state"><i class="fas fa-box-open"></i><p>Nenhuma compra registrada</p></div>';
            this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
            return;
        }

        lista.innerHTML = '';
        this.app.pagination.getPageItems().forEach(compra => {
            const div = document.createElement('div');
            div.className = 'venda-item';
            
            div.innerHTML = `
                <div class="venda-item-header">
                    <strong><i class="fas fa-box"></i> ${compra.data_exibicao}</strong>
                    <strong class="valor-venda">R$ ${compra.valor_total.toFixed(2)}</strong>
                </div>
                <p><strong><i class="fas fa-truck"></i> Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                ${compra.frete ? `<p><strong><i class="fas fa-shipping-fast"></i> Frete:</strong> R$ ${compra.frete.toFixed(2)}</p>` : ''}
                ${compra.usuario_nome ? `<p><strong><i class="fas fa-user"></i> Registrado por:</strong> ${compra.usuario_nome}</p>` : ''}
                ${compra.observacoes ? `<p><strong><i class="fas fa-sticky-note"></i> Observações:</strong> ${compra.observacoes}</p>` : ''}
                <div class="venda-item-acoes" style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn-detalhes" data-id="${compra.id}">
                        <i class="fas fa-search"></i> Detalhes
                    </button>
                    <button class="btn-pdf" data-id="${compra.id}" style="background: #2196F3;">
                        <i class="fas fa-file-pdf"></i> PDF
                    </button>
                    <button class="btn-excluir" data-id="${compra.id}" style="background: #f44336;">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            `;
            
            div.querySelector('.btn-detalhes').addEventListener('click', () => this.verDetalhes(compra.id));
            div.querySelector('.btn-pdf').addEventListener('click', () => this.gerarPDF(compra.id));
            div.querySelector('.btn-excluir').addEventListener('click', () => this.excluir(compra.id));

            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
    }

    inicializarSelectFornecedor() {
        const container = document.getElementById('compraFornecedorContainer');
        if (!container) return;

        const fornecedoresAtivos = this.app.fornecedores.getFornecedoresAtivos() || [];

        container.innerHTML = `
            <div class="select-pesquisavel">
                <div class="select-pesquisavel-header" id="headerFornecedor" onclick="app.compras.toggleFornecedor()">
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
                            oninput="app.compras.pesquisarFornecedor(this.value)"
                            onclick="event.stopPropagation()"
                        >
                    </div>
                    <div class="select-pesquisavel-list" id="listaFornecedores">
                        ${fornecedoresAtivos.map(f => `
                            <div class="select-pesquisavel-item" 
                                data-id="${f.id}" 
                                data-nome="${f.nome}"
                                onclick="app.compras.selecionarFornecedor(${f.id}, '${f.nome.replace(/'/g, "\\'")}')">
                                <strong><i class="fas fa-truck"></i> ${f.nome}</strong>
                                ${f.contato ? `<small><i class="fas fa-phone"></i> ${f.contato}</small>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    toggleFornecedor() {
        const dropdown = document.getElementById('selectFornecedorDropdown');
        const searchInput = document.getElementById('searchFornecedor');
        
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            dropdown.style.display = 'block';
            setTimeout(() => searchInput.focus(), 100);
        }
    }

    pesquisarFornecedor(termo) {
        const lista = document.getElementById('listaFornecedores');
        const itens = lista.querySelectorAll('.select-pesquisavel-item');
        
        termo = termo.toLowerCase().trim();
        
        itens.forEach(item => {
            const nome = item.dataset.nome.toLowerCase();
            item.style.display = nome.includes(termo) ? 'block' : 'none';
        });
    }

    selecionarFornecedor(id, nome) {
        this.fornecedorSelecionado = id;
        document.getElementById('fornecedorSelecionadoText').textContent = nome;
        
        const lista = document.getElementById('listaFornecedores');
        lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
            i.classList.remove('selected');
        });
        
        const itemSelecionado = lista.querySelector(`[data-id="${id}"]`);
        if (itemSelecionado) {
            itemSelecionado.classList.add('selected');
        }
        
        document.getElementById('selectFornecedorDropdown').style.display = 'none';
        document.getElementById('searchFornecedor').value = '';
        
        lista.querySelectorAll('.select-pesquisavel-item').forEach(i => {
            i.style.display = 'block';
        });
    }

    // --- INTERFACE PROFISSIONAL DE SELEÇÃO DE PRODUTOS ---
    renderizarListaProdutosMultiplos() {
        const container = document.getElementById('listaProdutosMultiplos');
        if (!container) return;

        this.produtosDisponiveis = this.app.produtos.getProdutos();
        
        if (this.produtosDisponiveis.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-box-open" style="font-size: 48px; margin-bottom: 15px; color: #ccc;"></i>
                    <p>Nenhum produto cadastrado</p>
                    <button class="btn-secondary" onclick="app.showScreen('produtosScreen')">
                        <i class="fas fa-plus"></i> Cadastrar Primeiro Produto
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="produtos-selecao-container">
                <!-- CABEÇALHO COM CONTROLES -->
                <div class="produtos-selecao-header">
                    <div class="produtos-selecao-title">
                        <h3><i class="fas fa-boxes"></i> Selecionar Produtos</h3>
                        <span class="badge" id="contadorSelecionados">0 selecionados</span>
                    </div>
                    
                    <div class="produtos-selecao-controls">
                        <!-- PESQUISA -->
                        <div class="search-box">
                            <i class="fas fa-search"></i>
                            <input type="text" 
                                   id="pesquisaProdutosCompra" 
                                   placeholder="Pesquisar produtos..."
                                   oninput="app.compras.pesquisarProdutosMultiplos()"
                                   class="search-input">
                        </div>
                        
                        <!-- FILTROS -->
                        <div class="filtros-container">
                            <div class="filtro-buttons">
                                <button class="filtro-btn ${this.filtroAtivo === 'todos' ? 'active' : ''}" 
                                        onclick="app.compras.filtrarProdutos('todos')">
                                    <i class="fas fa-th-list"></i> Todos
                                </button>
                                <button class="filtro-btn ${this.filtroAtivo === 'selecionados' ? 'active' : ''}" 
                                        onclick="app.compras.filtrarProdutos('selecionados')">
                                    <i class="fas fa-check-circle"></i> Selecionados
                                </button>
                                <button class="filtro-btn ${this.filtroAtivo === 'nao-selecionados' ? 'active' : ''}" 
                                        onclick="app.compras.filtrarProdutos('nao-selecionados')">
                                    <i class="fas fa-circle"></i> Não selecionados
                                </button>
                            </div>
                            
                            <!-- AÇÕES EM MASSA -->
                            <div class="acoes-massa">
                                <button class="btn-secondary btn-sm" onclick="app.compras.selecionarTodosProdutos()">
                                    <i class="fas fa-check-double"></i> Selecionar Todos
                                </button>
                                <button class="btn-secondary btn-sm" onclick="app.compras.limparSelecaoProdutos()">
                                    <i class="fas fa-times"></i> Limpar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- LISTA DE PRODUTOS -->
                <div class="produtos-grid-container">
                    <div class="produtos-grid-header">
                        <div class="grid-col produto-info">PRODUTO</div>
                        <div class="grid-col produto-estoque">ESTOQUE</div>
                        <div class="grid-col produto-campos">
                            <div class="campos-header">
                                <span>QUANTIDADE</span>
                                <span>CUSTO (R$)</span>
                                <span>VENDA (R$)</span>
                            </div>
                        </div>
                        <div class="grid-col produto-total">TOTAL</div>
                        <div class="grid-col produto-acao">AÇÃO</div>
                    </div>
                    
                    <div class="produtos-grid-list" id="produtosMultiplosLista">
                        ${this.renderizarGridProdutos()}
                    </div>
                </div>
                
                <!-- RESUMO E AÇÕES -->
                <div class="produtos-selecao-footer">
                    <div class="resumo-selecao">
                        <div class="resumo-item">
                            <span class="resumo-label">Produtos selecionados:</span>
                            <span class="resumo-valor" id="contadorProdutosSelecionados">0</span>
                        </div>
                        <div class="resumo-item">
                            <span class="resumo-label">Quantidade total:</span>
                            <span class="resumo-valor" id="quantidadeTotalSelecionada">0</span>
                        </div>
                        <div class="resumo-item">
                            <span class="resumo-label">Valor total:</span>
                            <span class="resumo-valor" id="valorTotalSelecionado">R$ 0,00</span>
                        </div>
                    </div>
                    
                    <div class="acoes-selecao">
                        <button onclick="app.compras.adicionarProdutosSelecionados()" 
                                class="btn-primary btn-lg" 
                                id="btnAddProdutosCompra">
                            <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
                        </button>
                        <button onclick="app.compras.limparCamposProdutos()" 
                                class="btn-secondary">
                            <i class="fas fa-eraser"></i> Limpar Campos
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.atualizarResumoSelecao();
    }

    renderizarGridProdutos() {
        let produtosFiltrados = [...this.produtosDisponiveis];
        
        // Aplica filtro
        if (this.filtroAtivo === 'selecionados') {
            produtosFiltrados = produtosFiltrados.filter(p => this.produtosSelecionados.has(p.id));
        } else if (this.filtroAtivo === 'nao-selecionados') {
            produtosFiltrados = produtosFiltrados.filter(p => !this.produtosSelecionados.has(p.id));
        }
        
        // Aplica pesquisa
        if (this.termoPesquisa) {
            const termo = this.termoPesquisa.toLowerCase();
            produtosFiltrados = produtosFiltrados.filter(p => 
                p.nome.toLowerCase().includes(termo) || 
                (p.codigo && p.codigo.toLowerCase().includes(termo))
            );
        }
        
        if (produtosFiltrados.length === 0) {
            return `
                <div class="empty-grid">
                    <i class="fas fa-search" style="font-size: 40px; color: #ccc; margin-bottom: 15px;"></i>
                    <p>Nenhum produto encontrado</p>
                    <small>Tente alterar os filtros ou a pesquisa</small>
                </div>
            `;
        }
        
        return produtosFiltrados.map(p => {
            const itemNoCarrinho = this.carrinho.find(item => item.produto_id === p.id);
            const quantidade = itemNoCarrinho?.quantidade || 0;
            const valorCusto = itemNoCarrinho?.valor_custo || p.custo_unitario || 0;
            const valorVenda = itemNoCarrinho?.valor_venda || p.preco || 0;
            
            const isSelecionado = this.produtosSelecionados.has(p.id);
            const totalItem = quantidade * valorCusto;
            const estoqueBaixo = p.estoque <= p.estoque_minimo;
            const margem = this.calcularMargem(valorCusto, valorVenda);
            
            return `
                <div class="produto-grid-item ${isSelecionado ? 'selecionado' : ''} ${estoqueBaixo ? 'estoque-baixo' : ''}" 
                     id="produtoGrid_${p.id}">
                    
                    <!-- COLUNA 1: INFO DO PRODUTO -->
                    <div class="grid-col produto-info">
                        <div class="produto-check">
                            <label class="checkbox-container">
                                <input type="checkbox" 
                                       ${isSelecionado ? 'checked' : ''}
                                       onchange="app.compras.toggleSelecaoProduto(${p.id}, this.checked)">
                                <span class="checkmark"></span>
                            </label>
                        </div>
                        <div class="produto-detalhes">
                            <strong class="produto-nome">${p.nome}</strong>
                            ${p.codigo ? `<small class="produto-codigo">Cód: ${p.codigo}</small>` : ''}
                            <small class="produto-custo-anterior">
                                Custo anterior: R$ ${(p.custo_unitario || 0).toFixed(2)}
                            </small>
                        </div>
                    </div>
                    
                    <!-- COLUNA 2: ESTOQUE -->
                    <div class="grid-col produto-estoque">
                        <div class="estoque-info">
                            <span class="estoque-valor ${estoqueBaixo ? 'text-danger' : ''}">
                                ${p.estoque} ${p.unidade_medida || 'un'}
                            </span>
                            ${estoqueBaixo ? 
                                `<small class="estoque-alerta">
                                    <i class="fas fa-exclamation-triangle"></i> Mín: ${p.estoque_minimo}
                                </small>` : ''
                            }
                        </div>
                    </div>
                    
                    <!-- COLUNA 3: CAMPOS DE ENTRADA -->
                    <div class="grid-col produto-campos">
                        <div class="campos-inputs">
                            <input type="number" 
                                   placeholder="Qtd" 
                                   min="0" 
                                   value="${quantidade}"
                                   id="qtd_${p.id}"
                                   class="input-quantidade ${quantidade > 0 ? 'has-value' : ''}"
                                   oninput="app.compras.atualizarQuantidade(${p.id})"
                                   onfocus="this.select()">
                            
                            <input type="number" 
                                   placeholder="Custo" 
                                   min="0" 
                                   step="0.01"
                                   value="${valorCusto}"
                                   id="custo_${p.id}"
                                   class="input-custo ${valorCusto > 0 ? 'has-value' : ''}"
                                   oninput="app.compras.atualizarInputItem(${p.id})"
                                   onfocus="this.select()">
                            
                            <input type="number" 
                                   placeholder="Venda" 
                                   min="0" 
                                   step="0.01"
                                   value="${valorVenda}"
                                   id="venda_${p.id}"
                                   class="input-venda ${valorVenda > 0 ? 'has-value' : ''}"
                                   oninput="app.compras.atualizarInputItem(${p.id})"
                                   onfocus="this.select()">
                        </div>
                        <div class="campos-feedback" id="feedback_${p.id}"></div>
                    </div>
                    
                    <!-- COLUNA 4: TOTAL -->
                    <div class="grid-col produto-total">
                        <div class="total-item" id="total_${p.id}">
                            R$ ${totalItem.toFixed(2)}
                        </div>
                        ${quantidade > 0 && valorCusto > 0 && valorVenda > 0 ? 
                            `<small class="margem-item" id="margem_${p.id}">
                                ${margem}%
                            </small>` : ''
                        }
                    </div>
                    
                    <!-- COLUNA 5: AÇÕES -->
                    <div class="grid-col produto-acao">
                        <button class="btn-icon" 
                                onclick="app.compras.replicarValoresProduto(${p.id})"
                                title="Replicar valores para outros produtos">
                            <i class="fas fa-clone"></i>
                        </button>
                        <button class="btn-icon" 
                                onclick="app.compras.verDetalhesProduto(${p.id})"
                                title="Ver detalhes">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- NOVOS MÉTODOS PARA CONTROLE DE SELEÇÃO ---

    toggleSelecaoProduto(produtoId, selecionado) {
        const qtdInput = document.getElementById(`qtd_${produtoId}`);
        
        if (selecionado) {
            this.produtosSelecionados.add(produtoId);
            // Se selecionado e quantidade é 0, define como 1
            if (!qtdInput.value || parseInt(qtdInput.value) === 0) {
                qtdInput.value = 1;
                this.atualizarQuantidade(produtoId);
            }
        } else {
            this.produtosSelecionados.delete(produtoId);
            // Se desselecionado, zera a quantidade
            qtdInput.value = 0;
            this.atualizarQuantidade(produtoId);
        }
        
        this.atualizarResumoSelecao();
        this.filtrarProdutos(this.filtroAtivo); // Reaplica o filtro
    }

    selecionarTodosProdutos() {
        this.produtosDisponiveis.forEach(p => {
            if (!this.produtosSelecionados.has(p.id)) {
                this.produtosSelecionados.add(p.id);
                const qtdInput = document.getElementById(`qtd_${p.id}`);
                if (qtdInput && (!qtdInput.value || parseInt(qtdInput.value) === 0)) {
                    qtdInput.value = 1;
                    this.atualizarQuantidade(p.id);
                }
            }
        });
        this.atualizarResumoSelecao();
        this.renderizarGridProdutos(); // Atualiza a grid
        mostrarToast('Todos os produtos foram selecionados', 'info');
    }

    limparSelecaoProdutos() {
        this.produtosSelecionados.clear();
        this.produtosDisponiveis.forEach(p => {
            const qtdInput = document.getElementById(`qtd_${p.id}`);
            if (qtdInput) {
                qtdInput.value = 0;
                this.atualizarQuantidade(p.id);
            }
        });
        this.atualizarResumoSelecao();
        this.renderizarGridProdutos(); // Atualiza a grid
        mostrarToast('Seleção de produtos limpa', 'info');
    }

    limparCamposProdutos() {
        this.produtosDisponiveis.forEach(p => {
            ['qtd', 'custo', 'venda'].forEach(tipo => {
                const input = document.getElementById(`${tipo}_${p.id}`);
                if (input) input.value = '';
            });
            this.atualizarInputItem(p.id);
        });
        this.atualizarResumoSelecao();
        mostrarToast('Campos limpos', 'info');
    }

    filtrarProdutos(filtro) {
        this.filtroAtivo = filtro;
        this.renderizarGridProdutos();
    }

    pesquisarProdutosMultiplos() {
        const input = document.getElementById('pesquisaProdutosCompra');
        if (input) {
            this.termoPesquisa = input.value;
            this.renderizarGridProdutos();
        }
    }

    atualizarQuantidade(produtoId) {
        const qtdInput = document.getElementById(`qtd_${produtoId}`);
        const quantidade = parseInt(qtdInput.value) || 0;
        
        // Atualiza checkbox baseado na quantidade
        if (quantidade > 0) {
            this.produtosSelecionados.add(produtoId);
        } else {
            this.produtosSelecionados.delete(produtoId);
        }
        
        // Atualiza o item
        this.atualizarInputItem(produtoId);
        this.atualizarResumoSelecao();
    }

    atualizarInputItem(produtoId) {
        const produto = this.produtosDisponiveis.find(p => p.id === produtoId);
        if (!produto) return;

        const qtdInput = document.getElementById(`qtd_${produtoId}`);
        const custoInput = document.getElementById(`custo_${produtoId}`);
        const vendaInput = document.getElementById(`venda_${produtoId}`);
        const totalElement = document.getElementById(`total_${produtoId}`);
        const margemElement = document.getElementById(`margem_${produtoId}`);
        const feedbackElement = document.getElementById(`feedback_${produtoId}`);
        const gridItem = document.getElementById(`produtoGrid_${produtoId}`);

        const quantidade = parseInt(qtdInput.value) || 0;
        const valorCusto = parseFloat(custoInput.value) || 0;
        const valorVenda = parseFloat(vendaInput.value) || 0;
        const totalItem = quantidade * valorCusto;

        // Atualiza classes visuais
        if (gridItem) {
            gridItem.classList.toggle('selecionado', quantidade > 0);
        }

        // Atualiza campos de entrada
        qtdInput.classList.toggle('has-value', quantidade > 0);
        custoInput.classList.toggle('has-value', valorCusto > 0);
        vendaInput.classList.toggle('has-value', valorVenda > 0);

        // Atualiza total
        if (totalElement) {
            totalElement.textContent = `R$ ${totalItem.toFixed(2)}`;
            totalElement.style.fontWeight = totalItem > 0 ? 'bold' : 'normal';
        }

        // Atualiza margem
        if (margemElement && quantidade > 0 && valorCusto > 0 && valorVenda > 0) {
            const margem = this.calcularMargem(valorCusto, valorVenda);
            margemElement.textContent = `${margem}%`;
            margemElement.className = `margem-item ${margem >= 30 ? 'margem-alta' : margem >= 10 ? 'margem-media' : 'margem-baixa'}`;
        }

        // Feedback de validação
        if (feedbackElement) {
            feedbackElement.textContent = '';
            
            if (quantidade > 0) {
                if (valorCusto <= 0 || valorVenda <= 0) {
                    feedbackElement.textContent = 'Preencha custo e venda';
                    feedbackElement.className = 'feedback-warning';
                } else if (valorCusto > valorVenda) {
                    feedbackElement.textContent = 'Venda abaixo do custo!';
                    feedbackElement.className = 'feedback-danger';
                } else {
                    const margem = this.calcularMargem(valorCusto, valorVenda);
                    feedbackElement.textContent = `Margem: ${margem}%`;
                    feedbackElement.className = margem >= 20 ? 'feedback-success' : 'feedback-warning';
                }
            }
        }

        // Atualiza checkbox
        const checkbox = gridItem?.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = quantidade > 0;
        }

        // Atualiza contadores
        const contadorSelecionados = document.getElementById('contadorSelecionados');
        if (contadorSelecionados) {
            contadorSelecionados.textContent = `${this.produtosSelecionados.size} selecionados`;
            contadorSelecionados.className = `badge ${this.produtosSelecionados.size > 0 ? 'badge-primary' : 'badge-secondary'}`;
        }
    }

    calcularMargem(custo, venda) {
        if (!custo || custo <= 0) return 0;
        const margem = ((venda - custo) / custo * 100);
        return Math.max(0, margem).toFixed(1);
    }

    atualizarResumoSelecao() {
        let selecionados = 0;
        let quantidadeTotal = 0;
        let valorTotal = 0;
        
        this.produtosDisponiveis.forEach(p => {
            if (this.produtosSelecionados.has(p.id)) {
                const qtd = parseInt(document.getElementById(`qtd_${p.id}`)?.value || '0');
                const custo = parseFloat(document.getElementById(`custo_${p.id}`)?.value || '0');
                
                selecionados++;
                quantidadeTotal += qtd;
                valorTotal += qtd * custo;
            }
        });
        
        // Atualiza contadores na UI
        const contadorProdutosSelecionados = document.getElementById('contadorProdutosSelecionados');
        const quantidadeTotalSelecionada = document.getElementById('quantidadeTotalSelecionada');
        const valorTotalSelecionado = document.getElementById('valorTotalSelecionado');
        
        if (contadorProdutosSelecionados) contadorProdutosSelecionados.textContent = selecionados;
        if (quantidadeTotalSelecionada) quantidadeTotalSelecionada.textContent = quantidadeTotal;
        if (valorTotalSelecionado) valorTotalSelecionado.textContent = `R$ ${valorTotal.toFixed(2)}`;
    }

    replicarValoresProduto(produtoId) {
        const quantidade = document.getElementById(`qtd_${produtoId}`)?.value || '0';
        const custo = document.getElementById(`custo_${produtoId}`)?.value || '';
        const venda = document.getElementById(`venda_${produtoId}`)?.value || '';
        
        if (!quantidade || quantidade === '0') {
            mostrarToast('Defina os valores primeiro para replicar', 'warning');
            return;
        }
        
        if (confirm(`Deseja replicar os valores (Qtd: ${quantidade}, Custo: R$ ${custo}, Venda: R$ ${venda}) para todos os produtos selecionados?`)) {
            this.produtosSelecionados.forEach(id => {
                if (id !== produtoId) {
                    const qtdInput = document.getElementById(`qtd_${id}`);
                    const custoInput = document.getElementById(`custo_${id}`);
                    const vendaInput = document.getElementById(`venda_${id}`);
                    
                    if (qtdInput) qtdInput.value = quantidade;
                    if (custoInput) custoInput.value = custo;
                    if (vendaInput) vendaInput.value = venda;
                    
                    this.atualizarQuantidade(id);
                }
            });
            
            mostrarToast('Valores replicados com sucesso', 'sucesso');
        }
    }

    verDetalhesProduto(produtoId) {
        const produto = this.produtosDisponiveis.find(p => p.id === produtoId);
        if (!produto) return;
        
        let detalhes = `
            📦 DETALHES DO PRODUTO
            --------------------
            Nome: ${produto.nome}
            ${produto.codigo ? `Código: ${produto.codigo}` : ''}
            Estoque atual: ${produto.estoque} ${produto.unidade_medida || 'un'}
            Estoque mínimo: ${produto.estoque_minimo}
            --------------------
            Preço de custo: R$ ${(produto.custo_unitario || 0).toFixed(2)}
            Preço de venda: R$ ${(produto.preco || 0).toFixed(2)}
            Margem atual: ${this.calcularMargem(produto.custo_unitario, produto.preco)}%
        `;
        
        alert(detalhes);
    }

    // Método atualizado para adicionar produtos ao carrinho
    adicionarProdutosSelecionados() {
        const produtosParaAdicionar = [];
        let erros = [];
        
        // Coleta apenas produtos selecionados
        this.produtosSelecionados.forEach(produtoId => {
            const produto = this.produtosDisponiveis.find(p => p.id === produtoId);
            if (!produto) return;
            
            const quantidade = parseInt(document.getElementById(`qtd_${produtoId}`)?.value || '0');
            
            if (quantidade > 0) {
                const valorCusto = parseFloat(document.getElementById(`custo_${produtoId}`)?.value || '0');
                const valorVenda = parseFloat(document.getElementById(`venda_${produtoId}`)?.value || '0');
                
                // Validações
                if (valorCusto <= 0) {
                    erros.push(`${produto.nome}: Custo unitário deve ser maior que zero`);
                    return;
                }
                
                if (valorVenda <= 0) {
                    erros.push(`${produto.nome}: Preço de venda deve ser maior que zero`);
                    return;
                }
                
                if (valorCusto > valorVenda) {
                    erros.push(`${produto.nome}: Venda (R$ ${valorVenda.toFixed(2)}) abaixo do custo (R$ ${valorCusto.toFixed(2)})`);
                    return;
                }
                
                produtosParaAdicionar.push({
                    produtoId: produto.id,
                    produtoNome: produto.nome,
                    quantidade,
                    valorCusto,
                    valorVenda,
                    totalCusto: quantidade * valorCusto
                });
            }
        });
        
        if (erros.length > 0) {
            mostrarToast(`Erros encontrados:\n${erros.slice(0, 3).join('\n')}${erros.length > 3 ? '\n...' : ''}`, 'error');
            return;
        }
        
        if (produtosParaAdicionar.length === 0) {
            mostrarToast('Selecione ao menos um produto com quantidade > 0', 'warning');
            return;
        }
        
        // Processa cada produto
        let adicionados = 0;
        let atualizados = 0;
        
        produtosParaAdicionar.forEach(item => {
            const itemExistente = this.carrinho.find(i => i.produto_id === item.produtoId);
            
            if (itemExistente) {
                // Atualiza item existente
                Object.assign(itemExistente, {
                    quantidade: item.quantidade,
                    valor_custo: item.valorCusto,
                    valor_venda: item.valorVenda,
                    total_custo: item.totalCusto
                });
                atualizados++;
            } else {
                // Adiciona novo item
                this.carrinho.push({
                    produto_id: item.produtoId,
                    produto_nome: item.produtoNome,
                    quantidade: item.quantidade,
                    valor_custo: item.valorCusto,
                    valor_venda: item.valorVenda,
                    total_custo: item.totalCusto
                });
                adicionados++;
            }
            
            // Limpa os campos na UI
            document.getElementById(`qtd_${item.produtoId}`).value = '0';
            document.getElementById(`custo_${item.produtoId}`).value = '';
            document.getElementById(`venda_${item.produtoId}`).value = '';
            this.atualizarQuantidade(item.produtoId);
        });
        
        // Limpa seleção
        this.produtosSelecionados.clear();
        this.atualizarResumoSelecao();
        
        // Atualiza o carrinho e mostra feedback
        this.atualizarCarrinho();
        
        let mensagem = '';
        if (adicionados > 0) mensagem += `${adicionados} item(s) adicionado(s)`;
        if (atualizados > 0) {
            if (mensagem) mensagem += ' e ';
            mensagem += `${atualizados} item(s) atualizado(s)`;
        }
        
        mostrarToast(`${mensagem} ao carrinho!`, 'sucesso');
        
        // Scroll para o topo da grid
        document.querySelector('.produtos-grid-list').scrollTop = 0;
    }

    removerItem(produtoId) {
        const index = this.carrinho.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            
            // Limpa os campos na lista múltipla
            document.getElementById(`qtd_${produtoId}`).value = '0';
            document.getElementById(`custo_${produtoId}`).value = '';
            document.getElementById(`venda_${produtoId}`).value = '';
            
            // Atualiza o estado
            this.produtosSelecionados.delete(produtoId);
            this.atualizarInputItem(produtoId);
            this.atualizarCarrinho();
            
            mostrarToast('Item removido do carrinho.', 'info');
        }
    }

    atualizarFrete() {
        const inputFrete = document.getElementById('compraFrete');
        if (inputFrete) {
            this.valorFrete = parseFloat(inputFrete.value) || 0;
        }
        this.atualizarCarrinho();
    }

    atualizarCarrinho() {
        const lista = document.getElementById('itensCompraLista');
        if (!lista) return;

        if (this.carrinho.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-shopping-basket" style="font-size: 48px; color: #ccc; margin-bottom: 15px;"></i>
                    <p>Nenhum item adicionado</p>
                    <small>Selecione produtos acima para adicionar ao carrinho</small>
                </div>
            `;
            document.getElementById('subtotalCompra').textContent = '0.00';
            document.getElementById('freteCompra').textContent = this.valorFrete.toFixed(2);
            document.getElementById('totalCompra').textContent = this.valorFrete.toFixed(2);
            document.getElementById('contadorCarrinho').textContent = '0 itens';
            return;
        }

        lista.innerHTML = '';
        let subtotal = 0;

        this.carrinho.forEach(item => {
            subtotal += item.total_custo;
            
            const margem = this.calcularMargem(item.valor_custo, item.valor_venda);
            const margemClass = margem >= 30 ? 'alta' : margem >= 10 ? 'media' : 'baixa';
            
            const div = document.createElement('div');
            div.className = 'carrinho-item compra';
            div.innerHTML = `
                <div class="carrinho-item-info">
                    <h4>${item.produto_nome}</h4>
                    <p>
                        <span>Qtd: ${item.quantidade}</span> | 
                        <span>Custo: R$ ${item.valor_custo.toFixed(2)}</span> | 
                        <span>Venda: R$ ${item.valor_venda.toFixed(2)}</span>
                    </p>
                    <small class="margem-visual ${margemClass}">Margem: ${margem}%</small>
                </div>
                <div class="carrinho-item-acoes">
                    <span>R$ ${item.total_custo.toFixed(2)}</span>
                    <button class="btn-remover-item" data-id="${item.produto_id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            div.querySelector('.btn-remover-item').addEventListener('click', () => this.removerItem(item.produto_id));
            lista.appendChild(div);
        });

        const totalGeral = subtotal + this.valorFrete;

        document.getElementById('subtotalCompra').textContent = subtotal.toFixed(2);
        document.getElementById('freteCompra').textContent = this.valorFrete.toFixed(2);
        document.getElementById('totalCompra').textContent = totalGeral.toFixed(2);
        document.getElementById('contadorCarrinho').textContent = `${this.carrinho.length} ${this.carrinho.length === 1 ? 'item' : 'itens'}`;
    }

    pesquisarHistorico(termo = '') {
        termo = termo.toLowerCase();
        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        const itens = lista.querySelectorAll('.venda-item');
        let visiveis = 0;

        itens.forEach(item => {
            const texto = item.textContent.toLowerCase();
            const visivel = texto.includes(termo);
            item.style.display = visivel ? 'block' : 'none';
            if (visivel) visiveis++;
        });

        if (visiveis === 0 && termo) {
            lista.innerHTML = '<div class="empty-state">Nenhuma compra encontrada para esta pesquisa</div>';
        }
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

        setButtonLoading('finalizarCompra', true, '<i class="fas fa-spinner fa-spin"></i> Finalizando...');

        try {
            const fornecedor = this.app.fornecedores.fornecedores.find(f => f.id === this.fornecedorSelecionado);
            const subtotal = this.carrinho.reduce((sum, item) => sum + item.total_custo, 0);
            const totalCompra = subtotal + this.valorFrete;
            const usuarioLogado = this.app.auth.getUsuarioLogado();
            const observacoes = document.getElementById('compraObservacoes')?.value.trim() || '';

            // 1. Inserir Compra Principal
            const { data: compraData, error: compraError } = await supabase.from('compras').insert([{
                fornecedor_id: this.fornecedorSelecionado,
                fornecedor_nome: fornecedor.nome,
                valor_total: totalCompra,
                frete: this.valorFrete,
                observacoes: observacoes,
                usuario_id: usuarioLogado?.id,
                usuario_nome: usuarioLogado?.nome,
                data: new Date().toISOString()
            }]).select();

            if (compraError) throw compraError;

            const compraId = compraData[0].id;

            // 2. Inserir Itens da Compra
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

            // 3. Atualizar Estoque e Preços dos Produtos
            for (const item of this.carrinho) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === item.produto_id);
                if (produto) {
                    const novoEstoque = produto.estoque + item.quantidade;
                    
                    // Só atualiza se for diferente
                    if (novoEstoque !== produto.estoque || item.valor_custo !== produto.custo_unitario || item.valor_venda !== produto.preco) {
                        await supabase.from('produto').update({
                            estoque: novoEstoque,
                            custo_unitario: item.valor_custo,
                            preco: item.valor_venda
                        }).eq('id', produto.id);
                    }
                }
            }

            // 4. Limpar Estado e UI
            this.carrinho = [];
            this.fornecedorSelecionado = null;
            this.valorFrete = 0;
            this.produtosSelecionados.clear();
            
            this.atualizarCarrinho();
            document.getElementById('fornecedorSelecionadoText').textContent = 'Selecione um fornecedor';
            document.getElementById('compraObservacoes').value = '';
            document.getElementById('compraFrete').value = '0';

            // Limpa seleção do fornecedor
            document.querySelectorAll('.select-pesquisavel-item').forEach(i => i.classList.remove('selected'));

            // 5. Recarregar Listas de Dados
            await this.app.produtos.carregar();
            this.renderizarListaProdutosMultiplos();
            await this.carregar();
            this.renderizar();

            mostrarToast('Compra registrada com sucesso!', 'sucesso');
            
            if (confirm('Deseja gerar o PDF do pedido?')) {
                this.gerarPDF(compraId);
            }
        } catch (error) {
            console.error('❌ Erro ao registrar compra:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('finalizarCompra', false, '<i class="fas fa-check-circle"></i> Finalizar Compra');
        }
    }

    async verDetalhes(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) return;

        const itens = await this.carregarItens(compraId);
        
        let mensagem = `📦 DETALHES DA COMPRA\n\n`;
        mensagem += `Data: ${compra.data_exibicao}\n`;
        mensagem += `Fornecedor: ${compra.fornecedor_nome}\n`;
        if (compra.frete) mensagem += `Frete: R$ ${compra.frete.toFixed(2)}\n`;
        mensagem += `Total: R$ ${compra.valor_total.toFixed(2)}\n`;
        if (compra.observacoes) mensagem += `Observações: ${compra.observacoes}\n`;
        mensagem += `\n────────────────────────\nITENS:\n────────────────────────\n\n`;

        itens.forEach((item, index) => {
            const margem = this.calcularMargem(item.valor_custo, item.valor_venda);
            mensagem += `${index + 1}. ${item.produto_nome}\n`;
            mensagem += `    Qtd: ${item.quantidade} | Custo: R$ ${item.valor_custo.toFixed(2)} | Venda: R$ ${item.valor_venda.toFixed(2)}\n`;
            mensagem += `    Margem: ${margem}% | Total: R$ ${item.total_custo.toFixed(2)}\n\n`;
        });

        alert(mensagem);
    }

    async excluir(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) return;

        if (!confirm(`Deseja excluir esta compra de R$ ${compra.valor_total.toFixed(2)}?\nO estoque será ajustado.`)) return;

        try {
            const itens = await this.carregarItens(compraId);

            // 1. Reverter Estoque
            for (const item of itens) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === item.produto_id);
                if (produto) {
                    const novoEstoque = Math.max(0, produto.estoque - item.quantidade);
                    await supabase.from('produto').update({
                        estoque: novoEstoque
                    }).eq('id', produto.id);
                }
            }

            // 2. Excluir Compra
            const { error } = await supabase.from('compras').delete().eq('id', compraId);
            if (error) throw error;

            // 3. Atualizar Listas
            await this.app.produtos.carregar();
            await this.listar();
            mostrarToast('Compra excluída e estoque ajustado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir compra:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    async gerarPDF(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            mostrarToast('Compra não encontrada!', 'error');
            return;
        }
        
        if (!window.jspdf || !window.jspdf.jsPDF) {
            mostrarToast('Biblioteca jsPDF não carregada. Não é possível gerar o PDF.', 'error');
            return;
        }

        const itens = await this.carregarItens(compraId);
        
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;
            
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text('PEDIDO DE COMPRA', 105, y, { align: 'center' });
            
            y += 10;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Pedido #${compraId}`, 105, y, { align: 'center' });
            
            y += 15;
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('INFORMAÇÕES DO PEDIDO', 20, y);
            
            y += 8;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Fornecedor: ${compra.fornecedor_nome}`, 20, y);
            
            y += 6;
            doc.text(`Data: ${compra.data_exibicao}`, 20, y);
            
            if (compra.usuario_nome) {
                y += 6;
                doc.text(`Solicitante: ${compra.usuario_nome}`, 20, y);
            }
            
            if (compra.observacoes) {
                y += 6;
                doc.setFont(undefined, 'bold');
                doc.text(`Observações:`, 20, y);
                doc.setFont(undefined, 'normal');
                
                const obsText = doc.splitTextToSize(compra.observacoes, 150);
                y += 4;
                doc.text(obsText, 20, y);
                y += obsText.length * 5;
            }
            
            y += 5;

            if (y > 250) {
                doc.addPage();
                y = 20;
            }
            
            doc.setDrawColor(200, 200, 200);
            doc.line(20, y, 190, y);
            
            y += 10;
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('PRODUTOS SOLICITADOS', 20, y);
            
            y += 10;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Produto', 20, y);
            doc.text('Qtd', 110, y);
            doc.text('Custo Un.', 135, y);
            doc.text('Total', 170, y, { align: 'right' });
            
            y += 2;
            doc.line(20, y, 190, y);
            
            y += 6;
            
            doc.setFont(undefined, 'normal');
            const subtotal = itens.reduce((sum, item) => sum + item.total_custo, 0);
            
            itens.forEach(item => {
                if (y > 250) {
                    doc.addPage();
                    y = 20;
                    doc.setFontSize(9);
                    doc.setFont(undefined, 'bold');
                    doc.text('Produto', 20, y);
                    doc.text('Qtd', 110, y);
                    doc.text('Custo Un.', 135, y);
                    doc.text('Total', 170, y, { align: 'right' });
                    y += 2;
                    doc.line(20, y, 190, y);
                    y += 6;
                    doc.setFont(undefined, 'normal');
                }
                
                const nomeProduto = item.produto_nome.length > 45 
                    ? item.produto_nome.substring(0, 42) + '...' 
                    : item.produto_nome;
                
                doc.text(nomeProduto, 20, y);
                doc.text(item.quantidade.toString(), 110, y);
                doc.text(`R$ ${item.valor_custo.toFixed(2)}`, 135, y);
                doc.text(`R$ ${item.total_custo.toFixed(2)}`, 170, y, { align: 'right' });
                
                y += 6;
            });
            
            y += 4;
            doc.line(110, y, 190, y);
            y += 8;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text('Subtotal Produtos:', 110, y);
            doc.text(`R$ ${subtotal.toFixed(2)}`, 170, y, { align: 'right' });
            
            if (compra.frete && compra.frete > 0) {
                y += 6;
                doc.text('Frete:', 110, y);
                doc.text(`R$ ${compra.frete.toFixed(2)}`, 170, y, { align: 'right' });
            }
            
            y += 10;
            doc.setDrawColor(100, 100, 100);
            doc.line(110, y, 190, y);
            
            y += 8;
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('TOTAL DO PEDIDO:', 110, y);
            doc.text(`R$ ${compra.valor_total.toFixed(2)}`, 170, y, { align: 'right' });
            
            // Números de página
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.text(`Página ${i} de ${pageCount}`, 105, 285, { align: 'center' });
                doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 290, { align: 'center' });
            }
            
            const nomeArquivo = `Pedido_Compra_${compraId}_${compra.fornecedor_nome.replace(/\s+/g, '_')}.pdf`;
            doc.save(nomeArquivo);
            
            mostrarToast('PDF gerado com sucesso!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao gerar PDF:', error);
            mostrarToast('Erro ao gerar PDF. Verifique se o jsPDF está carregado e se a estrutura da página está correta.', 'error');
        }
    }
}

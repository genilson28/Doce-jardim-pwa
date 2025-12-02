// ==================== MÓDULO COMPRAS - VERSÃO CORRIGIDA ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
        this.produtosSelecionados = [];
        this.fornecedorSelecionado = null;
        this.valorFrete = 0;
        this.cacheCompras = {
            data: null,
            timestamp: null
        };
        this.cacheTtl = 30000; // 30 segundos
        
        // Inicializar globalmente para acesso via onclick
        window.app = window.app || {};
        window.app.compras = this;
    }

    // ==================== UTILITÁRIOS LOCAIS ====================
    formatarMoeda(valor) {
        if (typeof valor !== 'number') {
            valor = parseFloat(valor) || 0;
        }
        return valor.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    sanitizarHTML(texto) {
        if (typeof texto !== 'string') return texto;
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        };
        
        return texto.replace(/[&<>"']/g, (m) => map[m]);
    }

    formatarDataHoraCorreta(dataString) {
        try {
            const data = new Date(dataString);
            return data.toLocaleString('pt-BR');
        } catch (e) {
            return dataString;
        }
    }

    validarNumeroPositivo(valor, campo = '') {
        const num = parseFloat(valor);
        if (isNaN(num) || num < 0) {
            mostrarToast(`${campo} deve ser um número positivo`, 'warning');
            return false;
        }
        return true;
    }

    handleSupabaseError(error) {
        console.error('Erro Supabase:', error);
        
        if (error.code === '23505') {
            return 'Registro duplicado!';
        } else if (error.code === '23503') {
            return 'Não é possível excluir - existem registros relacionados!';
        } else if (error.message.includes('NetworkError')) {
            return 'Erro de conexão. Verifique sua internet.';
        } else if (error.message.includes('JWT')) {
            return 'Sessão expirada. Faça login novamente.';
        }
        
        return error.message || 'Erro ao processar operação';
    }

    // ==================== CACHE ====================
    cacheEstaValido() {
        if (!this.cacheCompras.timestamp) return false;
        return (Date.now() - this.cacheCompras.timestamp) < this.cacheTtl;
    }

    invalidarCache() {
        this.cacheCompras.data = null;
        this.cacheCompras.timestamp = null;
    }

    // ==================== CARREGAMENTO DE DADOS ====================
    async carregar(forcarRecarregar = false) {
        try {
            if (!forcarRecarregar && this.cacheEstaValido()) {
                return this.cacheCompras.data;
            }

            const { data, error } = await supabase
                .from('compras')
                .select('*')
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            this.compras = (data || []).map(compra => ({
                ...compra,
                data_exibicao: this.formatarDataHoraCorreta(compra.data),
                total_itens: 0 // Será carregado separadamente
            }));

            // Carregar contagem de itens para cada compra
            for (const compra of this.compras) {
                const itens = await this.carregarItens(compra.id);
                compra.total_itens = itens.length;
            }

            // Atualizar cache
            this.cacheCompras.data = this.compras;
            this.cacheCompras.timestamp = Date.now();
            
            return this.compras;
        } catch (error) {
            console.error('❌ Erro ao carregar compras:', error);
            mostrarToast(this.handleSupabaseError(error), 'error');
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

    // ==================== VALIDAÇÕES ====================
    validarDadosCompra() {
        const erros = [];
        
        if (!this.fornecedorSelecionado) {
            erros.push('Selecione um fornecedor');
        }
        
        if (this.carrinho.length === 0) {
            erros.push('Adicione ao menos um produto ao carrinho');
        }
        
        if (this.valorFrete < 0) {
            erros.push('O valor do frete não pode ser negativo');
        }
        
        if (isNaN(this.valorFrete)) {
            erros.push('Valor do frete inválido');
        }
        
        this.carrinho.forEach((item, index) => {
            if (!item.quantidade || item.quantidade <= 0) {
                erros.push(`Item ${index + 1}: Quantidade inválida`);
            }
            if (!item.valor_custo || item.valor_custo <= 0) {
                erros.push(`Item ${index + 1}: Custo unitário inválido`);
            }
            if (!item.valor_venda || item.valor_venda <= 0) {
                erros.push(`Item ${index + 1}: Preço de venda inválido`);
            }
            if (item.valor_venda < item.valor_custo) {
                erros.push(`Item ${index + 1}: Preço de venda menor que custo`);
            }
        });
        
        return erros;
    }

    validarEstoqueParaExclusao(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) return { valido: false, motivo: 'Compra não encontrada' };

        const problemas = [];
        
        // Carregar itens da compra
        const itens = compra.compras_itens || [];
        itens.forEach(item => {
            const produto = this.app.produtos?.getProdutos?.().find(p => p.id === item.produto_id);
            if (produto && item.quantidade > produto.estoque) {
                problemas.push({
                    produto: item.produto_nome,
                    estoque_atual: produto.estoque,
                    quantidade_remover: item.quantidade,
                    deficit: item.quantidade - produto.estoque
                });
            }
        });

        return {
            valido: problemas.length === 0,
            problemas,
            compra
        };
    }

    // ==================== UI - LISTAGEM ====================
    async listar() {
        try {
            // Carregar dados em paralelo
            await Promise.all([
                this.carregar(false),
                this.app.fornecedores?.carregar?.(),
                this.app.produtos?.carregar?.()
            ].filter(p => p !== undefined));
            
            if (this.app.pagination) {
                this.app.pagination.setup(this.compras, 10);
                this.renderizarLista();
            } else {
                this.renderizarListaSemPaginacao();
            }
            
            this.inicializarSelectFornecedor();
            this.renderizarListaProdutosMultiplos();
        } catch (error) {
            console.error('❌ Erro ao listar compras:', error);
            mostrarToast('Erro ao carregar dados', 'error');
        }
    }

    renderizarListaSemPaginacao() {
        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        if (this.compras.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="empty-icon">📦</i>
                    <p>Nenhuma compra registrada</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = '';
        this.compras.forEach(compra => {
            const div = document.createElement('div');
            div.className = 'compra-item card';
            div.setAttribute('data-compra-id', compra.id);
            
            const subtotal = compra.valor_total - (compra.frete || 0);
            
            div.innerHTML = `
                <div class="compra-item-header">
                    <div class="compra-info">
                        <strong class="compra-data">📦 ${compra.data_exibicao}</strong>
                        <span class="compra-status">${compra.total_itens || 0} itens</span>
                    </div>
                    <div class="compra-valores">
                        <div class="valor-total">R$ ${this.formatarMoeda(compra.valor_total)}</div>
                        ${compra.frete ? `<small class="valor-frete">Frete: R$ ${this.formatarMoeda(compra.frete)}</small>` : ''}
                    </div>
                </div>
                
                <div class="compra-item-body">
                    <p><strong>Fornecedor:</strong> ${this.sanitizarHTML(compra.fornecedor_nome)}</p>
                    ${compra.usuario_nome ? `<p><strong>Registrado por:</strong> ${this.sanitizarHTML(compra.usuario_nome)}</p>` : ''}
                    ${compra.observacoes ? `<p><strong>Observações:</strong> ${this.sanitizarHTML(compra.observacoes)}</p>` : ''}
                    
                    <div class="compra-item-footer">
                        <button onclick="app.compras.verDetalhes(${compra.id})" 
                                class="btn-secondary">
                            📋 Detalhes
                        </button>
                        <button onclick="app.compras.gerarPDF(${compra.id})" 
                                class="btn-info">
                            📄 PDF
                        </button>
                        <button onclick="app.compras.excluir(${compra.id})" 
                                class="btn-danger">
                            🗑️ Excluir
                        </button>
                    </div>
                </div>
            `;
            lista.appendChild(div);
        });
    }

    renderizarLista() {
        if (!this.app.pagination) {
            this.renderizarListaSemPaginacao();
            return;
        }

        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        if (this.app.pagination.filteredData.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="empty-icon">📦</i>
                    <p>Nenhuma compra registrada</p>
                </div>
            `;
            this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizarLista.bind(this));
            return;
        }

        lista.innerHTML = '';
        this.app.pagination.getPageItems().forEach(compra => {
            const div = document.createElement('div');
            div.className = 'compra-item card';
            div.setAttribute('data-compra-id', compra.id);
            
            const subtotal = compra.valor_total - (compra.frete || 0);
            
            div.innerHTML = `
                <div class="compra-item-header">
                    <div class="compra-info">
                        <strong class="compra-data">📦 ${compra.data_exibicao}</strong>
                        <span class="compra-status">${compra.total_itens || 0} itens</span>
                    </div>
                    <div class="compra-valores">
                        <div class="valor-total">R$ ${this.formatarMoeda(compra.valor_total)}</div>
                        ${compra.frete ? `<small class="valor-frete">Frete: R$ ${this.formatarMoeda(compra.frete)}</small>` : ''}
                    </div>
                </div>
                
                <div class="compra-item-body">
                    <p><strong>Fornecedor:</strong> ${this.sanitizarHTML(compra.fornecedor_nome)}</p>
                    ${compra.usuario_nome ? `<p><strong>Registrado por:</strong> ${this.sanitizarHTML(compra.usuario_nome)}</p>` : ''}
                    ${compra.observacoes ? `<p><strong>Observações:</strong> ${this.sanitizarHTML(compra.observacoes)}</p>` : ''}
                    
                    <div class="compra-item-footer">
                        <button onclick="app.compras.verDetalhes(${compra.id})" 
                                class="btn-secondary">
                            📋 Detalhes
                        </button>
                        <button onclick="app.compras.gerarPDF(${compra.id})" 
                                class="btn-info">
                            📄 PDF
                        </button>
                        <button onclick="app.compras.excluir(${compra.id})" 
                                class="btn-danger">
                            🗑️ Excluir
                        </button>
                    </div>
                </div>
            `;
            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizarLista.bind(this));
    }

    // ==================== UI - FORNECEDOR ====================
    inicializarSelectFornecedor() {
        const selectOriginal = document.getElementById('compraFornecedor');
        if (!selectOriginal) return;

        const container = document.createElement('div');
        container.className = 'select-container';
        container.id = 'compraFornecedorContainer';
        selectOriginal.parentNode.replaceChild(container, selectOriginal);

        const fornecedoresAtivos = this.app.fornecedores?.getFornecedoresAtivos?.() || [];

        container.innerHTML = `
            <div class="select-pesquisavel">
                <div class="select-pesquisavel-header" 
                     onclick="app.compras.toggleFornecedorDropdown()"
                     tabindex="0">
                    <span id="fornecedorSelecionadoText" class="placeholder">Selecione um fornecedor</span>
                    <span class="select-arrow">▼</span>
                </div>
                <div class="select-pesquisavel-dropdown" 
                     id="selectFornecedorDropdown" 
                     style="display: none;">
                    <div class="select-pesquisavel-search">
                        <input 
                            type="text" 
                            id="searchFornecedor" 
                            placeholder="🔍 Pesquisar fornecedor..."
                            autocomplete="off"
                            oninput="app.compras.pesquisarFornecedor(this.value)"
                        >
                    </div>
                    <div class="select-pesquisavel-list" id="listaFornecedores">
                        ${fornecedoresAtivos.map(f => `
                            <div class="select-pesquisavel-item" 
                                 data-id="${f.id}"
                                 data-nome="${this.sanitizarHTML(f.nome)}"
                                 onclick="app.compras.selecionarFornecedor(${f.id})"
                                 tabindex="-1">
                                <strong>${this.sanitizarHTML(f.nome)}</strong>
                                ${f.contato ? `<small>${this.sanitizarHTML(f.contato)}</small>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    toggleFornecedorDropdown() {
        const dropdown = document.getElementById('selectFornecedorDropdown');
        if (!dropdown) return;
        
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            dropdown.style.display = 'block';
            setTimeout(() => {
                const searchInput = document.getElementById('searchFornecedor');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }

    pesquisarFornecedor(termo) {
        const lista = document.getElementById('listaFornecedores');
        if (!lista) return;
        
        const itens = lista.querySelectorAll('.select-pesquisavel-item');
        termo = termo.toLowerCase().trim();
        
        itens.forEach(item => {
            const nome = item.dataset.nome.toLowerCase();
            const contato = item.textContent.toLowerCase();
            item.style.display = nome.includes(termo) || contato.includes(termo) ? 'block' : 'none';
        });
    }

    selecionarFornecedor(id) {
        if (!this.app.fornecedores?.getFornecedorById) {
            mostrarToast('Módulo de fornecedores não disponível', 'error');
            return;
        }

        const fornecedor = this.app.fornecedores.getFornecedorById(id);
        if (!fornecedor) {
            mostrarToast('Fornecedor não encontrado', 'warning');
            return;
        }

        this.fornecedorSelecionado = id;
        
        // Atualizar UI
        document.getElementById('fornecedorSelecionadoText').textContent = fornecedor.nome;
        document.getElementById('fornecedorSelecionadoText').classList.remove('placeholder');
        
        // Remover seleção anterior
        document.querySelectorAll('.select-pesquisavel-item').forEach(i => {
            i.classList.remove('selected');
        });
        
        // Adicionar nova seleção
        const itemSelecionado = document.querySelector(`[data-id="${id}"]`);
        if (itemSelecionado) {
            itemSelecionado.classList.add('selected');
            itemSelecionado.scrollIntoView({ block: 'nearest' });
        }
        
        // Fechar dropdown
        this.fecharDropdownFornecedor();
    }

    fecharDropdownFornecedor() {
        const dropdown = document.getElementById('selectFornecedorDropdown');
        if (!dropdown) return;
        
        dropdown.style.display = 'none';
        const searchInput = document.getElementById('searchFornecedor');
        if (searchInput) searchInput.value = '';
        
        // Resetar pesquisa
        this.pesquisarFornecedor('');
    }

    // ==================== UI - PRODUTOS ====================
    renderizarListaProdutosMultiplos() {
        const container = document.getElementById('listaProdutosMultiplos');
        if (!container) return;

        const produtos = this.app.produtos?.getProdutos?.() || [];
        
        if (produtos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Nenhum produto cadastrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="produtos-multiplos-header">
                <input type="text" 
                       id="pesquisaProdutosCompra" 
                       placeholder="🔍 Pesquisar produtos..." 
                       oninput="app.compras.pesquisarProdutosMultiplos(this.value)"
                       class="pesquisa-produto">
            </div>
            
            <div class="produtos-multiplos-info">
                <small>Selecione os produtos e preencha os valores</small>
            </div>
            
            <div class="produtos-multiplos-lista" id="produtosMultiplosLista">
                ${produtos.map(p => `
                    <div class="produto-multiplo-item" 
                         data-produto-id="${p.id}">
                        <div class="produto-multiplo-checkbox">
                            <input type="checkbox" 
                                   id="prod_${p.id}" 
                                   value="${p.id}"
                                   onchange="app.compras.toggleProdutoSelecao(${p.id})">
                        </div>
                        <div class="produto-multiplo-info">
                            <label for="prod_${p.id}">
                                <strong>${this.sanitizarHTML(p.nome)}</strong>
                                <small>
                                    Estoque: ${p.estoque || 0} | 
                                    Custo: R$ ${this.formatarMoeda(p.custo_unitario || 0)} | 
                                    Venda: R$ ${this.formatarMoeda(p.preco || 0)}
                                </small>
                            </label>
                        </div>
                        <div class="produto-multiplo-campos" id="campos_${p.id}" style="display: none;">
                            <div class="input-group">
                                <label for="qtd_${p.id}" class="input-label">Qtd</label>
                                <input type="number" 
                                       id="qtd_${p.id}" 
                                       min="1" 
                                       value="1" 
                                       class="input-pequeno"
                                       onchange="app.compras.validarCampoProduto(${p.id}, 'quantidade')">
                            </div>
                            <div class="input-group">
                                <label for="custo_${p.id}" class="input-label">Custo (R$)</label>
                                <input type="number" 
                                       id="custo_${p.id}" 
                                       min="0.01" 
                                       step="0.01" 
                                       value="${((p.custo_unitario || 0)).toFixed(2)}"
                                       class="input-pequeno"
                                       onchange="app.compras.validarCampoProduto(${p.id}, 'custo')">
                            </div>
                            <div class="input-group">
                                <label for="venda_${p.id}" class="input-label">Venda (R$)</label>
                                <input type="number" 
                                       id="venda_${p.id}" 
                                       min="0.01" 
                                       step="0.01" 
                                       value="${((p.preco || 0)).toFixed(2)}"
                                       class="input-pequeno"
                                       onchange="app.compras.validarCampoProduto(${p.id}, 'venda')">
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="produtos-multiplos-actions">
                <button onclick="app.compras.adicionarProdutosSelecionados()" 
                        class="btn-primary"
                        id="btnAdicionarProdutos">
                    ➕ Adicionar Produtos Selecionados
                </button>
            </div>
        `;
    }

    pesquisarProdutosMultiplos(termo) {
        const itens = document.querySelectorAll('.produto-multiplo-item');
        if (!itens.length) return;
        
        termo = termo.toLowerCase().trim();
        
        itens.forEach(item => {
            const texto = item.textContent.toLowerCase();
            item.style.display = texto.includes(termo) ? 'flex' : 'none';
        });
    }

    validarCampoProduto(produtoId, campo) {
        const input = document.getElementById(`${campo}_${produtoId}`);
        if (!input) return false;
        
        const valor = input.value;
        const numero = parseFloat(valor);
        
        if (isNaN(numero) || numero <= 0) {
            input.classList.add('input-error');
            return false;
        }
        
        input.classList.remove('input-error');
        
        // Validar se venda >= custo
        if (campo === 'venda' || campo === 'custo') {
            const custoInput = document.getElementById(`custo_${produtoId}`);
            const vendaInput = document.getElementById(`venda_${produtoId}`);
            
            if (custoInput && vendaInput) {
                const custo = parseFloat(custoInput.value);
                const venda = parseFloat(vendaInput.value);
                
                if (venda < custo) {
                    vendaInput.classList.add('input-error');
                    mostrarToast('Preço de venda não pode ser menor que o custo', 'warning', 3000);
                    return false;
                }
            }
        }
        
        return true;
    }

    toggleProdutoSelecao(produtoId) {
        const checkbox = document.getElementById(`prod_${produtoId}`);
        const campos = document.getElementById(`campos_${produtoId}`);
        
        if (!checkbox || !campos) return;
        
        if (checkbox.checked) {
            campos.style.display = 'flex';
            
            // Validar campos ao selecionar
            const camposValidos = ['quantidade', 'custo', 'venda'].every(campo => 
                this.validarCampoProduto(produtoId, campo)
            );
            
            if (!camposValidos) {
                checkbox.checked = false;
                campos.style.display = 'none';
                return;
            }
            
            if (!this.produtosSelecionados.includes(produtoId)) {
                this.produtosSelecionados.push(produtoId);
            }
        } else {
            campos.style.display = 'none';
            this.produtosSelecionados = this.produtosSelecionados.filter(id => id !== produtoId);
        }
    }

    // ==================== CARRINHO ====================
    adicionarProdutosSelecionados() {
        if (this.produtosSelecionados.length === 0) {
            mostrarToast('Selecione ao menos um produto!', 'warning');
            return;
        }

        const erros = [];
        const adicionados = [];

        this.produtosSelecionados.forEach(produtoId => {
            const quantidadeInput = document.getElementById(`qtd_${produtoId}`);
            const custoInput = document.getElementById(`custo_${produtoId}`);
            const vendaInput = document.getElementById(`venda_${produtoId}`);

            if (!quantidadeInput || !custoInput || !vendaInput) {
                erros.push('Campos não encontrados');
                return;
            }

            const quantidade = parseFloat(quantidadeInput.value);
            const valorCusto = parseFloat(custoInput.value);
            const valorVenda = parseFloat(vendaInput.value);

            // Validações
            if (!quantidade || quantidade <= 0) {
                erros.push('Quantidade inválida');
                return;
            }

            if (!valorCusto || valorCusto <= 0) {
                erros.push('Custo unitário inválido');
                return;
            }

            if (!valorVenda || valorVenda <= 0) {
                erros.push('Preço de venda inválido');
                return;
            }

            if (valorVenda < valorCusto) {
                erros.push('Preço de venda menor que custo');
                return;
            }

            const produtos = this.app.produtos?.getProdutos?.() || [];
            const produto = produtos.find(p => p.id === produtoId);
            if (!produto) {
                erros.push('Produto não encontrado');
                return;
            }

            // Adicionar ao carrinho
            const itemExistente = this.carrinho.find(item => item.produto_id === produtoId);
            
            if (itemExistente) {
                itemExistente.quantidade += quantidade;
                itemExistente.total_custo = itemExistente.quantidade * itemExistente.valor_custo;
                itemExistente.total_venda = itemExistente.quantidade * itemExistente.valor_venda;
            } else {
                this.carrinho.push({
                    produto_id: produtoId,
                    produto_nome: produto.nome,
                    quantidade: quantidade,
                    valor_custo: valorCusto,
                    valor_venda: valorVenda,
                    total_custo: quantidade * valorCusto,
                    total_venda: quantidade * valorVenda
                });
            }

            // Resetar campos
            const checkbox = document.getElementById(`prod_${produtoId}`);
            if (checkbox) checkbox.checked = false;
            
            const campos = document.getElementById(`campos_${produtoId}`);
            if (campos) campos.style.display = 'none';
            
            quantidadeInput.value = '1';
            custoInput.value = (produto.custo_unitario || 0).toFixed(2);
            vendaInput.value = (produto.preco || 0).toFixed(2);
            
            adicionados.push(produto.nome);
        });

        this.produtosSelecionados = [];

        if (erros.length > 0) {
            mostrarToast(`Erros encontrados:\n${erros.slice(0, 3).join('\n')}`, 'warning');
        }

        if (adicionados.length > 0) {
            this.atualizarCarrinho();
            mostrarToast(`${adicionados.length} produto(s) adicionado(s) ao carrinho!`, 'sucesso');
        }
    }

    removerItem(produtoId) {
        const index = this.carrinho.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            const produtoNome = this.carrinho[index].produto_nome;
            this.carrinho.splice(index, 1);
            this.atualizarCarrinho();
            mostrarToast(`${produtoNome} removido do carrinho`, 'info');
        }
    }

    atualizarQuantidadeItem(produtoId, novaQuantidade) {
        const item = this.carrinho.find(item => item.produto_id === produtoId);
        if (!item || novaQuantidade <= 0) return;
        
        item.quantidade = parseFloat(novaQuantidade);
        item.total_custo = item.quantidade * item.valor_custo;
        item.total_venda = item.quantidade * item.valor_venda;
        this.atualizarCarrinho();
    }

    atualizarFrete() {
        const inputFrete = document.getElementById('compraFrete');
        if (!inputFrete) return;
        
        const valor = parseFloat(inputFrete.value);
        
        if (isNaN(valor) || valor < 0) {
            inputFrete.classList.add('input-error');
            this.valorFrete = 0;
        } else {
            inputFrete.classList.remove('input-error');
            this.valorFrete = valor;
        }
        
        this.atualizarCarrinho();
    }

    atualizarCarrinho() {
        const lista = document.getElementById('itensCompraLista');
        if (!lista) return;

        if (this.carrinho.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="empty-icon">🛒</i>
                    <p>Carrinho vazio</p>
                    <small>Adicione produtos usando o seletor acima</small>
                </div>
            `;
            this.atualizarTotais(0);
            return;
        }

        lista.innerHTML = '';
        let subtotal = 0;
        let subtotalVenda = 0;

        this.carrinho.forEach(item => {
            subtotal += item.total_custo;
            subtotalVenda += item.total_venda;
            
            const margem = ((item.valor_venda - item.valor_custo) / item.valor_custo * 100);
            const margemTotal = ((item.total_venda - item.total_custo) / item.total_custo * 100);
            
            const div = document.createElement('div');
            div.className = 'carrinho-item card';
            div.innerHTML = `
                <div class="carrinho-item-header">
                    <h4>${this.sanitizarHTML(item.produto_nome)}</h4>
                    <button onclick="app.compras.removerItem(${item.produto_id})" 
                            class="btn-icon btn-danger">
                        🗑️
                    </button>
                </div>
                
                <div class="carrinho-item-body">
                    <div class="item-info-row">
                        <div class="item-info-col">
                            <label>Quantidade:</label>
                            <input type="number" 
                                   min="1" 
                                   value="${item.quantidade}"
                                   onchange="app.compras.atualizarQuantidadeItem(${item.produto_id}, this.value)"
                                   class="input-quantidade">
                        </div>
                        <div class="item-info-col">
                            <label>Custo Unitário:</label>
                            <span class="valor">R$ ${this.formatarMoeda(item.valor_custo)}</span>
                        </div>
                        <div class="item-info-col">
                            <label>Venda Unitária:</label>
                            <span class="valor">R$ ${this.formatarMoeda(item.valor_venda)}</span>
                        </div>
                    </div>
                    
                    <div class="item-margens">
                        <span class="margem-item ${margem >= 0 ? 'margem-positiva' : 'margem-negativa'}">
                            Margem: ${margem.toFixed(1)}%
                        </span>
                        <span class="margem-total ${margemTotal >= 0 ? 'margem-positiva' : 'margem-negativa'}">
                            Margem Total: ${margemTotal.toFixed(1)}%
                        </span>
                    </div>
                </div>
                
                <div class="carrinho-item-footer">
                    <div class="item-total">
                        <strong>Total Custo:</strong>
                        <span class="valor-total">R$ ${this.formatarMoeda(item.total_custo)}</span>
                    </div>
                    <div class="item-total">
                        <strong>Total Venda:</strong>
                        <span class="valor-total valor-venda">R$ ${this.formatarMoeda(item.total_venda)}</span>
                    </div>
                </div>
            `;
            lista.appendChild(div);
        });

        this.atualizarTotais(subtotal, subtotalVenda);
    }

    atualizarTotais(subtotal = 0, subtotalVenda = 0) {
        const totalCompra = subtotal + this.valorFrete;
        const margemTotal = subtotalVenda > 0 ? ((subtotalVenda - totalCompra) / totalCompra * 100) : 0;
        
        // Atualizar elementos da UI
        const elementos = {
            'subtotalCompra': subtotal,
            'freteCompra': this.valorFrete,
            'totalCompra': totalCompra
        };
        
        Object.entries(elementos).forEach(([id, valor]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = this.formatarMoeda(valor);
            }
        });
        
        // Atualizar resumo para PDF
        this.resumoCompra = {
            subtotal,
            frete: this.valorFrete,
            total: totalCompra,
            total_venda: subtotalVenda,
            margem_total: margemTotal
        };
    }

    // ==================== FINALIZAÇÃO ====================
    async finalizar() {
        // Validar dados
        const erros = this.validarDadosCompra();
        if (erros.length > 0) {
            mostrarToast(`Corrija os seguintes erros:\n${erros.join('\n')}`, 'error');
            return;
        }

        const fornecedor = this.app.fornecedores?.getFornecedorById?.(this.fornecedorSelecionado);
        if (!fornecedor) {
            mostrarToast('Fornecedor não encontrado', 'error');
            return;
        }

        // Confirmar com usuário
        const confirmacao = confirm(`
            Confirmar Compra:
            
            Fornecedor: ${fornecedor.nome}
            Itens: ${this.carrinho.length}
            Subtotal: R$ ${this.formatarMoeda(this.resumoCompra.subtotal)}
            Frete: R$ ${this.formatarMoeda(this.resumoCompra.frete)}
            Total: R$ ${this.formatarMoeda(this.resumoCompra.total)}
            
            Deseja registrar esta compra?
        `);

        if (!confirmacao) return;

        const btnFinalizar = document.getElementById('finalizarCompra');
        if (btnFinalizar) {
            btnFinalizar.disabled = true;
            btnFinalizar.textContent = 'Processando...';
        }

        try {
            const usuarioLogado = this.app.auth?.getUsuarioLogado?.();
            const observacoes = document.getElementById('compraObservacoes')?.value.trim() || '';
            const frete = this.valorFrete || 0;

            // Criar compra
            const { data: compraData, error: compraError } = await supabase
                .from('compras')
                .insert([{
                    fornecedor_id: this.fornecedorSelecionado,
                    fornecedor_nome: fornecedor.nome,
                    valor_total: this.resumoCompra.total,
                    frete: frete,
                    observacoes: observacoes,
                    usuario_id: usuarioLogado?.id,
                    usuario_nome: usuarioLogado?.nome,
                    data: new Date().toISOString()
                }])
                .select();

            if (compraError) throw compraError;

            const compraId = compraData[0].id;

            // Preparar itens
            const itensParaInserir = this.carrinho.map(item => ({
                compra_id: compraId,
                produto_id: item.produto_id,
                produto_nome: item.produto_nome,
                quantidade: item.quantidade,
                valor_custo: item.valor_custo,
                valor_venda: item.valor_venda,
                total_custo: item.total_custo,
                total_venda: item.total_venda
            }));

            // Inserir itens
            const { error: itensError } = await supabase
                .from('compras_itens')
                .insert(itensParaInserir);

            if (itensError) throw itensError;

            // Atualizar estoque e preços dos produtos
            const atualizacoesPromises = this.carrinho.map(async (item) => {
                const produtos = this.app.produtos?.getProdutos?.() || [];
                const produto = produtos.find(p => p.id === item.produto_id);
                if (!produto) return;

                const novoEstoque = (produto.estoque || 0) + item.quantidade;
                
                return supabase
                    .from('produto')
                    .update({
                        estoque: novoEstoque,
                        custo_unitario: item.valor_custo,
                        preco: item.valor_venda
                    })
                    .eq('id', produto.id);
            });

            await Promise.all(atualizacoesPromises);

            // Limpar formulário
            this.limparFormulario();

            // Atualizar cache e UI
            this.invalidarCache();
            if (this.app.produtos?.carregar) {
                await this.app.produtos.carregar(true);
            }
            await this.listar();

            mostrarToast('✅ Compra registrada com sucesso!', 'sucesso');

            // Oferecer gerar PDF
            setTimeout(() => {
                const gerarPDF = confirm('Deseja gerar o PDF do pedido agora?');
                if (gerarPDF) {
                    this.gerarPDF(compraId);
                }
            }, 1000);

        } catch (error) {
            console.error('❌ Erro ao registrar compra:', error);
            mostrarToast(this.handleSupabaseError(error), 'error');
        } finally {
            const btnFinalizar = document.getElementById('finalizarCompra');
            if (btnFinalizar) {
                btnFinalizar.disabled = false;
                btnFinalizar.textContent = 'Finalizar Compra';
            }
        }
    }

    limparFormulario() {
        this.carrinho = [];
        this.fornecedorSelecionado = null;
        this.valorFrete = 0;
        this.produtosSelecionados = [];
        
        // Resetar UI
        const fornecedorText = document.getElementById('fornecedorSelecionadoText');
        if (fornecedorText) {
            fornecedorText.textContent = 'Selecione um fornecedor';
            fornecedorText.classList.add('placeholder');
        }
        
        document.querySelectorAll('.select-pesquisavel-item').forEach(i => {
            i.classList.remove('selected');
        });
        
        const elementos = ['compraObservacoes', 'compraFrete'];
        elementos.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (id === 'compraFrete') {
                    element.value = '0';
                } else {
                    element.value = '';
                }
            }
        });
        
        this.atualizarCarrinho();
        this.renderizarListaProdutosMultiplos();
    }

    // ==================== DETALHES E VISUALIZAÇÃO ====================
    async verDetalhes(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            mostrarToast('Compra não encontrada', 'error');
            return;
        }

        const itens = await this.carregarItens(compraId);
        
        let mensagem = `
            📦 DETALHES DA COMPRA #${compraId}
            ${'─'.repeat(40)}
            
            📅 Data: ${compra.data_exibicao}
            👤 Fornecedor: ${compra.fornecedor_nome}
            👥 Registrado por: ${compra.usuario_nome || 'Não informado'}
            
            ${'─'.repeat(40)}
            📊 RESUMO FINANCEIRO:
            ${'─'.repeat(40)}
            
            Subtotal dos produtos: R$ ${this.formatarMoeda(compra.valor_total - (compra.frete || 0))}
            ${compra.frete ? `Frete: R$ ${this.formatarMoeda(compra.frete)}` : ''}
            ${'─'.repeat(40)}
            🎯 TOTAL DA COMPRA: R$ ${this.formatarMoeda(compra.valor_total)}
            
            ${compra.observacoes ? `\n📝 Observações:\n${compra.observacoes}\n` : ''}
            
            ${'─'.repeat(40)}
            🛒 ITENS DA COMPRA (${itens.length}):
            ${'─'.repeat(40)}
        `;

        itens.forEach((item, index) => {
            const margem = ((item.valor_venda - item.valor_custo) / item.valor_custo * 100).toFixed(1);
            const totalVenda = item.quantidade * item.valor_venda;
            const margemTotal = ((totalVenda - item.total_custo) / item.total_custo * 100).toFixed(1);
            
            mensagem += `
            ${index + 1}. ${item.produto_nome}
               Quantidade: ${item.quantidade}
               Custo Unitário: R$ ${this.formatarMoeda(item.valor_custo)}
               Venda Unitária: R$ ${this.formatarMoeda(item.valor_venda)}
               Margem Unitária: ${margem}%
               Total Custo: R$ ${this.formatarMoeda(item.total_custo)}
               Total Venda: R$ ${this.formatarMoeda(totalVenda)}
               Margem Total: ${margemTotal}%
            `;
        });

        alert(mensagem);
    }

    // ==================== EXCLUSÃO ====================
    async excluir(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            mostrarToast('Compra não encontrada', 'error');
            return;
        }

        const validacao = this.validarEstoqueParaExclusao(compraId);
        
        if (!validacao.valido && validacao.problemas.length > 0) {
            let mensagem = `⚠️ ATENÇÃO: Exclusão pode causar estoque negativo\n\n`;
            
            validacao.problemas.forEach(p => {
                mensagem += `• ${p.produto}: Estoque atual ${p.estoque_atual}, precisa remover ${p.quantidade_remover} (deficit: ${p.deficit})\n`;
            });
            
            mensagem += `\nDeseja continuar mesmo assim?`;
            
            if (!confirm(mensagem)) {
                return;
            }
        }

        const confirmacao = confirm(`
            Confirmar Exclusão:
            
            Compra #${compraId}
            Fornecedor: ${compra.fornecedor_nome}
            Valor: R$ ${this.formatarMoeda(compra.valor_total)}
            Data: ${compra.data_exibicao}
            
            ⚠️ O estoque dos produtos será reduzido!
            
            Confirmar exclusão?
        `);

        if (!confirmacao) return;

        try {
            // Primeiro ajustar estoque
            const itens = await this.carregarItens(compraId);
            
            for (const item of itens) {
                const produtos = this.app.produtos?.getProdutos?.() || [];
                const produto = produtos.find(p => p.id === item.produto_id);
                if (produto) {
                    const novoEstoque = Math.max(0, (produto.estoque || 0) - item.quantidade);
                    await supabase
                        .from('produto')
                        .update({
                            estoque: novoEstoque
                        })
                        .eq('id', produto.id);
                }
            }

            // Depois excluir compra e itens
            const { error: itensError } = await supabase
                .from('compras_itens')
                .delete()
                .eq('compra_id', compraId);

            if (itensError) throw itensError;

            const { error: compraError } = await supabase
                .from('compras')
                .delete()
                .eq('id', compraId);

            if (compraError) throw compraError;

            // Atualizar cache e UI
            this.invalidarCache();
            if (this.app.produtos?.carregar) {
                await this.app.produtos.carregar(true);
            }
            await this.listar();
            
            mostrarToast('✅ Compra excluída e estoque ajustado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir compra:', error);
            mostrarToast(this.handleSupabaseError(error), 'error');
        }
    }

    // ==================== GERAR PDF ====================
    async gerarPDF(compraId) {
        let compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            const comprasAtualizadas = await this.carregar(true);
            compra = comprasAtualizadas.find(c => c.id === compraId);
        }
        
        if (!compra) {
            mostrarToast('Compra não encontrada!', 'error');
            return;
        }

        const itens = await this.carregarItens(compraId);
        const subtotal = itens.reduce((sum, item) => sum + (item.total_custo || 0), 0);
        
        try {
            if (typeof jsPDF === 'undefined') {
                throw new Error('Biblioteca jsPDF não carregada');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Configurações
            const marginLeft = 20;
            const marginRight = 20;
            const pageWidth = doc.internal.pageSize.getWidth();
            const contentWidth = pageWidth - marginLeft - marginRight;
            
            let y = 25;
            
            // Cabeçalho
            doc.setFillColor(41, 128, 185);
            doc.rect(0, 0, pageWidth, 20, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('PEDIDO DE COMPRA', pageWidth / 2, 15, { align: 'center' });
            
            // Informações da compra
            doc.setTextColor(0, 0, 0);
            y = 30;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Pedido #${compraId}`, pageWidth - marginRight, y, { align: 'right' });
            
            y += 8;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('INFORMAÇÕES DO PEDIDO', marginLeft, y);
            
            y += 8;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            const infoLines = [
                `Fornecedor: ${compra.fornecedor_nome}`,
                `Data: ${compra.data_exibicao}`,
                compra.usuario_nome ? `Registrado por: ${compra.usuario_nome}` : null,
                compra.observacoes ? `Observações: ${compra.observacoes}` : null
            ].filter(Boolean);
            
            infoLines.forEach(line => {
                doc.text(line, marginLeft, y);
                y += 5;
            });
            
            y += 5;
            
            // Linha divisória
            doc.setDrawColor(200, 200, 200);
            doc.line(marginLeft, y, pageWidth - marginRight, y);
            y += 10;
            
            // Tabela de itens
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('PRODUTOS SOLICITADOS', marginLeft, y);
            
            y += 8;
            
            // Cabeçalho da tabela
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('Produto', marginLeft, y);
            doc.text('Qtd', marginLeft + 90, y);
            doc.text('Custo Un.', marginLeft + 110, y);
            doc.text('Venda Un.', marginLeft + 135, y);
            doc.text('Total', pageWidth - marginRight, y, { align: 'right' });
            
            y += 2;
            doc.line(marginLeft, y, pageWidth - marginRight, y);
            y += 6;
            
            // Itens
            doc.setFont('helvetica', 'normal');
            
            itens.forEach((item) => {
                // Verificar se precisa de nova página
                if (y > 250) {
                    doc.addPage();
                    y = 20;
                }
                
                const nomeProduto = item.produto_nome.length > 40 
                    ? item.produto_nome.substring(0, 37) + '...' 
                    : item.produto_nome;
                
                doc.text(nomeProduto, marginLeft, y);
                doc.text((item.quantidade || 0).toString(), marginLeft + 90, y);
                doc.text(`R$ ${this.formatarMoeda(item.valor_custo || 0)}`, marginLeft + 110, y);
                doc.text(`R$ ${this.formatarMoeda(item.valor_venda || 0)}`, marginLeft + 135, y);
                doc.text(`R$ ${this.formatarMoeda(item.total_custo || 0)}`, pageWidth - marginRight, y, { align: 'right' });
                
                y += 6;
            });
            
            y += 4;
            doc.line(marginLeft, y, pageWidth - marginRight, y);
            y += 8;
            
            // Totais
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            doc.text('Subtotal dos produtos:', pageWidth - marginRight - 60, y);
            doc.text(`R$ ${this.formatarMoeda(subtotal)}`, pageWidth - marginRight, y, { align: 'right' });
            
            if (compra.frete && compra.frete > 0) {
                y += 6;
                doc.text('Frete:', pageWidth - marginRight - 60, y);
                doc.text(`R$ ${this.formatarMoeda(compra.frete)}`, pageWidth - marginRight, y, { align: 'right' });
            }
            
            y += 10;
            doc.setDrawColor(100, 100, 100);
            doc.line(pageWidth - marginRight - 60, y, pageWidth - marginRight, y);
            
            y += 8;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL DO PEDIDO:', pageWidth - marginRight - 60, y);
            doc.text(`R$ ${this.formatarMoeda(compra.valor_total)}`, pageWidth - marginRight, y, { align: 'right' });
            
            // Rodapé
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.text(
                    `Página ${i} de ${pageCount} • Gerado em: ${new Date().toLocaleString('pt-BR')}`,
                    pageWidth / 2,
                    290,
                    { align: 'center' }
                );
            }
            
            // Nome do arquivo
            const nomeArquivo = `Pedido_Compra_${compraId}_${compra.fornecedor_nome.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            
            // Salvar PDF
            doc.save(nomeArquivo);
            
            mostrarToast('✅ PDF gerado com sucesso!', 'sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao gerar PDF:', error);
            
            if (error.message.includes('jsPDF')) {
                mostrarToast('Biblioteca jsPDF não carregada. Verifique o console.', 'error');
                
                // Fallback: mostrar em nova janela
                const conteudo = `
                    <html>
                    <head><title>Pedido de Compra #${compraId}</title></head>
                    <body style="font-family: Arial, sans-serif; padding: 20px;">
                        <h1>Pedido de Compra #${compraId}</h1>
                        <h3>Fornecedor: ${compra.fornecedor_nome}</h3>
                        <p>Data: ${compra.data_exibicao}</p>
                        <p>Total: R$ ${this.formatarMoeda(compra.valor_total)}</p>
                        <hr>
                        <h4>Itens (${itens.length}):</h4>
                        <table border="1" cellpadding="5" style="border-collapse: collapse;">
                            <tr>
                                <th>Produto</th><th>Qtd</th><th>Custo</th><th>Total</th>
                            </tr>
                            ${itens.map(item => `
                                <tr>
                                    <td>${item.produto_nome}</td>
                                    <td>${item.quantidade || 0}</td>
                                    <td>R$ ${this.formatarMoeda(item.valor_custo || 0)}</td>
                                    <td>R$ ${this.formatarMoeda(item.total_custo || 0)}</td>
                                </tr>
                            `).join('')}
                        </table>
                        <p><strong>Total: R$ ${this.formatarMoeda(compra.valor_total)}</strong></p>
                    </body>
                    </html>
                `;
                
                const novaJanela = window.open();
                if (novaJanela) {
                    novaJanela.document.write(conteudo);
                }
            } else {
                mostrarToast('Erro ao gerar PDF: ' + error.message, 'error');
            }
        }
    }

    // ==================== UTILITÁRIOS ====================
    novaCompra() {
        // Navegar para a aba de nova compra
        const tabNovaCompra = document.querySelector('[data-tab="novaCompra"]');
        if (tabNovaCompra) {
            tabNovaCompra.click();
        }
    }

    exportarParaCSV() {
        if (this.compras.length === 0) {
            mostrarToast('Nenhuma compra para exportar', 'warning');
            return;
        }

        const csvRows = [];
        
        // Cabeçalho
        csvRows.push(['ID', 'Data', 'Fornecedor', 'Itens', 'Subtotal', 'Frete', 'Total', 'Observações'].join(','));
        
        // Dados
        this.compras.forEach(compra => {
            const subtotal = compra.valor_total - (compra.frete || 0);
            csvRows.push([
                compra.id,
                `"${compra.data_exibicao}"`,
                `"${compra.fornecedor_nome.replace(/"/g, '""')}"`,
                compra.total_itens || 0,
                subtotal.toFixed(2),
                (compra.frete || 0).toFixed(2),
                compra.valor_total.toFixed(2),
                `"${(compra.observacoes || '').replace(/"/g, '""')}"`
            ].join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `compras_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        mostrarToast('CSV exportado com sucesso!', 'sucesso');
    }
}

// Inicialização global
if (typeof window !== 'undefined') {
    window.ComprasModule = ComprasModule;
}

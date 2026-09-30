// ==================== MÓDULO COMPRAS - COMPLETO E APRIMORADO ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
        this.produtosSelecionados = []; // Agora armazena { produtoId, produtoNome } para controle de Qtd > 0
        this.fornecedorSelecionado = null;
        this.valorFrete = 0;
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
        // Presume que app.fornecedores e app.produtos existem e têm o método carregar()
        await this.app.fornecedores.carregar(); 
        await this.app.produtos.carregar();
        
        this.app.pagination.setup(this.compras, 10);
        this.renderizar();
        
        this.inicializarSelectFornecedor();
        this.renderizarListaProdutosMultiplos();
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
                ${compra.frete ? `<p><strong>Frete:</strong> R$ ${compra.frete.toFixed(2)}</p>` : ''}
                ${compra.usuario_nome ? `<p><strong>Registrado por:</strong> ${compra.usuario_nome}</p>` : ''}
                ${compra.observacoes ? `<p><strong>Observações:</strong> ${compra.observacoes}</p>` : ''}
                <button class="btn-detalhes" data-id="${compra.id}" style="margin-top: 10px;">📋 Ver Detalhes</button>
                <button class="btn-pdf" data-id="${compra.id}" style="margin-top: 10px; background: #2196F3;">📄 Gerar PDF</button>
                <button class="btn-excluir" data-id="${compra.id}" style="margin-top: 10px; background: #f44336;">🗑️ Excluir</button>
            `;
            
            // Refatoração de Eventos: Adiciona listeners via JS
            div.querySelector('.btn-detalhes').addEventListener('click', () => this.verDetalhes(compra.id));
            div.querySelector('.btn-pdf').addEventListener('click', () => this.gerarPDF(compra.id));
            div.querySelector('.btn-excluir').addEventListener('click', () => this.excluir(compra.id));

            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
    }

    inicializarSelectFornecedor() {
        const selectOriginal = document.getElementById('compraFornecedor');
        if (!selectOriginal) return;

        // Cria e substitui o container customizado
        const container = document.createElement('div');
        container.id = 'compraFornecedorContainer';
        
        // Verifica se o elemento original está anexado antes de tentar substituí-lo
        if (selectOriginal.parentNode) {
            selectOriginal.parentNode.replaceChild(container, selectOriginal);
        } else {
            // Se o selectOriginal não estiver no DOM, apenas retorna para evitar erro.
            return;
        }


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
                                <strong>${f.nome}</strong>
                                ${f.contato ? `<small>${f.contato}</small>` : ''}
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

    // --- FUNÇÕES DE SELEÇÃO DE MÚLTIPLOS ITENS (AJUSTADAS) ---
    renderizarListaProdutosMultiplos() {
        const container = document.getElementById('listaProdutosMultiplos');
        if (!container) return;

        const produtos = this.app.produtos.getProdutosComEstoque();
        
        if (produtos.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum produto cadastrado</div>';
            return;
        }

        container.innerHTML = `
            <div class="produtos-multiplos-header">
                <input type="text" id="pesquisaProdutosCompra" placeholder="🔍 Pesquisar produtos..." 
                        oninput="app.compras.pesquisarProdutosMultiplos()" class="pesquisa-produto">
            </div>
            <div class="produtos-multiplos-lista" id="produtosMultiplosLista">
                ${produtos.map(p => {
                    // Preenche os valores atuais se já estiverem no carrinho (para edição)
                    const itemSelecionado = this.carrinho.find(i => i.produto_id === p.id) || {};
                    
                    // Qtd inicia em 0, Custo/Venda usam o preço atual/anterior como sugestão
                    const quantidade = itemSelecionado.quantidade || 0; 
                    const valorCusto = itemSelecionado.valor_custo || p.custo_unitario || '';
                    const valorVenda = itemSelecionado.valor_venda || p.preco || '';

                    // Inicializa a classe 'selected' se a QTD for > 0 (item no carrinho)
                    const itemClass = quantidade > 0 ? 'produto-multiplo-item selected' : 'produto-multiplo-item';
                    
                    return `
                        <div class="${itemClass}" data-produto-id="${p.id}" id="itemMultiplo_${p.id}">
                            <div class="produto-multiplo-info">
                                <strong>${p.nome}</strong>
                                <small id="estoqueAtual_${p.id}">Estoque: ${p.estoque} | Custo Ant: R$ ${(p.custo_unitario || 0).toFixed(2)}</small>
                                <small id="feedback_${p.id}" class="feedback-info"></small>
                            </div>
                            <div class="produto-multiplos-campos">
                                <input type="number" placeholder="Qtd" min="0" value="${quantidade}" 
                                       id="qtd_${p.id}" class="input-pequeno"
                                       oninput="app.compras.atualizarInputItem(${p.id})">
                                <input type="number" placeholder="Custo (R$)" min="0" step="0.01" 
                                       value="${valorCusto}" id="custo_${p.id}" class="input-pequeno"
                                       oninput="app.compras.atualizarInputItem(${p.id})">
                                <input type="number" placeholder="Venda (R$)" min="0" step="0.01" 
                                       value="${valorVenda}" id="venda_${p.id}" class="input-pequeno"
                                       oninput="app.compras.atualizarInputItem(${p.id})">
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <button onclick="app.compras.adicionarProdutosSelecionados()" class="btn-primary" 
                    style="margin-top: 15px; width: 100%;" id="btnAddProdutosCompra">
                ➕ Adicionar Itens com Quantidade > 0
            </button>
        `;

        // Inicializa a lista de produtosSelecionados com base nos itens que já estavam no carrinho
        produtos.forEach(p => this.atualizarInputItem(p.id)); 
    }

    // Novo método para validação e atualização em tempo real
    atualizarInputItem(produtoId) {
        const produto = this.app.produtos.getProdutos().find(p => p.id === produtoId);
        if (!produto) return;

        const qtdInput = document.getElementById(`qtd_${produtoId}`);
        const custoInput = document.getElementById(`custo_${produtoId}`);
        const vendaInput = document.getElementById(`venda_${produtoId}`);
        const itemDiv = document.getElementById(`itemMultiplo_${produtoId}`);
        const feedbackText = document.getElementById(`feedback_${produtoId}`);

        const quantidade = parseInt(qtdInput.value) || 0;
        const valorCusto = parseFloat(custoInput.value) || 0;
        const valorVenda = parseFloat(vendaInput.value) || 0;
        
        // --- Lógica de Seleção / Desseleção (Baseada em Quantidade > 0) ---
        // Adiciona/Remove o item da lista de controle de itens com Qtd preenchida
        if (quantidade > 0) {
            if (!this.produtosSelecionados.find(item => item.produtoId === produtoId)) {
                this.produtosSelecionados.push({ produtoId, produtoNome: produto.nome });
            }
            itemDiv.classList.add('selected');
        } else {
            this.produtosSelecionados = this.produtosSelecionados.filter(item => item.produtoId !== produtoId);
            itemDiv.classList.remove('selected');
        }
        
        // --- Lógica de Feedback/Validação Rápida ---
        feedbackText.textContent = '';
        feedbackText.style.color = 'gray';

        if (quantidade <= 0) {
            return; // Não valida custo/venda se não há quantidade
        }

        if (valorCusto > 0 && valorVenda > 0) {
             if (valorCusto > valorVenda) {
                feedbackText.textContent = `🚨 Venda (R$ ${valorVenda.toFixed(2)}) < Custo (R$ ${valorCusto.toFixed(2)}). Ajuste!`;
                feedbackText.style.color = 'red';
            } else {
                const totalCusto = quantidade * valorCusto;
                const margem = ((valorVenda - valorCusto) / valorCusto * 100).toFixed(1);
                feedbackText.textContent = `Total: R$ ${totalCusto.toFixed(2)} | Margem: ${margem}%`;
                feedbackText.style.color = 'green';
            }
        } else if (valorCusto > 0 || valorVenda > 0) {
            // Se Qtd > 0 mas um dos valores de custo/venda está faltando
            feedbackText.textContent = 'Preencha Custo e Venda (>0).';
            feedbackText.style.color = 'orange';
        }

        // Garante que a lista this.produtosSelecionados está sempre atualizada
        this.produtosSelecionados = this.produtosSelecionados
            .filter(item => (parseInt(document.getElementById(`qtd_${item.produtoId}`).value) || 0) > 0);
    }
    
    pesquisarProdutosMultiplos() {
        const termo = document.getElementById('pesquisaProdutosCompra').value.toLowerCase();
        const itens = document.querySelectorAll('.produto-multiplo-item');
        
        itens.forEach(item => {
            const texto = item.textContent.toLowerCase();
            item.style.display = texto.includes(termo) ? 'flex' : 'none';
        });
    }

    // A função toggleProdutoSelecao foi removida pois não usa mais checkbox.

    adicionarProdutosSelecionados() {
        if (this.produtosSelecionados.length === 0) {
            mostrarToast('Defina a quantidade para ao menos um produto!', 'warning');
            return;
        }

        let erros = [];
        let produtosParaAdicionar = [];
        let adicionados = 0;

        // Apenas itera sobre os produtos que têm Qtd > 0 (os que estão em this.produtosSelecionados)
        this.produtosSelecionados.forEach(({ produtoId, produtoNome }) => {
            const quantidade = parseInt(document.getElementById(`qtd_${produtoId}`).value);
            const valorCusto = parseFloat(document.getElementById(`custo_${produtoId}`).value);
            const valorVenda = parseFloat(document.getElementById(`venda_${produtoId}`).value);
            
            // Validação final de que todos os inputs são válidos
            if (isNaN(quantidade) || isNaN(valorCusto) || isNaN(valorVenda) || quantidade <= 0 || valorCusto <= 0 || valorVenda <= 0) {
                erros.push(`${produtoNome}: Qtd, Custo e Venda devem ser maiores que zero.`);
                return;
            }

            // Validação de Venda Abaixo do Custo
            if (valorCusto > valorVenda) {
                 erros.push(`${produtoNome}: Preço de Venda (R$ ${valorVenda.toFixed(2)}) é menor que o Custo (R$ ${valorCusto.toFixed(2)}). Ajuste.`);
                 return;
            }
            
            // Se passar nas validações
            produtosParaAdicionar.push({
                produtoId,
                quantidade,
                valorCusto,
                valorVenda,
                produtoNome
            });
        });

        if (erros.length > 0) {
            mostrarToast(`⚠️ Erro de validação:\n${erros.join('\n')}`, 'error');
            return;
        }

        // Adição ao Carrinho
        produtosParaAdicionar.forEach(({ produtoId, quantidade, valorCusto, valorVenda, produtoNome }) => {
            const total_custo = quantidade * valorCusto;
            const itemExistente = this.carrinho.find(item => item.produto_id === produtoId);
            
            if (itemExistente) {
                // Se existe, atualiza a quantidade e recalcula o total
                itemExistente.quantidade = quantidade;
                itemExistente.valor_custo = valorCusto;
                itemExistente.valor_venda = valorVenda;
                itemExistente.total_custo = quantidade * valorCusto;
            } else {
                // Se não existe, adiciona novo item
                this.carrinho.push({
                    produto_id: produtoId,
                    produto_nome: produtoNome,
                    quantidade: quantidade,
                    valor_custo: valorCusto,
                    valor_venda: valorVenda,
                    total_custo: total_custo
                });
            }
            adicionados++;

            // Limpa a UI dos itens processados
            document.getElementById(`qtd_${produtoId}`).value = '0'; 
            document.getElementById(`custo_${produtoId}`).value = '';
            document.getElementById(`venda_${produtoId}`).value = '';
            document.getElementById(`itemMultiplo_${produtoId}`).classList.remove('selected');
            document.getElementById(`feedback_${produtoId}`).textContent = '';
        });

        // Limpa a lista de IDs selecionados após o processamento bem-sucedido
        this.produtosSelecionados = [];

        if (adicionados > 0) {
            this.atualizarCarrinho();
            mostrarToast(`${adicionados} item(s) adicionado(s) ou atualizado(s) no carrinho!`, 'sucesso');
            document.getElementById('produtosMultiplosLista').scrollTop = 0; 
        }
    }
    // --- FIM DAS FUNÇÕES DE SELEÇÃO DE MÚLTIPLOS ITENS ---

    removerItem(produtoId) {
        const index = this.carrinho.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            
            // Limpa o input na lista múltipla, caso exista
            const qtdInput = document.getElementById(`qtd_${produtoId}`);
            if(qtdInput) qtdInput.value = '0';

            // Atualiza o estado visual e reativo
            this.atualizarInputItem(produtoId); 

            this.atualizarCarrinho();
            mostrarToast('Item removido do carrinho.', 'info');
        }
    }

    atualizarFrete() {
        const inputFrete = document.getElementById('compraFrete');
        if (inputFrete) {
            // Usa o valor, garante que NaN vira 0
            this.valorFrete = parseFloat(inputFrete.value) || 0; 
        }
        this.atualizarCarrinho();
    }

    atualizarCarrinho() {
        const lista = document.getElementById('itensCompraLista');
        if (!lista) return;

        if (this.carrinho.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum item adicionado</div>';
            document.getElementById('subtotalCompra').textContent = '0.00';
            document.getElementById('freteCompra').textContent = this.valorFrete.toFixed(2);
            document.getElementById('totalCompra').textContent = this.valorFrete.toFixed(2);
            return;
        }

        lista.innerHTML = '';
        let subtotal = 0;

        this.carrinho.forEach(item => {
            subtotal += item.total_custo;
            
            const margem = item.valor_custo > 0 ? ((item.valor_venda - item.valor_custo) / item.valor_custo * 100).toFixed(1) : 0;
            const corMargem = item.valor_custo > 0 && item.valor_venda >= item.valor_custo ? 'green' : (item.valor_custo > 0 ? 'red' : 'gray');
            
            const div = document.createElement('div');
            div.className = 'carrinho-item';
            div.innerHTML = `
                <div class="carrinho-item-info">
                    <h4>${item.produto_nome}</h4>
                    <p>Qtd: ${item.quantidade} | Custo: R$ ${item.valor_custo.toFixed(2)} | Venda: R$ ${item.valor_venda.toFixed(2)}</p>
                    <small style="color: ${corMargem};">Margem: ${margem}%</small>
                </div>
                <div class="carrinho-item-acoes">
                    <span>R$ ${item.total_custo.toFixed(2)}</span>
                    <button class="btn-remover-item" data-id="${item.produto_id}">🗑️</button>
                </div>
            `;
            
            // Refatoração de Eventos
            div.querySelector('.btn-remover-item').addEventListener('click', () => this.removerItem(item.produto_id));
            lista.appendChild(div);
        });

        const totalGeral = subtotal + this.valorFrete;

        document.getElementById('subtotalCompra').textContent = subtotal.toFixed(2);
        document.getElementById('freteCompra').textContent = this.valorFrete.toFixed(2);
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

        setButtonLoading('finalizarCompra', true, 'Finalizando...');

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
                    
                    // Otimização: Só atualiza se for diferente para evitar triggers desnecessários
                    if (novoEstoque !== produto.estoque || item.valor_custo !== produto.custo_unitario || item.valor_venda !== produto.preco) {
                        await supabase.from('produto').update({
                            estoque: novoEstoque,
                            custo_unitario: item.valor_custo,
                            preco: item.valor_venda
                        }).eq('id', produto.id);
                    }
                }
            }

            // 4. Limpar Estado e UI (melhor organização)
            this.carrinho = [];
            this.fornecedorSelecionado = null;
            this.valorFrete = 0;
            this.produtosSelecionados = [];
            
            this.atualizarCarrinho();
            document.getElementById('fornecedorSelecionadoText').textContent = 'Selecione um fornecedor';
            document.getElementById('compraObservacoes').value = '';
            document.getElementById('compraFrete').value = '0';

            // Remove a classe 'selected' do fornecedor
            document.querySelectorAll('.select-pesquisavel-item').forEach(i => i.classList.remove('selected'));

            // 5. Recarregar Listas de Dados
            await this.app.produtos.carregar(); // Recarrega produtos para ter o novo estoque
            this.renderizarListaProdutosMultiplos(); // Atualiza a lista múltipla
            await this.carregar(); // Recarrega a lista de compras
            this.renderizar(); // Renderiza a lista de compras atualizada

            mostrarToast('Compra registrada com sucesso!', 'sucesso');
            
            if (confirm('Deseja gerar o PDF do pedido?')) {
                this.gerarPDF(compraId);
            }
        } catch (error) {
            console.error('❌ Erro ao registrar compra:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('finalizarCompra', false, '✅ Finalizar Compra');
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
            const margem = item.valor_custo > 0 ? ((item.valor_venda - item.valor_custo) / item.valor_custo * 100).toFixed(1) : 'N/A';
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
                    // MELHORIA 2: Garante que o estoque não fique negativo
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

    // Nota: Requer a inclusão da biblioteca jsPDF no projeto (ex: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>)
    async gerarPDF(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            mostrarToast('Compra não encontrada!', 'error');
            return;
        }
        
        // Verifica se jsPDF está disponível
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
            
            // Tratamento de quebra de linha para observações
            if (compra.observacoes) {
                y += 6;
                doc.setFont(undefined, 'bold');
                doc.text(`Observações:`, 20, y);
                doc.setFont(undefined, 'normal');
                
                const obsText = doc.splitTextToSize(compra.observacoes, 150); // Divide em linhas com 150mm de largura
                y += 4;
                doc.text(obsText, 20, y);
                y += obsText.length * 5; // Avança o Y conforme o número de linhas
            }
            
            y += 5; // Espaçamento após info

            if (y > 250) { // Se o cabeçalho ficou muito grande, passa para a próxima página
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
                    // Repete o cabeçalho de itens na nova página
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
            doc.line(110, y, 190, y); // Linha apenas abaixo dos itens
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
            doc.line(110, y, 190, y); // Linha dupla
            
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


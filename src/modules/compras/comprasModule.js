// ==================== MÓDULO COMPRAS - COMPLETO ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, setButtonLoading } from '../../utils/ui.js';
import { handleSupabaseError } from '../../utils/security.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class ComprasModule {
    constructor(app) {
        this.app = app;
        this.compras = [];
        this.carrinho = [];
        this.produtosSelecionados = [];
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
                <button onclick="app.compras.verDetalhes(${compra.id})" style="margin-top: 10px;">📋 Ver Detalhes</button>
                <button onclick="app.compras.gerarPDF(${compra.id})" style="margin-top: 10px; background: #2196F3;">📄 Gerar PDF</button>
                <button onclick="app.compras.excluir(${compra.id})" style="margin-top: 10px; background: #f44336;">🗑️ Excluir</button>
            `;
            lista.appendChild(div);
        });

        this.app.pagination.renderPaginationControls('paginacaoCompras', this.renderizar.bind(this));
    }

    inicializarSelectFornecedor() {
        const selectOriginal = document.getElementById('compraFornecedor');
        if (!selectOriginal) return;

        const container = document.createElement('div');
        container.id = 'compraFornecedorContainer';
        selectOriginal.parentNode.replaceChild(container, selectOriginal);

        const fornecedoresAtivos = this.app.fornecedores.getFornecedoresAtivos();

        container.innerHTML = `
            <div class="select-pesquisavel">
                <div class="select-pesquisavel-header" onclick="app.compras.toggleFornecedor()">
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

    renderizarListaProdutosMultiplos() {
        const container = document.getElementById('listaProdutosMultiplos');
        if (!container) return;

        const produtos = this.app.produtos.getProdutos();
        
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
                ${produtos.map(p => `
                    <div class="produto-multiplo-item" data-produto-id="${p.id}">
                        <div class="produto-multiplo-checkbox">
                            <input type="checkbox" id="prod_${p.id}" value="${p.id}" 
                                   onchange="app.compras.toggleProdutoSelecao(${p.id})">
                        </div>
                        <div class="produto-multiplo-info">
                            <label for="prod_${p.id}">
                                <strong>${p.nome}</strong>
                                <small>Estoque atual: ${p.estoque}</small>
                            </label>
                        </div>
                        <div class="produto-multiplo-campos" id="campos_${p.id}" style="display: none;">
                            <input type="number" placeholder="Qtd" min="1" value="1" 
                                   id="qtd_${p.id}" class="input-pequeno">
                            <input type="number" placeholder="Custo (R$)" min="0" step="0.01" 
                                   id="custo_${p.id}" class="input-pequeno">
                            <input type="number" placeholder="Venda (R$)" min="0" step="0.01" 
                                   id="venda_${p.id}" class="input-pequeno">
                        </div>
                    </div>
                `).join('')}
            </div>
            <button onclick="app.compras.adicionarProdutosSelecionados()" class="btn-primary" 
                    style="margin-top: 15px; width: 100%;">
                ➕ Adicionar Produtos Selecionados
            </button>
        `;
    }

    pesquisarProdutosMultiplos() {
        const termo = document.getElementById('pesquisaProdutosCompra').value.toLowerCase();
        const itens = document.querySelectorAll('.produto-multiplo-item');
        
        itens.forEach(item => {
            const texto = item.textContent.toLowerCase();
            item.style.display = texto.includes(termo) ? 'flex' : 'none';
        });
    }

    toggleProdutoSelecao(produtoId) {
        const checkbox = document.getElementById(`prod_${produtoId}`);
        const campos = document.getElementById(`campos_${produtoId}`);
        
        if (checkbox.checked) {
            campos.style.display = 'flex';
            if (!this.produtosSelecionados.includes(produtoId)) {
                this.produtosSelecionados.push(produtoId);
            }
        } else {
            campos.style.display = 'none';
            this.produtosSelecionados = this.produtosSelecionados.filter(id => id !== produtoId);
        }
    }

    adicionarProdutosSelecionados() {
        if (this.produtosSelecionados.length === 0) {
            mostrarToast('Selecione ao menos um produto!', 'warning');
            return;
        }

        let erros = [];
        let adicionados = 0;

        this.produtosSelecionados.forEach(produtoId => {
            const quantidade = parseInt(document.getElementById(`qtd_${produtoId}`).value);
            const valorCusto = parseFloat(document.getElementById(`custo_${produtoId}`).value);
            const valorVenda = parseFloat(document.getElementById(`venda_${produtoId}`).value);

            if (!quantidade || !valorCusto || !valorVenda) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === produtoId);
                erros.push(`${produto.nome}: preencha todos os campos`);
                return;
            }

            if (quantidade <= 0 || valorCusto <= 0 || valorVenda <= 0) {
                const produto = this.app.produtos.getProdutos().find(p => p.id === produtoId);
                erros.push(`${produto.nome}: valores devem ser maiores que zero`);
                return;
            }

            const produto = this.app.produtos.getProdutos().find(p => p.id === produtoId);
            if (!produto) return;

            const itemExistente = this.carrinho.find(item => item.produto_id === produtoId);
            
            if (itemExistente) {
                itemExistente.quantidade += quantidade;
                itemExistente.total_custo = itemExistente.quantidade * itemExistente.valor_custo;
            } else {
                this.carrinho.push({
                    produto_id: produtoId,
                    produto_nome: produto.nome,
                    quantidade: quantidade,
                    valor_custo: valorCusto,
                    valor_venda: valorVenda,
                    total_custo: quantidade * valorCusto
                });
            }

            document.getElementById(`prod_${produtoId}`).checked = false;
            document.getElementById(`campos_${produtoId}`).style.display = 'none';
            document.getElementById(`qtd_${produtoId}`).value = '1';
            document.getElementById(`custo_${produtoId}`).value = '';
            document.getElementById(`venda_${produtoId}`).value = '';
            
            adicionados++;
        });

        this.produtosSelecionados = [];

        if (erros.length > 0) {
            mostrarToast(erros.join('\n'), 'warning');
        }

        if (adicionados > 0) {
            this.atualizarCarrinho();
            mostrarToast(`${adicionados} produto(s) adicionado(s)!`, 'sucesso');
        }
    }

    removerItem(produtoId) {
        const index = this.carrinho.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            this.carrinho.splice(index, 1);
            this.atualizarCarrinho();
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

        setButtonLoading('finalizarCompra', true);

        try {
            const fornecedor = this.app.fornecedores.fornecedores.find(f => f.id === this.fornecedorSelecionado);
            const subtotal = this.carrinho.reduce((sum, item) => sum + item.total_custo, 0);
            const totalCompra = subtotal + this.valorFrete;
            const usuarioLogado = this.app.auth.getUsuarioLogado();
            const observacoes = document.getElementById('compraObservacoes')?.value.trim() || '';

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
            this.valorFrete = 0;
            this.produtosSelecionados = [];
            
            this.atualizarCarrinho();
            document.getElementById('fornecedorSelecionadoText').textContent = 'Selecione um fornecedor';
            if (document.getElementById('compraObservacoes')) {
                document.getElementById('compraObservacoes').value = '';
            }
            if (document.getElementById('compraFrete')) {
                document.getElementById('compraFrete').value = '0';
            }

            document.querySelectorAll('.select-pesquisavel-item').forEach(i => {
                i.classList.remove('selected');
            });

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
        if (compra.frete) mensagem += `Frete: R$ ${compra.frete.toFixed(2)}\n`;
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

    async gerarPDF(compraId) {
        const compra = this.compras.find(c => c.id === compraId);
        if (!compra) {
            mostrarToast('Compra não encontrada!', 'error');
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
                doc.text(`Observações: ${compra.observacoes}`, 20, y);
            }
            
            y += 15;
            
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
            doc.line(20, y, 190, y);
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
            mostrarToast('Erro ao gerar PDF. Verifique se o jsPDF está carregado.', 'error');
        }
    }
}

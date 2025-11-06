// ==================== MÓDULO FINANCEIRO - DOCE JARDIM ====================
// Este arquivo adiciona funcionalidades de gestão de fornecedores e controle financeiro

// ==================== EXTENSÃO DO OBJETO APP ====================
Object.assign(app, {
    // Cache para dados financeiros
    cacheFinanceiro: {
        fornecedores: [],
        compras: [],
        comprasItens: []
    },

    // ==================== FORNECEDORES ====================
    
    carregarFornecedores: async function() {
        try {
            const { data, error } = await supabase
                .from('fornecedores')
                .select('*')
                .order('nome');
            
            if (error) throw error;
            this.cacheFinanceiro.fornecedores = data || [];
            return this.cacheFinanceiro.fornecedores;
        } catch (error) {
            console.error('❌ Erro ao carregar fornecedores:', error);
            return [];
        }
    },

    listarFornecedores: async function() {
        await this.carregarFornecedores();
        app.pagination.setup(this.cacheFinanceiro.fornecedores, 10);
        
        const inputPesquisa = document.getElementById('pesquisaFornecedor');
        if (inputPesquisa) inputPesquisa.value = '';
        
        this.renderizarPaginaFornecedores();
    },

    pesquisarFornecedores: function() {
        const termoPesquisa = document.getElementById('pesquisaFornecedor').value.toLowerCase().trim();
        app.pagination.currentPage = 1;
        app.pagination.filteredData = this.cacheFinanceiro.fornecedores.filter(f => 
            f.nome.toLowerCase().includes(termoPesquisa) ||
            (f.cnpj && f.cnpj.includes(termoPesquisa))
        );
        this.renderizarPaginaFornecedores();
    },

    renderizarPaginaFornecedores: function() {
        const lista = document.getElementById('listaFornecedores');
        if (!lista) return;

        if (app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum fornecedor encontrado</div>';
            app.pagination.renderPaginationControls('paginacaoFornecedores', this.renderizarPaginaFornecedores.bind(this));
            return;
        }

        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(fornecedor => {
            const div = document.createElement('div');
            div.className = 'produto-item';
            
            const statusBadge = fornecedor.ativo 
                ? '<span style="color: green;">✓ Ativo</span>' 
                : '<span style="color: red;">✗ Inativo</span>';
            
            div.innerHTML = `
                <div class="produto-item-info">
                    <h4>🏢 ${fornecedor.nome} ${statusBadge}</h4>
                    <p><strong>CNPJ:</strong> ${fornecedor.cnpj || 'Não informado'}</p>
                    <p><strong>Contato:</strong> ${fornecedor.contato || 'Não informado'}</p>
                    ${fornecedor.endereco ? `<p><strong>Endereço:</strong> ${fornecedor.endereco}</p>` : ''}
                    ${fornecedor.observacoes ? `<p><strong>Obs:</strong> ${fornecedor.observacoes}</p>` : ''}
                </div>
                <div>
                    <button onclick="app.editarFornecedor(${fornecedor.id})">✏️ Editar</button>
                    <button onclick="app.excluirFornecedor(${fornecedor.id})">🗑️ Excluir</button>
                </div>
            `;
            lista.appendChild(div);
        });

        app.pagination.renderPaginationControls('paginacaoFornecedores', this.renderizarPaginaFornecedores.bind(this));
    },

    adicionarFornecedor: async function() {
        const nome = document.getElementById('fornecedorNome').value.trim();
        const contato = document.getElementById('fornecedorContato').value.trim();
        const cnpj = document.getElementById('fornecedorCNPJ').value.trim();
        const endereco = document.getElementById('fornecedorEndereco').value.trim();
        const observacoes = document.getElementById('fornecedorObservacoes').value.trim();

        if (!nome) {
            this.mostrarToast('Informe o nome do fornecedor!', 'warning');
            return;
        }

        this.setButtonLoading('adicionarFornecedor', true, 'Adicionar Fornecedor');

        try {
            const { error } = await supabase.from('fornecedores').insert([{
                nome,
                contato,
                cnpj,
                endereco,
                observacoes,
                ativo: true
            }]);

            if (error) throw error;

            // Limpar formulário
            document.getElementById('fornecedorNome').value = '';
            document.getElementById('fornecedorContato').value = '';
            document.getElementById('fornecedorCNPJ').value = '';
            document.getElementById('fornecedorEndereco').value = '';
            document.getElementById('fornecedorObservacoes').value = '';

            await this.listarFornecedores();
            this.mostrarToast('Fornecedor adicionado com sucesso!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao adicionar fornecedor:', error);
            this.mostrarToast(this.handleSupabaseError(error), 'error');
        } finally {
            this.setButtonLoading('adicionarFornecedor', false, 'Adicionar Fornecedor');
        }
    },

    editarFornecedor: function(fornecedorId) {
        const fornecedor = this.cacheFinanceiro.fornecedores.find(f => f.id === fornecedorId);
        if (!fornecedor) return;

        document.getElementById('editFornecedorId').value = fornecedor.id;
        document.getElementById('editFornecedorNome').value = fornecedor.nome;
        document.getElementById('editFornecedorContato').value = fornecedor.contato || '';
        document.getElementById('editFornecedorCNPJ').value = fornecedor.cnpj || '';
        document.getElementById('editFornecedorEndereco').value = fornecedor.endereco || '';
        document.getElementById('editFornecedorObservacoes').value = fornecedor.observacoes || '';
        document.getElementById('editFornecedorAtivo').checked = fornecedor.ativo;

        const modal = document.getElementById('modalEditarFornecedor');
        modal.classList.add('active');
        modal.style.display = 'flex';
    },

    salvarEdicaoFornecedor: async function() {
        const id = parseInt(document.getElementById('editFornecedorId').value);
        const nome = document.getElementById('editFornecedorNome').value.trim();
        const contato = document.getElementById('editFornecedorContato').value.trim();
        const cnpj = document.getElementById('editFornecedorCNPJ').value.trim();
        const endereco = document.getElementById('editFornecedorEndereco').value.trim();
        const observacoes = document.getElementById('editFornecedorObservacoes').value.trim();
        const ativo = document.getElementById('editFornecedorAtivo').checked;

        if (!nome) {
            this.mostrarToast('Informe o nome do fornecedor!', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('fornecedores').update({
                nome,
                contato,
                cnpj,
                endereco,
                observacoes,
                ativo
            }).eq('id', id);

            if (error) throw error;

            await this.listarFornecedores();
            this.fecharModalEdicaoFornecedor();
            this.mostrarToast('Fornecedor atualizado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao atualizar fornecedor:', error);
            this.mostrarToast(this.handleSupabaseError(error), 'error');
        }
    },

    fecharModalEdicaoFornecedor: function() {
        const modal = document.getElementById('modalEditarFornecedor');
        modal.classList.remove('active');
        modal.style.display = 'none';
    },

    excluirFornecedor: async function(fornecedorId) {
        const fornecedor = this.cacheFinanceiro.fornecedores.find(f => f.id === fornecedorId);
        if (!fornecedor) return;

        if (!confirm(`Deseja excluir o fornecedor "${fornecedor.nome}"?`)) return;

        try {
            const { error } = await supabase.from('fornecedores').delete().eq('id', fornecedorId);
            if (error) throw error;

            await this.listarFornecedores();
            this.mostrarToast('Fornecedor excluído!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir fornecedor:', error);
            this.mostrarToast(this.handleSupabaseError(error), 'error');
        }
    },

    // ==================== COMPRAS/INVESTIMENTOS ====================

    carregarCompras: async function() {
        try {
            const { data, error } = await supabase
                .from('compras')
                .select('*')
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            // Corrigir timezone
            this.cacheFinanceiro.compras = (data || []).map(compra => {
                if (compra.data) {
                    const dataUTC = new Date(compra.data);
                    const dataBrasilia = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
                    compra.data_corrigida = dataBrasilia.toISOString();
                    compra.data_exibicao = dataBrasilia.toLocaleString('pt-BR');
                }
                return compra;
            });
            
            return this.cacheFinanceiro.compras;
        } catch (error) {
            console.error('❌ Erro ao carregar compras:', error);
            return [];
        }
    },

    carregarComprasItens: async function(compraId) {
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
    },

    listarCompras: async function() {
        await this.carregarCompras();
        await this.carregarFornecedores();
        
        app.pagination.setup(this.cacheFinanceiro.compras, 10);
        
        this.renderizarPaginaCompras();
        this.popularSelectFornecedores();
    },

    renderizarPaginaCompras: function() {
        const lista = document.getElementById('listaCompras');
        if (!lista) return;

        if (app.pagination.filteredData.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma compra registrada</div>';
            app.pagination.renderPaginationControls('paginacaoCompras', this.renderizarPaginaCompras.bind(this));
            return;
        }

        lista.innerHTML = '';
        app.pagination.getPageItems().forEach(compra => {
            const div = document.createElement('div');
            div.className = 'venda-item';
            
            const dataExibicao = compra.data_exibicao || new Date(compra.data).toLocaleString('pt-BR');
            
            div.innerHTML = `
                <div class="venda-item-header">
                    <strong>📦 ${dataExibicao}</strong>
                    <strong class="valor-venda">R$ ${compra.valor_total.toFixed(2)}</strong>
                </div>
                <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                ${compra.usuario_nome ? `<p><strong>Registrado por:</strong> ${compra.usuario_nome}</p>` : ''}
                ${compra.observacoes ? `<p><strong>Observações:</strong> ${compra.observacoes}</p>` : ''}
                <button onclick="app.verDetalhesCompra(${compra.id})" style="margin-top: 10px;">📋 Ver Detalhes</button>
                <button onclick="app.excluirCompra(${compra.id})" style="margin-top: 10px; background: #f44336;">🗑️ Excluir</button>
            `;
            lista.appendChild(div);
        });

        app.pagination.renderPaginationControls('paginacaoCompras', this.renderizarPaginaCompras.bind(this));
    },

    popularSelectFornecedores: function() {
        const select = document.getElementById('compraFornecedor');
        if (!select) return;

        select.innerHTML = '<option value="">Selecione um fornecedor</option>';
        
        this.cacheFinanceiro.fornecedores
            .filter(f => f.ativo)
            .forEach(fornecedor => {
                const option = document.createElement('option');
                option.value = fornecedor.id;
                option.textContent = fornecedor.nome;
                select.appendChild(option);
            });
    },

    // Carrinho de compras
    carrinhoCompra: [],

    adicionarItemCompra: function() {
        const produtoId = document.getElementById('compraProduto').value;
        const quantidade = parseInt(document.getElementById('compraQuantidade').value);
        const valorCusto = parseFloat(document.getElementById('compraValorCusto').value);
        const valorVenda = parseFloat(document.getElementById('compraValorVenda').value);

        if (!produtoId || !quantidade || !valorCusto || !valorVenda) {
            this.mostrarToast('Preencha todos os campos do item!', 'warning');
            return;
        }

        if (quantidade <= 0 || valorCusto <= 0 || valorVenda <= 0) {
            this.mostrarToast('Valores devem ser maiores que zero!', 'warning');
            return;
        }

        const produto = this.cache.produtos.find(p => p.id === parseInt(produtoId));
        if (!produto) return;

        // Verificar se item já existe no carrinho
        const itemExistente = this.carrinhoCompra.find(item => item.produto_id === parseInt(produtoId));
        
        if (itemExistente) {
            itemExistente.quantidade += quantidade;
            itemExistente.total_custo = itemExistente.quantidade * itemExistente.valor_custo;
        } else {
            this.carrinhoCompra.push({
                produto_id: parseInt(produtoId),
                produto_nome: produto.nome,
                quantidade: quantidade,
                valor_custo: valorCusto,
                valor_venda: valorVenda,
                total_custo: quantidade * valorCusto
            });
        }

        // Limpar campos
        document.getElementById('compraProduto').value = '';
        document.getElementById('compraQuantidade').value = '1';
        document.getElementById('compraValorCusto').value = '';
        document.getElementById('compraValorVenda').value = '';

        this.atualizarCarrinhoCompra();
        this.mostrarToast('Item adicionado!', 'sucesso');
    },

    removerItemCompra: function(produtoId) {
        const index = this.carrinhoCompra.findIndex(item => item.produto_id === produtoId);
        if (index !== -1) {
            this.carrinhoCompra.splice(index, 1);
            this.atualizarCarrinhoCompra();
        }
    },

    atualizarCarrinhoCompra: function() {
        const lista = document.getElementById('itensCompraLista');
        if (!lista) return;

        if (this.carrinhoCompra.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum item adicionado</div>';
            document.getElementById('totalCompra').textContent = '0.00';
            return;
        }

        lista.innerHTML = '';
        let totalGeral = 0;

        this.carrinhoCompra.forEach(item => {
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
                    <button onclick="app.removerItemCompra(${item.produto_id})">🗑️</button>
                </div>
            `;
            lista.appendChild(div);
        });

        document.getElementById('totalCompra').textContent = totalGeral.toFixed(2);
    },

    finalizarCompra: async function() {
        const fornecedorId = document.getElementById('compraFornecedor').value;
        const observacoes = document.getElementById('compraObservacoes').value.trim();

        if (!fornecedorId) {
            this.mostrarToast('Selecione um fornecedor!', 'warning');
            return;
        }

        if (this.carrinhoCompra.length === 0) {
            this.mostrarToast('Adicione ao menos um item!', 'warning');
            return;
        }

        this.setButtonLoading('finalizarCompra', true, 'Finalizar Compra');

        try {
            const fornecedor = this.cacheFinanceiro.fornecedores.find(f => f.id === parseInt(fornecedorId));
            const totalCompra = this.carrinhoCompra.reduce((sum, item) => sum + item.total_custo, 0);

            // Inserir compra
            const { data: compraData, error: compraError } = await supabase.from('compras').insert([{
                fornecedor_id: parseInt(fornecedorId),
                fornecedor_nome: fornecedor.nome,
                valor_total: totalCompra,
                observacoes: observacoes,
                usuario_id: this.usuarioLogado?.id,
                usuario_nome: this.usuarioLogado?.nome,
                data: new Date().toISOString()
            }]).select();

            if (compraError) throw compraError;

            const compraId = compraData[0].id;

            // Inserir itens da compra
            const itensParaInserir = this.carrinhoCompra.map(item => ({
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

            // Atualizar estoque e custo dos produtos
            for (const item of this.carrinhoCompra) {
                const produto = this.cache.produtos.find(p => p.id === item.produto_id);
                if (produto) {
                    produto.estoque += item.quantidade;
                    produto.custo_unitario = item.valor_custo;
                    produto.preco = item.valor_venda;
                    
                    await supabase.from('produto').update({
                        estoque: produto.estoque,
                        custo_unitario: item.valor_custo,
                        preco: item.valor_venda
                    }).eq('id', produto.id);
                }
            }

            // Limpar formulário
            this.carrinhoCompra = [];
            this.atualizarCarrinhoCompra();
            document.getElementById('compraFornecedor').value = '';
            document.getElementById('compraObservacoes').value = '';

            await this.carregarProdutos();
            await this.listarCompras();

            this.mostrarToast('Compra registrada com sucesso!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao registrar compra:', error);
            this.mostrarToast(this.handleSupabaseError(error), 'error');
        } finally {
            this.setButtonLoading('finalizarCompra', false, 'Finalizar Compra');
        }
    },

    verDetalhesCompra: async function(compraId) {
        const compra = this.cacheFinanceiro.compras.find(c => c.id === compraId);
        if (!compra) return;

        const itens = await this.carregarComprasItens(compraId);
        
        let mensagem = `📦 DETALHES DA COMPRA\n\n`;
        mensagem += `Data: ${compra.data_exibicao || new Date(compra.data).toLocaleString('pt-BR')}\n`;
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
    },

    excluirCompra: async function(compraId) {
        const compra = this.cacheFinanceiro.compras.find(c => c.id === compraId);
        if (!compra) return;

        if (!confirm(`Deseja excluir esta compra de R$ ${compra.valor_total.toFixed(2)}?`)) return;

        try {
            // Buscar itens da compra antes de excluir
            const itens = await this.carregarComprasItens(compraId);

            // Reverter estoque
            for (const item of itens) {
                const produto = this.cache.produtos.find(p => p.id === item.produto_id);
                if (produto) {
                    produto.estoque -= item.quantidade;
                    await supabase.from('produto').update({
                        estoque: Math.max(0, produto.estoque)
                    }).eq('id', produto.id);
                }
            }

            // Excluir compra (os itens serão excluídos automaticamente por CASCADE)
            const { error } = await supabase.from('compras').delete().eq('id', compraId);
            if (error) throw error;

            await this.carregarProdutos();
            await this.listarCompras();
            this.mostrarToast('Compra excluída e estoque ajustado!', 'sucesso');
        } catch (error) {
            console.error('❌ Erro ao excluir compra:', error);
            this.mostrarToast(this.handleSupabaseError(error), 'error');
        }
    },

    // ==================== RELATÓRIO FINANCEIRO ====================

    carregarRelatorioFinanceiro: async function() {
        try {
            await this.carregarCompras();
            await this.carregarVendasComHoraCorrigida();
            
            this.filtrarRelatorioFinanceiro('hoje');
        } catch (error) {
            console.error('❌ Erro ao carregar relatório financeiro:', error);
            this.mostrarToast('Erro ao carregar relatório', 'error');
        }
    },

    filtrarRelatorioFinanceiro: async function(periodo) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        let dataInicio, dataFim;

        switch(periodo) {
            case 'hoje':
                dataInicio = hoje;
                dataFim = new Date(hoje);
                dataFim.setHours(23, 59, 59, 999);
                break;
            
            case 'semana':
                dataInicio = new Date(hoje);
                dataInicio.setDate(hoje.getDate() - hoje.getDay());
                dataFim = new Date();
                break;
            
            case 'mes':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date();
                break;
            
            default:
                dataInicio = new Date(0);
                dataFim = new Date();
        }

        // Filtrar compras
        const comprasFiltradas = this.cacheFinanceiro.compras.filter(c => {
            const dataCompra = new Date(c.data_corrigida || c.data);
            return dataCompra >= dataInicio && dataCompra <= dataFim;
        });

        // Filtrar vendas
        const vendasFiltradas = this.cache.vendas.filter(v => {
            const dataVenda = new Date(v.data_corrigida || v.data);
            return dataVenda >= dataInicio && dataVenda <= dataFim;
        });

        await this.calcularEstatisticasFinanceiras(comprasFiltradas, vendasFiltradas, periodo);
        
        // Atualizar botões ativos
        document.querySelectorAll('.filtros-financeiro .btn-filtro').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`filtroFinanceiro${periodo.charAt(0).toUpperCase() + periodo.slice(1)}`);
        if (btnAtivo) btnAtivo.classList.add('active');
    },

    filtrarFinanceiroPorPeriodo: async function() {
        const dataInicio = document.getElementById('financeiroDataInicio').value;
        const dataFim = document.getElementById('financeiroDataFim').value;

        if (!dataInicio || !dataFim) {
            this.mostrarToast('Selecione as datas', 'warning');
            return;
        }

        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);

        const comprasFiltradas = this.cacheFinanceiro.compras.filter(c => {
            const dataCompra = new Date(c.data_corrigida || c.data);
            return dataCompra >= inicio && dataCompra <= fim;
        });

        const vendasFiltradas = this.cache.vendas.filter(v => {
            const dataVenda = new Date(v.data_corrigida || v.data);
            return dataVenda >= inicio && dataVenda <= fim;
        });

        await this.calcularEstatisticasFinanceiras(comprasFiltradas, vendasFiltradas, 'personalizado');
        
        document.querySelectorAll('.filtros-financeiro .btn-filtro').forEach(btn => btn.classList.remove('active'));
    },

    calcularEstatisticasFinanceiras: async function(compras, vendas, periodo) {
        // Total investido
        const totalInvestido = compras.reduce((sum, c) => sum + parseFloat(c.valor_total || 0), 0);

        // Total vendido
        const totalVendido = vendas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

        // Calcular custo real das vendas
        let custoVendas = 0;
        
        for (const venda of vendas) {
            try {
                const itens = JSON.parse(venda.itens || '[]');
                for (const item of itens) {
                    const produto = this.cache.produtos.find(p => p.id === item.id);
                    if (produto && produto.custo_unitario) {
                        custoVendas += produto.custo_unitario * item.quantidade;
                    }
                }
            } catch (e) {
                console.error('Erro ao processar venda:', e);
            }
        }

        // Lucro real = Vendas - Custo das vendas
        const lucroReal = totalVendido - custoVendas;
        
        // Margem de lucro
        const margemLucro = totalVendido > 0 ? ((lucroReal / totalVendido) * 100) : 0;

        // Produtos mais lucrativos
        const produtosLucro = await this.calcularProdutosMaisLucrativos(vendas);

        // Atualizar interface
        document.getElementById('totalInvestido').textContent = totalInvestido.toFixed(2);
        document.getElementById('totalVendido').textContent = totalVendido.toFixed(2);
        document.getElementById('lucroReal').textContent = lucroReal.toFixed(2);
        document.getElementById('margemLucro').textContent = margemLucro.toFixed(1);

        // Renderizar produtos mais lucrativos
        this.renderizarProdutosMaisLucrativos(produtosLucro);

        // Renderizar históricos
        this.renderizarHistoricoCompras(compras);
        this.renderizarHistoricoVendasFinanceiro(vendas);

        // Guardar dados para PDF
        this.dadosRelatorioFinanceiro = {
            periodo: periodo,
            totalInvestido,
            totalVendido,
            custoVendas,
            lucroReal,
            margemLucro,
            compras,
            vendas,
            produtosLucro
        };
    },

    calcularProdutosMaisLucrativos: async function(vendas) {
        const produtos = {};

        for (const venda of vendas) {
            try {
                const itens = JSON.parse(venda.itens || '[]');
                for (const item of itens) {
                    const produto = this.cache.produtos.find(p => p.id === item.id);
                    
                    if (!produtos[item.id]) {
                        produtos[item.id] = {
                            nome: item.nome,
                            quantidadeVendida: 0,
                            valorVendido: 0,
                            custoTotal: 0,
                            lucro: 0
                        };
                    }

                    produtos[item.id].quantidadeVendida += item.quantidade;
                    produtos[item.id].valorVendido += item.preco * item.quantidade;
                    
                    if (produto && produto.custo_unitario) {
                        produtos[item.id].custoTotal += produto.custo_unitario * item.quantidade;
                    }
                }
            } catch (e) {
                console.error('Erro ao processar venda:', e);
            }
        }

        // Calcular lucro de cada produto
        Object.values(produtos).forEach(p => {
            p.lucro = p.valorVendido - p.custoTotal;
            p.margemLucro = p.valorVendido > 0 ? ((p.lucro / p.valorVendido) * 100) : 0;
        });

        // Ordenar por lucro
        return Object.values(produtos).sort((a, b) => b.lucro - a.lucro).slice(0, 10);
    },

    renderizarProdutosMaisLucrativos: function(produtos) {
        const lista = document.getElementById('produtosMaisLucrativos');
        if (!lista) return;

        if (produtos.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma venda no período</div>';
            return;
        }

        lista.innerHTML = produtos.map((produto, index) => `
            <div class="produto-lucro-item">
                <div class="produto-lucro-info">
                    <strong>${index + 1}. ${produto.nome}</strong>
                    <p>Vendidos: ${produto.quantidadeVendida} un. | Margem: ${produto.margemLucro.toFixed(1)}%</p>
                </div>
                <div class="produto-lucro-valores">
                    <small>Vendido: R$ ${produto.valorVendido.toFixed(2)}</small>
                    <strong style="color: ${produto.lucro > 0 ? 'green' : 'red'};">
                        Lucro: R$ ${produto.lucro.toFixed(2)}
                    </strong>
                </div>
            </div>
        `).join('');
    },

    renderizarHistoricoCompras: function(compras) {
        const historico = document.getElementById('historicoComprasFinanceiro');
        if (!historico) return;

        if (compras.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma compra neste período</div>';
            return;
        }

        const totalPeriodo = compras.reduce((sum, c) => sum + parseFloat(c.valor_total || 0), 0);

        let html = `
            <div class="resumo-periodo">
                <strong>Total investido: R$ ${totalPeriodo.toFixed(2)}</strong> | ${compras.length} compra(s)
            </div>
        `;

        html += compras.map(compra => {
            const dataExibicao = compra.data_exibicao || new Date(compra.data).toLocaleString('pt-BR');
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>📦 ${dataExibicao}</strong>
                        <strong class="valor-venda" style="color: #f44336;">- R$ ${compra.valor_total.toFixed(2)}</strong>
                    </div>
                    <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                    ${compra.observacoes ? `<p><strong>Obs:</strong> ${compra.observacoes}</p>` : ''}
                </div>
            `;
        }).join('');

        historico.innerHTML = html;
    },

    renderizarHistoricoVendasFinanceiro: function(vendas) {
        const historico = document.getElementById('historicoVendasFinanceiro');
        if (!historico) return;

        if (vendas.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma venda neste período</div>';
            return;
        }

        const totalPeriodo = vendas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

        let html = `
            <div class="resumo-periodo">
                <strong>Total vendido: R$ ${totalPeriodo.toFixed(2)}</strong> | ${vendas.length} venda(s)
            </div>
        `;

        html += vendas.slice(0, 20).map(venda => {
            const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>💰 ${dataExibicao}${mesaTexto}</strong>
                        <strong class="valor-venda" style="color: #4CAF50;">+ R$ ${venda.total.toFixed(2)}</strong>
                    </div>
                    <p><strong>Pagamento:</strong> ${venda.forma_pagamento}</p>
                </div>
            `;
        }).join('');

        if (vendas.length > 20) {
            html += `<p style="text-align: center; color: #999; margin-top: 10px;">Mostrando 20 de ${vendas.length} vendas</p>`;
        }

        historico.innerHTML = html;
    },

    exportarRelatorioFinanceiroPDF: function() {
        if (typeof window.jspdf === 'undefined') {
            this.mostrarToast('Erro: Biblioteca de PDF não carregada.', 'error');
            return;
        }

        if (!this.dadosRelatorioFinanceiro) {
            this.mostrarToast('Carregue os dados primeiro!', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const dados = this.dadosRelatorioFinanceiro;

        // Cabeçalho
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('RELATÓRIO FINANCEIRO DETALHADO', 105, 15, { align: 'center' });
        doc.text('🍰 DOCE JARDIM 🍰', 105, 23, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 30, { align: 'center' });
        doc.text(`Período: ${dados.periodo}`, 105, 35, { align: 'center' });

        let yPosition = 45;

        // Resumo Financeiro
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('💰 RESUMO FINANCEIRO', 14, yPosition);
        yPosition += 10;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        
        // Box com resumo
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 240);
        doc.rect(14, yPosition, 182, 35, 'F');
        doc.rect(14, yPosition, 182, 35, 'S');
        
        yPosition += 8;
        doc.setFont(undefined, 'bold');
        doc.text(`Total Investido:`, 20, yPosition);
        doc.setTextColor(244, 67, 54);
        doc.text(`R$ ${dados.totalInvestido.toFixed(2)}`, 160, yPosition, { align: 'right' });
        
        yPosition += 7;
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Vendido:`, 20, yPosition);
        doc.setTextColor(76, 175, 80);
        doc.text(`R$ ${dados.totalVendido.toFixed(2)}`, 160, yPosition, { align: 'right' });
        
        yPosition += 7;
        doc.setTextColor(0, 0, 0);
        doc.text(`Custo das Vendas:`, 20, yPosition);
        doc.setTextColor(255, 152, 0);
        doc.text(`R$ ${dados.custoVendas.toFixed(2)}`, 160, yPosition, { align: 'right' });
        
        yPosition += 10;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(`LUCRO REAL:`, 20, yPosition);
        doc.setTextColor(dados.lucroReal >= 0 ? 0 : 255, dados.lucroReal >= 0 ? 128 : 0, 0);
        doc.text(`R$ ${dados.lucroReal.toFixed(2)}`, 160, yPosition, { align: 'right' });
        
        yPosition += 7;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Margem de Lucro: ${dados.margemLucro.toFixed(1)}%`, 20, yPosition);
        
        yPosition += 15;
        doc.setTextColor(0, 0, 0);

        // Top 5 Produtos Mais Lucrativos
        if (dados.produtosLucro && dados.produtosLucro.length > 0) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('📊 TOP 5 PRODUTOS MAIS LUCRATIVOS', 14, yPosition);
            yPosition += 8;

            doc.setFontSize(9);
            const top5 = dados.produtosLucro.slice(0, 5);
            
            top5.forEach((produto, index) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                doc.setFont(undefined, 'bold');
                doc.text(`${index + 1}. ${produto.nome}`, 20, yPosition);
                yPosition += 5;
                
                doc.setFont(undefined, 'normal');
                doc.text(`Vendidos: ${produto.quantidadeVendida} un. | Lucro: R$ ${produto.lucro.toFixed(2)} | Margem: ${produto.margemLucro.toFixed(1)}%`, 25, yPosition);
                yPosition += 7;
            });
            
            yPosition += 5;
        }

        // Compras do Período
        if (dados.compras.length > 0) {
            if (yPosition > 250) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('📦 COMPRAS DO PERÍODO', 14, yPosition);
            yPosition += 8;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            
            dados.compras.forEach((compra, index) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                const dataExibicao = compra.data_exibicao || new Date(compra.data).toLocaleString('pt-BR');
                
                doc.setFont(undefined, 'bold');
                doc.text(`${index + 1}. ${dataExibicao} - ${compra.fornecedor_nome}`, 20, yPosition);
                doc.text(`R$ ${compra.valor_total.toFixed(2)}`, 180, yPosition, { align: 'right' });
                yPosition += 6;
            });
            
            yPosition += 5;
        }

        // Vendas do Período (resumo)
        if (dados.vendas.length > 0) {
            if (yPosition > 250) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('💰 RESUMO DE VENDAS', 14, yPosition);
            yPosition += 8;

            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.text(`Total de vendas: ${dados.vendas.length}`, 20, yPosition);
            yPosition += 5;
            doc.text(`Ticket médio: R$ ${(dados.totalVendido / dados.vendas.length).toFixed(2)}`, 20, yPosition);
            yPosition += 5;
            
            // Vendas por forma de pagamento
            const vendasPorPagamento = {};
            dados.vendas.forEach(v => {
                if (!vendasPorPagamento[v.forma_pagamento]) {
                    vendasPorPagamento[v.forma_pagamento] = { qtd: 0, valor: 0 };
                }
                vendasPorPagamento[v.forma_pagamento].qtd++;
                vendasPorPagamento[v.forma_pagamento].valor += parseFloat(v.total || 0);
            });
            
            yPosition += 3;
            doc.setFont(undefined, 'bold');
            doc.text('Por forma de pagamento:', 20, yPosition);
            yPosition += 5;
            doc.setFont(undefined, 'normal');
            
            Object.entries(vendasPorPagamento).forEach(([forma, dados]) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                doc.text(`${forma}: ${dados.qtd} venda(s) - R$ ${dados.valor.toFixed(2)}`, 25, yPosition);
                yPosition += 5;
            });
        }

        // Rodapé
        const totalPages = doc.internal.pages.length - 1;
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Página ${i} de ${totalPages}`, 105, 290, { align: 'center' });
            doc.text('Doce Jardim - Sistema de Gestão', 105, 285, { align: 'center' });
        }

        // Salvar
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`relatorio-financeiro-${dados.periodo}-${timestamp}.pdf`);

        this.mostrarToast('Relatório financeiro gerado com sucesso!', 'sucesso');
    }
});

// ==================== EVENTOS ADICIONAIS ====================
document.addEventListener('DOMContentLoaded', function() {
    // Listener para fechar modal de fornecedor ao clicar fora
    window.addEventListener('click', function(event) {
        const modalFornecedor = document.getElementById('modalEditarFornecedor');
        if (event.target === modalFornecedor) {
            app.fecharModalEdicaoFornecedor();
        }
    });

    // Auto-preencher produtos no select de compras
    if (document.getElementById('compraProduto')) {
        app.carregarProdutos().then(() => {
            const select = document.getElementById('compraProduto');
            if (select) {
                select.innerHTML = '<option value="">Selecione um produto</option>';
                app.cache.produtos.forEach(produto => {
                    const option = document.createElement('option');
                    option.value = produto.id;
                    option.textContent = `${produto.nome} (Estoque: ${produto.estoque})`;
                    select.appendChild(option);
                });
            }
        });
    }

    console.log('✅ Módulo Financeiro carregado!');
});

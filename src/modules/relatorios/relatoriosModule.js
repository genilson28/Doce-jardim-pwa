import { supabase } from '../../config/supabase.js';
import { mostrarToast } from '../../utils/ui.js';
import { connectionService } from '../../services/connectionService.js';

export class EstoqueModule {
    constructor(app) {
        this.app = app;
        this.filtroNome = '';
        this.filtroCategoria = '';
    }

    // ─────────────────────────────────────────
    //  HISTÓRICO — Supabase
    // ─────────────────────────────────────────

    /**
     * Registra uma movimentação na tabela estoque_historico.
     * Chame sempre que alterar o estoque de um produto.
     *
     * Exemplo de uso em outros módulos:
     *   await app.estoque.registrarMovimentacao(produto, qtdAnterior, qtdNova, 'entrada', 'NF 123');
     *   await app.estoque.registrarMovimentacao(produto, qtdAnterior, qtdNova, 'saida');
     */
    async registrarMovimentacao(produto, quantidadeAnterior, quantidadeNova, tipo = 'ajuste', obs = '') {
        try {
            if (!connectionService.getStatus()) {
                console.warn('⚠️ Offline — movimentação não registrada no Supabase');
                return;
            }

            const { error } = await supabase.from('estoque_historico').insert([{
                produto_id:          produto.id,
                produto_nome:        produto.nome,
                quantidade_anterior: quantidadeAnterior,
                quantidade_nova:     quantidadeNova,
                tipo,
                obs: obs || null
            }]);

            if (error) throw error;
        } catch (error) {
            console.error('❌ Erro ao registrar movimentação:', error);
        }
    }

    /** Busca a última entrada (diferença positiva) de um produto */
    async _ultimaEntrada(produtoId) {
        try {
            if (!connectionService.getStatus()) return null;

            const { data, error } = await supabase
                .from('estoque_historico')
                .select('*')
                .eq('produto_id', produtoId)
                .gt('diferenca', 0)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;
            return data || null;
        } catch {
            return null;
        }
    }

    /**
     * Busca histórico de vários produtos em UMA única query (otimizado).
     * Retorna Map: produto_id → array de movimentações
     */
    async _buscarTodoHistorico(produtoIds) {
        try {
            if (!connectionService.getStatus()) return new Map();

            const { data, error } = await supabase
                .from('estoque_historico')
                .select('*')
                .in('produto_id', produtoIds)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const mapa = new Map();
            (data || []).forEach(mov => {
                if (!mapa.has(mov.produto_id)) mapa.set(mov.produto_id, []);
                mapa.get(mov.produto_id).push(mov);
            });

            return mapa;
        } catch (error) {
            console.error('❌ Erro ao buscar histórico:', error);
            return new Map();
        }
    }

    /**
     * Calcula consumo médio diário e previsão de zeramento/mínimo
     * com base nas saídas do histórico.
     */
    _analiseConsumo(movimentacoes, estoqueAtual) {
        const saidas = movimentacoes.filter(m => m.diferenca < 0);
        if (saidas.length < 2) return null;

        const totalSaida     = saidas.reduce((acc, m) => acc + Math.abs(m.diferenca), 0);
        const primeiraData   = new Date(saidas[0].created_at);
        const ultimaData     = new Date(saidas[saidas.length - 1].created_at);
        const diasDecorridos = Math.max(1, (ultimaData - primeiraData) / (1000 * 60 * 60 * 24));
        const mediaDiaria    = totalSaida / diasDecorridos;

        if (mediaDiaria <= 0) return null;

        const diasParaZerar  = Math.floor(estoqueAtual / mediaDiaria);
        const diasParaMinimo = estoqueAtual > 5 ? Math.floor((estoqueAtual - 5) / mediaDiaria) : 0;

        return {
            mediaDiaria:   mediaDiaria.toFixed(2),
            diasParaZerar,
            diasParaMinimo,
            dataZeramento: this._somarDias(new Date(), diasParaZerar),
            dataMinimo:    this._somarDias(new Date(), diasParaMinimo)
        };
    }

    _somarDias(data, dias) {
        const d = new Date(data);
        d.setDate(d.getDate() + dias);
        return d.toLocaleDateString('pt-BR');
    }

    _formatarData(isoString) {
        if (!isoString) return '—';
        return new Date(isoString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    // ─────────────────────────────────────────
    //  FILTROS
    // ─────────────────────────────────────────

    _getProdutosFiltrados() {
        return this.app.produtos.getProdutos().filter(p => {
            const nomeOk = p.nome.toLowerCase().includes(this.filtroNome.toLowerCase());
            const catOk  = !this.filtroCategoria || p.categoria === this.filtroCategoria;
            return nomeOk && catOk;
        });
    }

    _getCategorias() {
        return [...new Set(
            this.app.produtos.getProdutos().map(p => p.categoria).filter(Boolean)
        )].sort();
    }

    // ─────────────────────────────────────────
    //  LISTAR (tela principal de estoque)
    // ─────────────────────────────────────────

    async listar() {
        console.log('🔄 Carregando estoque...');
        await this.app.produtos.carregar();

        const lista = document.getElementById('listaEstoque');
        if (!lista) { console.error('❌ Elemento listaEstoque não encontrado'); return; }

        if (this.app.produtos.getProdutos().length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto cadastrado</div>';
            return;
        }

        this.filtroNome = '';
        this.filtroCategoria = '';
        this._renderizarFiltros();
        this.app.pagination.setup(this._getProdutosFiltrados(), 5);
        this.renderizarPagina();
    }

    _renderizarFiltros() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;

        const categorias = this._getCategorias();
        lista.innerHTML = `
            <div class="estoque-filtros" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
                <input
                    id="filtroProdutoNome" type="text"
                    placeholder="🔍 Buscar produto..."
                    value="${this.filtroNome}"
                    oninput="app.estoque._onFiltroNome(this.value)"
                    style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;min-width:220px;"
                />
                <select id="filtroProdutoCategoria"
                        onchange="app.estoque._onFiltroCategoria(this.value)"
                        style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                    <option value="">Todas as categorias</option>
                    ${categorias.map(c => `<option value="${c}" ${this.filtroCategoria === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
                <button onclick="app.estoque._limparFiltros()"
                        style="padding:8px 14px;border:1px solid #ddd;border-radius:8px;font-size:13px;cursor:pointer;background:#f5f5f5;">
                    ✕ Limpar
                </button>
                <div style="display:flex;gap:8px;margin-left:auto;">
                    <button onclick="app.estoque.abrirRelatorioFornecedor()"
                            style="padding:8px 14px;border:none;border-radius:8px;font-size:13px;cursor:pointer;background:#4CAF50;color:#fff;">
                        📋 Relatório Fornecedor
                    </button>
                    <button onclick="app.estoque.abrirRelatorioCompleto()"
                            style="padding:8px 14px;border:none;border-radius:8px;font-size:13px;cursor:pointer;background:#2196F3;color:#fff;">
                        📊 Relatório Completo
                    </button>
                </div>
            </div>
            <div id="estoqueTabela"></div>
        `;
    }

    _onFiltroNome(valor) { this.filtroNome = valor; this._reaplicarFiltros(); }
    _onFiltroCategoria(valor) { this.filtroCategoria = valor; this._reaplicarFiltros(); }

    _limparFiltros() {
        this.filtroNome = '';
        this.filtroCategoria = '';
        const inputNome = document.getElementById('filtroProdutoNome');
        const selectCat = document.getElementById('filtroProdutoCategoria');
        if (inputNome) inputNome.value = '';
        if (selectCat) selectCat.value = '';
        this._reaplicarFiltros();
    }

    _reaplicarFiltros() {
        this.app.pagination.setup(this._getProdutosFiltrados(), 5);
        this.renderizarPagina();
    }

    // ─────────────────────────────────────────
    //  TABELA DE ESTOQUE (paginada)
    // ─────────────────────────────────────────

    renderizarPagina() {
        const container = document.getElementById('estoqueTabela');
        if (!container) return;

        const filtrados      = this._getProdutosFiltrados();
        const produtosPagina = this.app.pagination.getPageItems();

        if (filtrados.length === 0) {
            container.innerHTML = '<div class="empty-state" style="margin-top:20px;">Nenhum produto encontrado para esse filtro.</div>';
            return;
        }

        const inicio = (this.app.pagination.currentPage - 1) * this.app.pagination.itemsPerPage + 1;
        const fim    = Math.min(this.app.pagination.currentPage * this.app.pagination.itemsPerPage, filtrados.length);

        let html = `
            <div class="estoque-header">
                <h3>Controle de Estoque</h3>
                <p class="estoque-info">Mostrando ${inicio}–${fim} de ${filtrados.length} produtos</p>
            </div>
            <div class="tabela-estoque-container">
                <table class="tabela-estoque">
                    <thead>
                        <tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Status</th></tr>
                    </thead>
                    <tbody>
        `;

        produtosPagina.forEach(produto => {
            let badge, badgeClass, statusIcone;
            if (produto.estoque === 0)     { badge = 'SEM ESTOQUE'; badgeClass = 'estoque-critico'; statusIcone = '❌'; }
            else if (produto.estoque <= 5) { badge = 'BAIXO';       badgeClass = 'estoque-baixo';   statusIcone = '⚠️'; }
            else                            { badge = 'OK';          badgeClass = 'estoque-ok';      statusIcone = '✅'; }

            html += `
                <tr class="linha-estoque ${badgeClass}">
                    <td data-label="Produto">
                        <strong>${produto.nome}</strong>
                        <small class="categoria-badge">${produto.categoria}</small>
                    </td>
                    <td data-label="Quantidade"><span class="quantidade-destaque">${produto.estoque}</span></td>
                    <td data-label="Preço">R$ ${produto.preco?.toFixed(2)}</td>
                    <td data-label="Status">
                        <span class="badge-status ${badgeClass}">${statusIcone} ${badge}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
            <div class="paginacao-estoque">
                <button onclick="app.pagination.changePage('anterior','estoqueTabela',app.estoque.renderizarPagina.bind(app.estoque))"
                        class="btn-paginacao" ${this.app.pagination.currentPage === 1 ? 'disabled' : ''}>← Anterior</button>
                <span class="info-pagina">Página ${this.app.pagination.currentPage} de ${this.app.pagination.totalPages}</span>
                <button onclick="app.pagination.changePage('proxima','estoqueTabela',app.estoque.renderizarPagina.bind(app.estoque))"
                        class="btn-paginacao" ${this.app.pagination.currentPage === this.app.pagination.totalPages ? 'disabled' : ''}>Próxima →</button>
            </div>
        `;

        container.innerHTML = html;
    }

    // ─────────────────────────────────────────
    //  MODAL UTILITÁRIO
    // ─────────────────────────────────────────

    _abrirModal(titulo, conteudoHtml, largura = '800px') {
        document.getElementById('estoqueModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'estoqueModal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);
            display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;`;
        modal.innerHTML = `
            <div style="background:#fff;border-radius:12px;width:100%;max-width:${largura};
                        max-height:90vh;display:flex;flex-direction:column;overflow:hidden;
                        box-shadow:0 20px 60px rgba(0,0,0,.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:16px 20px;border-bottom:1px solid #eee;">
                    <h2 style="margin:0;font-size:18px;">${titulo}</h2>
                    <button onclick="document.getElementById('estoqueModal').remove()"
                            style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>
                </div>
                <div id="estoqueModalCorpo" style="overflow-y:auto;padding:20px;flex:1;">
                    ${conteudoHtml}
                </div>
            </div>
        `;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    // ─────────────────────────────────────────
    //  RELATÓRIO FORNECEDOR (sem valores)
    // ─────────────────────────────────────────

    async abrirRelatorioFornecedor() {
        const categorias = this._getCategorias();
        const seletorHtml = `
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
                <select id="rfCategoria" onchange="app.estoque._renderRelatorioFornecedor()"
                        style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                    <option value="">Todas as categorias</option>
                    ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="rfStatus" onchange="app.estoque._renderRelatorioFornecedor()"
                        style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                    <option value="">Todos os status</option>
                    <option value="critico">Sem Estoque</option>
                    <option value="baixo">Estoque Baixo</option>
                    <option value="ok">OK</option>
                </select>
                <button onclick="app.estoque._imprimirElemento('rfTabela','Relatório de Estoque – Fornecedor')"
                        style="padding:8px 14px;border:none;border-radius:8px;background:#4CAF50;color:#fff;cursor:pointer;margin-left:auto;">
                    🖨️ Imprimir / PDF
                </button>
            </div>
            <div id="rfTabela"><div style="text-align:center;padding:30px;color:#999;">⏳ Carregando...</div></div>
        `;
        this._abrirModal('📋 Relatório para Fornecedor', seletorHtml, '700px');
        await this._renderRelatorioFornecedor();
    }

    async _renderRelatorioFornecedor() {
        const container = document.getElementById('rfTabela');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;">⏳ Buscando dados...</div>';

        const catFiltro    = document.getElementById('rfCategoria')?.value || '';
        const statusFiltro = document.getElementById('rfStatus')?.value || '';

        let produtos = this.app.produtos.getProdutos().filter(p => {
            const catOk = !catFiltro || p.categoria === catFiltro;
            let statusOk = true;
            if (statusFiltro === 'critico') statusOk = p.estoque === 0;
            else if (statusFiltro === 'baixo') statusOk = p.estoque > 0 && p.estoque <= 5;
            else if (statusFiltro === 'ok')    statusOk = p.estoque > 5;
            return catOk && statusOk;
        });

        if (produtos.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">Nenhum produto encontrado.</p>';
            return;
        }

        // Busca última entrada de cada produto em paralelo
        const entradasMap = new Map();
        await Promise.all(produtos.map(async p => {
            entradasMap.set(p.id, await this._ultimaEntrada(p.id));
        }));

        const hoje = new Date().toLocaleDateString('pt-BR');
        let html = `
            <p style="color:#666;font-size:13px;margin-bottom:12px;">
                Data: ${hoje} &nbsp;|&nbsp; Total: ${produtos.length} produto(s)
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr style="background:#f0f0f0;">
                        <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Produto</th>
                        <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd;">Categoria</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Qtd Atual</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Status</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Última Entrada</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #ddd;">Qtd Entrada</th>
                    </tr>
                </thead>
                <tbody>
        `;

        produtos.forEach(p => {
            let statusLabel, statusColor;
            if (p.estoque === 0)     { statusLabel = '❌ Sem Estoque'; statusColor = '#c62828'; }
            else if (p.estoque <= 5) { statusLabel = '⚠️ Baixo';      statusColor = '#e65100'; }
            else                      { statusLabel = '✅ OK';         statusColor = '#2e7d32'; }

            const entrada  = entradasMap.get(p.id);
            const dataEntr = entrada ? this._formatarData(entrada.created_at) : '—';
            const qtdEntr  = entrada ? `+${entrada.diferenca} un.` : '—';

            html += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:10px;font-weight:600;">${p.nome}</td>
                    <td style="padding:10px;color:#555;">${p.categoria || '—'}</td>
                    <td style="padding:10px;text-align:center;font-weight:700;">${p.estoque}</td>
                    <td style="padding:10px;text-align:center;color:${statusColor};font-weight:600;">${statusLabel}</td>
                    <td style="padding:10px;text-align:center;font-size:12px;color:#555;">${dataEntr}</td>
                    <td style="padding:10px;text-align:center;font-size:12px;color:#1565C0;font-weight:600;">${qtdEntr}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    }

    // ─────────────────────────────────────────
    //  RELATÓRIO COMPLETO (dono)
    // ─────────────────────────────────────────

    async abrirRelatorioCompleto() {
        const produtos   = this.app.produtos.getProdutos();
        const categorias = this._getCategorias();

        const checkboxes = produtos.map(p => `
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:2px 0;">
                <input type="checkbox" value="${p.id}" checked
                       onchange="app.estoque._renderRelatorioCompleto()"
                       class="rc-produto-check" />
                ${p.nome} <span style="color:#999;font-size:11px;">(${p.categoria})</span>
            </label>
        `).join('');

        const html = `
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-start;">
                <div style="flex:1;min-width:200px;">
                    <p style="font-weight:600;margin:0 0 8px;">Selecionar produtos:</p>
                    <div style="display:flex;gap:8px;margin-bottom:8px;">
                        <button onclick="app.estoque._toggleTodosProdutos(true)"
                                style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;cursor:pointer;">Marcar todos</button>
                        <button onclick="app.estoque._toggleTodosProdutos(false)"
                                style="padding:4px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;cursor:pointer;">Desmarcar todos</button>
                    </div>
                    <div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:4px;">
                        ${checkboxes}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;min-width:180px;">
                    <select id="rcCategoria" onchange="app.estoque._renderRelatorioCompleto()"
                            style="padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;">
                        <option value="">Todas as categorias</option>
                        ${categorias.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <button onclick="app.estoque._imprimirElemento('rcTabela','Relatório Completo de Estoque')"
                            style="padding:8px 14px;border:none;border-radius:8px;background:#2196F3;color:#fff;cursor:pointer;">
                        🖨️ Imprimir / PDF
                    </button>
                </div>
            </div>
            <div id="rcTabela"><div style="text-align:center;padding:30px;color:#999;">⏳ Carregando...</div></div>
        `;

        this._abrirModal('📊 Relatório Completo', html, '1000px');
        await this._renderRelatorioCompleto();
    }

    _toggleTodosProdutos(marcar) {
        document.querySelectorAll('.rc-produto-check').forEach(cb => cb.checked = marcar);
        this._renderRelatorioCompleto();
    }

    async _renderRelatorioCompleto() {
        const container = document.getElementById('rcTabela');
        if (!container) return;
        container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;">⏳ Buscando histórico no banco...</div>';

        const selecionados = new Set(
            [...document.querySelectorAll('.rc-produto-check:checked')].map(cb => Number(cb.value))
        );
        const catFiltro = document.getElementById('rcCategoria')?.value || '';

        let produtos = this.app.produtos.getProdutos().filter(p =>
            selecionados.has(p.id) && (!catFiltro || p.categoria === catFiltro)
        );

        if (produtos.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;margin-top:20px;">Nenhum produto selecionado.</p>';
            return;
        }

        // Uma única query para todo o histórico dos produtos selecionados
        const historicoMap = await this._buscarTodoHistorico(produtos.map(p => p.id));

        const hoje       = new Date().toLocaleDateString('pt-BR');
        const totalValor = produtos.reduce((acc, p) => acc + (p.preco ?? 0) * p.estoque, 0);

        let html = `
            <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;
                        background:#f8f9fa;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;">
                <span>📅 <strong>${hoje}</strong></span>
                <span>📦 Produtos: <strong>${produtos.length}</strong></span>
                <span>💰 Valor total em estoque: <strong>R$ ${totalValor.toFixed(2)}</strong></span>
            </div>
            <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:950px;">
                <thead>
                    <tr style="background:#e3f2fd;">
                        <th style="padding:10px;text-align:left;border-bottom:2px solid #90caf9;">Produto</th>
                        <th style="padding:10px;text-align:left;border-bottom:2px solid #90caf9;">Categoria</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Qtd</th>
                        <th style="padding:10px;text-align:right;border-bottom:2px solid #90caf9;">Preço Unit.</th>
                        <th style="padding:10px;text-align:right;border-bottom:2px solid #90caf9;">Valor Total</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Status</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Última Entrada</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Qtd Entrada</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Consumo/dia</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Zera em</th>
                        <th style="padding:10px;text-align:center;border-bottom:2px solid #90caf9;">Mínimo em</th>
                    </tr>
                </thead>
                <tbody>
        `;

        produtos.forEach(p => {
            let statusLabel, statusColor, rowBg;
            if (p.estoque === 0)     { statusLabel = '❌ Sem Estoque'; statusColor = '#c62828'; rowBg = '#fff8f8'; }
            else if (p.estoque <= 5) { statusLabel = '⚠️ Baixo';      statusColor = '#e65100'; rowBg = '#fff8e1'; }
            else                      { statusLabel = '✅ OK';         statusColor = '#2e7d32'; rowBg = '#f9fbe7'; }

            const movs       = historicoMap.get(p.id) || [];
            const entradas   = movs.filter(m => m.diferenca > 0);
            const ultimaEntr = entradas.length ? entradas[entradas.length - 1] : null;
            const dataEntr   = ultimaEntr ? this._formatarData(ultimaEntr.created_at) : '—';
            const qtdEntr    = ultimaEntr ? `+${ultimaEntr.diferenca} un.` : '—';

            const consumo    = this._analiseConsumo(movs, p.estoque);
            const valorTotal = (p.preco ?? 0) * p.estoque;

            html += `
                <tr style="border-bottom:1px solid #eee;background:${rowBg};">
                    <td style="padding:9px;font-weight:600;">${p.nome}</td>
                    <td style="padding:9px;color:#555;">${p.categoria || '—'}</td>
                    <td style="padding:9px;text-align:center;font-weight:700;">${p.estoque}</td>
                    <td style="padding:9px;text-align:right;">R$ ${p.preco?.toFixed(2) ?? '—'}</td>
                    <td style="padding:9px;text-align:right;font-weight:600;">R$ ${valorTotal.toFixed(2)}</td>
                    <td style="padding:9px;text-align:center;color:${statusColor};font-weight:600;">${statusLabel}</td>
                    <td style="padding:9px;text-align:center;font-size:12px;color:#555;">${dataEntr}</td>
                    <td style="padding:9px;text-align:center;font-size:12px;color:#1565C0;font-weight:600;">${qtdEntr}</td>
                    <td style="padding:9px;text-align:center;color:#1565C0;">${consumo ? consumo.mediaDiaria : '—'}</td>
                    <td style="padding:9px;text-align:center;color:#c62828;font-size:12px;">
                        ${consumo ? `${consumo.diasParaZerar}d<br/><small>(${consumo.dataZeramento})</small>` : '—'}
                    </td>
                    <td style="padding:9px;text-align:center;color:#e65100;font-size:12px;">
                        ${consumo ? `${consumo.diasParaMinimo}d<br/><small>(${consumo.dataMinimo})</small>` : '—'}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
                <tfoot>
                    <tr style="background:#e3f2fd;font-weight:700;">
                        <td colspan="4" style="padding:10px;">TOTAL</td>
                        <td style="padding:10px;text-align:right;">R$ ${totalValor.toFixed(2)}</td>
                        <td colspan="6"></td>
                    </tr>
                </tfoot>
            </table>
            </div>
            <p style="margin-top:12px;font-size:11px;color:#999;">
                * Consumo diário calculado com base nas saídas em <code>estoque_historico</code>.
                  Quanto mais movimentações registradas, mais precisa será a previsão.
            </p>
        `;

        container.innerHTML = html;
    }

    // ─────────────────────────────────────────
    //  IMPRESSÃO / EXPORTAR PDF
    // ─────────────────────────────────────────

    _imprimirElemento(elementId, titulo) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const janela = window.open('', '_blank', 'width=1000,height=700');
        janela.document.write(`
            <!DOCTYPE html><html lang="pt-BR">
            <head>
                <meta charset="UTF-8"><title>${titulo}</title>
                <style>
                    body  { font-family:Arial,sans-serif;font-size:13px;margin:24px;color:#222; }
                    h1    { font-size:18px;margin-bottom:4px; }
                    table { width:100%;border-collapse:collapse;margin-top:12px; }
                    th,td { padding:8px 10px;border:1px solid #ddd; }
                    thead tr { background:#f0f0f0; }
                    @media print { button { display:none; } body { margin:10mm; } }
                </style>
            </head>
            <body>
                <h1>${titulo}</h1>
                <p style="color:#666;font-size:12px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                ${el.innerHTML}
                <br/>
                <button onclick="window.print()"
                        style="padding:10px 20px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                    🖨️ Imprimir / Salvar PDF
                </button>
            </body></html>
        `);
        janela.document.close();
    }
}

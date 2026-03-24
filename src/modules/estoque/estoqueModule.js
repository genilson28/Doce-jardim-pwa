export class EstoqueModule {
    constructor(app) {
        this.app = app;
        this.produtosFiltrados = [];
    }

    async listar() {
        console.log('🔄 Carregando estoque...');
        
        const produtos = await this.app.produtos.carregar();

        if (!produtos || produtos.length === 0) {
            this.renderEmpty();
            return;
        }

        this.produtosFiltrados = produtos;

        this.app.pagination.setup(this.produtosFiltrados, 5);
        this.renderizarPagina();
    }

    renderEmpty() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;

        lista.innerHTML = `
            <div class="empty-state">
                📦 Nenhum produto cadastrado
            </div>
        `;
    }

    getStatus(produto) {
        if (produto.estoque === 0) {
            return { label: 'SEM ESTOQUE', class: 'estoque-critico', icon: '❌' };
        } else if (produto.estoque <= 5) {
            return { label: 'BAIXO', class: 'estoque-baixo', icon: '⚠️' };
        } else {
            return { label: 'OK', class: 'estoque-ok', icon: '✅' };
        }
    }

    aplicarFiltros() {
        const busca = document.getElementById('buscaEstoque')?.value.toLowerCase() || '';
        const categoria = document.getElementById('filtroCategoria')?.value || '';
        const statusFiltro = document.getElementById('filtroStatus')?.value || '';

        const produtos = this.app.produtos.getProdutos();

        this.produtosFiltrados = produtos.filter(p => {
            const status = this.getStatus(p);

            const okBusca = p.nome.toLowerCase().includes(busca);
            const okCategoria = !categoria || p.categoria === categoria;

            let okStatus = true;
            if (statusFiltro === 'baixo') okStatus = p.estoque <= 5 && p.estoque > 0;
            if (statusFiltro === 'critico') okStatus = p.estoque === 0;

            return okBusca && okCategoria && okStatus;
        });

        this.app.pagination.setup(this.produtosFiltrados, 5);
        this.renderizarPagina();
    }

    atualizarDashboard() {
        const total = this.produtosFiltrados.length;
        const baixo = this.produtosFiltrados.filter(p => p.estoque <= 5 && p.estoque > 0).length;
        const valor = this.produtosFiltrados.reduce((s, p) => s + (p.preco * p.estoque), 0);

        document.getElementById('dashTotal').innerText = total;
        document.getElementById('dashBaixo').innerText = baixo;
        document.getElementById('dashValor').innerText = 'R$ ' + valor.toFixed(2);
    }

    exportarPDF(modoFornecedor = false) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let y = 10;

        doc.text("RELATÓRIO DE ESTOQUE", 10, y);
        y += 10;

        this.produtosFiltrados.forEach(p => {
            let linha = `${p.nome} | QTD: ${p.estoque}`;

            if (!modoFornecedor) {
                linha += ` | R$ ${p.preco}`;
            }

            doc.text(linha, 10, y);
            y += 8;
        });

        doc.save(modoFornecedor ? "fornecedor.pdf" : "estoque-completo.pdf");
    }

    renderizarPagina() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;

        const pagina = this.app.pagination.getPageItems();

        let html = `

            <!-- DASHBOARD -->
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Total</h3>
                    <div id="dashTotal" class="stat-value">0</div>
                </div>
                <div class="stat-card">
                    <h3>Baixo</h3>
                    <div id="dashBaixo" class="stat-value">0</div>
                </div>
                <div class="stat-card">
                    <h3>Valor</h3>
                    <div id="dashValor" class="stat-value">0</div>
                </div>
            </div>

            <!-- FILTROS -->
            <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                <input id="buscaEstoque" placeholder="Buscar..." class="input-base">
                
                <select id="filtroCategoria" class="input-base">
                    <option value="">Categorias</option>
                </select>

                <select id="filtroStatus" class="input-base">
                    <option value="">Status</option>
                    <option value="baixo">Baixo</option>
                    <option value="critico">Crítico</option>
                </select>

                <button id="btnPdf" class="btn-primary">PDF</button>
                <button id="btnPdfFornecedor" class="btn-secondary">Fornecedor</button>
            </div>

            <!-- TABELA -->
            <div class="tabela-estoque-container">
                <table class="tabela-estoque">
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Categoria</th>
                            <th>Qtd</th>
                            <th>Preço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        pagina.forEach(produto => {
            const status = this.getStatus(produto);

            html += `
                <tr>
                    <td><strong>${produto.nome}</strong></td>
                    <td>${produto.categoria}</td>
                    <td>${produto.estoque}</td>
                    <td>R$ ${(produto.preco ?? 0).toFixed(2)}</td>
                    <td>
                        <span class="badge ${status.class}">
                            ${status.icon} ${status.label}
                        </span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>

            <div id="paginacaoEstoque" class="paginacao"></div>
        `;

        lista.innerHTML = html;

        // EVENTOS
        document.getElementById('buscaEstoque').addEventListener('input', () => this.aplicarFiltros());
        document.getElementById('filtroCategoria').addEventListener('change', () => this.aplicarFiltros());
        document.getElementById('filtroStatus').addEventListener('change', () => this.aplicarFiltros());

        document.getElementById('btnPdf').onclick = () => this.exportarPDF(false);
        document.getElementById('btnPdfFornecedor').onclick = () => this.exportarPDF(true);

        this.atualizarDashboard();

        this.app.pagination.renderPaginationControls(
            'paginacaoEstoque',
            this.renderizarPagina.bind(this)
        );
    }
}

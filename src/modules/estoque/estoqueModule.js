export class EstoqueModule {
    constructor(app) {
        this.app = app;
        this.filtro = 'todos';
        this.filtroCategoria = 'todos';
        this.busca = '';
        this.listaFiltrada = [];
    }

    async listar() {
        const produtos = await this.app.produtos.carregar();

        if (!produtos || produtos.length === 0) {
            this.renderEmpty();
            return;
        }

        this.produtos = produtos;
        this.aplicarFiltros();
    }

    aplicarFiltros() {
        let filtrados = [...this.produtos];

        // 🔍 BUSCA
        if (this.busca) {
            filtrados = filtrados.filter(p =>
                p.nome.toLowerCase().includes(this.busca.toLowerCase())
            );
        }

        // 📂 CATEGORIA
        if (this.filtroCategoria !== 'todos') {
            filtrados = filtrados.filter(p =>
                p.categoria === this.filtroCategoria
            );
        }

        // 🚦 STATUS
        if (this.filtro === 'baixo') {
            filtrados = filtrados.filter(p => p.estoque <= 5 && p.estoque > 0);
        }

        if (this.filtro === 'zerado') {
            filtrados = filtrados.filter(p => p.estoque === 0);
        }

        this.listaFiltrada = filtrados;

        this.app.pagination.setup(filtrados, 5);
        this.renderizarPagina();
    }

    renderEmpty() {
        document.getElementById('listaEstoque').innerHTML =
            `<div class="empty-state">📦 Nenhum produto cadastrado</div>`;
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

    renderizarPagina() {
        const lista = document.getElementById('listaEstoque');
        const pagina = this.app.pagination.getPageItems();

        const categorias = [...new Set(this.produtos.map(p => p.categoria))];

        let html = `
            <div class="estoque-header">
                <h3>📦 Controle de Estoque</h3>
            </div>

            <!-- FILTROS -->
            <div class="filtros-estoque">
                <input type="text" placeholder="🔍 Buscar..."
                    value="${this.busca}"
                    oninput="app.estoque.busca = this.value; app.estoque.aplicarFiltros()">

                <select onchange="app.estoque.filtroCategoria = this.value; app.estoque.aplicarFiltros()">
                    <option value="todos">Categorias</option>
                    ${categorias.map(c => `
                        <option value="${c}" ${this.filtroCategoria === c ? 'selected' : ''}>${c}</option>
                    `).join('')}
                </select>

                <select onchange="app.estoque.filtro = this.value; app.estoque.aplicarFiltros()">
                    <option value="todos">Status</option>
                    <option value="baixo" ${this.filtro === 'baixo' ? 'selected' : ''}>Baixo</option>
                    <option value="zerado" ${this.filtro === 'zerado' ? 'selected' : ''}>Sem estoque</option>
                </select>

                <button onclick="app.estoque.gerarPDFCompleto()">💰 PDF Completo</button>
                <button onclick="app.estoque.gerarPDFFornecedor()">📦 PDF Fornecedor</button>
            </div>

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
                <tr class="${status.class}">
                    <td>${produto.nome}</td>
                    <td>${produto.categoria}</td>
                    <td>${produto.estoque}</td>
                    <td>R$ ${(produto.preco ?? 0).toFixed(2)}</td>
                    <td>${status.icon} ${status.label}</td>
                </tr>
            `;
        });

        html += `</tbody></table>
            <div id="paginacaoEstoque"></div>
        `;

        lista.innerHTML = html;

        this.app.pagination.renderPaginationControls(
            'paginacaoEstoque',
            this.renderizarPagina.bind(this)
        );
    }

    // 💰 PDF COMPLETO (COM VALORES)
    gerarPDFCompleto() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let y = 10;
        doc.setFontSize(14);
        doc.text("Relatório Completo de Estoque", 10, y);
        y += 10;

        this.listaFiltrada.forEach(p => {
            doc.setFontSize(10);
            doc.text(`${p.nome}`, 10, y);
            doc.text(`Cat: ${p.categoria}`, 10, y + 5);
            doc.text(`Qtd: ${p.estoque}`, 100, y);
            doc.text(`R$ ${p.preco}`, 100, y + 5);

            y += 15;
            if (y > 270) {
                doc.addPage();
                y = 10;
            }
        });

        doc.save("estoque_completo.pdf");
    }

    // 📦 PDF FORNECEDOR (SEM VALORES)
    gerarPDFFornecedor() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let y = 10;
        doc.setFontSize(14);
        doc.text("Relatório para Fornecedor", 10, y);
        y += 10;

        this.listaFiltrada.forEach(p => {
            doc.setFontSize(10);
            doc.text(`${p.nome}`, 10, y);
            doc.text(`Categoria: ${p.categoria}`, 10, y + 5);
            doc.text(`Quantidade: ${p.estoque}`, 100, y);

            y += 15;
            if (y > 270) {
                doc.addPage();
                y = 10;
            }
        });

        doc.save("estoque_fornecedor.pdf");
    }
}

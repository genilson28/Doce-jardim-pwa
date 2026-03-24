export class EstoqueModule {
    constructor(app) {
        this.app = app;
    }

    async listar() {
        console.log('🔄 Carregando estoque...');
        
        const produtos = await this.app.produtos.carregar();

        if (!produtos || produtos.length === 0) {
            this.renderEmpty();
            return;
        }

        this.app.pagination.setup(produtos, 5);
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

    renderizarPagina() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;

        const produtos = this.app.produtos.getProdutos();
        const pagina = this.app.pagination.getPageItems();

        const inicio = (this.app.pagination.currentPage - 1) * this.app.pagination.itemsPerPage + 1;
        const fim = Math.min(
            this.app.pagination.currentPage * this.app.pagination.itemsPerPage,
            produtos.length
        );

        let html = `
            <div class="estoque-header">
                <h3>📦 Controle de Estoque</h3>
                <p>Mostrando ${inicio} - ${fim} de ${produtos.length}</p>
            </div>

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
                <tr class="${status.class}">
                    <td><strong>${produto.nome}</strong></td>
                    <td>${produto.categoria}</td>
                    <td><span class="qtd">${produto.estoque}</span></td>
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

        // PAGINAÇÃO PROFISSIONAL (SEM ONCLICK)
        this.app.pagination.renderPaginationControls(
            'paginacaoEstoque',
            this.renderizarPagina.bind(this)
        );
    }
}

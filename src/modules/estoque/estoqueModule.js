export class EstoqueModule {
    constructor(app) {
        this.app = app;
    }

    async listar() {
        console.log('🔄 Carregando estoque...');
        await this.app.produtos.carregar();
        
        const lista = document.getElementById('listaEstoque');
        if (!lista) {
            console.error('❌ Elemento listaEstoque não encontrado');
            return;
        }

        if (this.app.produtos.getProdutos().length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum produto cadastrado</div>';
            return;
        }

        this.app.pagination.setup(this.app.produtos.getProdutos(), 5);
        this.renderizarPagina();
    }

    renderizarPagina() {
        const lista = document.getElementById('listaEstoque');
        if (!lista) return;

        const produtosPagina = this.app.pagination.getPageItems();

        let html = `
            <div class="estoque-header">
                <h3>Controle de Estoque</h3>
                <p class="estoque-info">Mostrando ${(this.app.pagination.currentPage - 1) * this.app.pagination.itemsPerPage + 1}-${Math.min(this.app.pagination.currentPage * this.app.pagination.itemsPerPage, this.app.produtos.getProdutos().length)} de ${this.app.produtos.getProdutos().length} produtos</p>
            </div>
            <div class="tabela-estoque-container">
                <table class="tabela-estoque">
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Qtd</th>
                            <th>Preço</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        produtosPagina.forEach(produto => {
            let badge = '', badgeClass = '', statusIcone = '';
            
            if (produto.estoque === 0) {
                badge = 'SEM ESTOQUE';
                badgeClass = 'estoque-critico';
                statusIcone = '❌';
            } else if (produto.estoque <= 5) {
                badge = 'BAIXO';
                badgeClass = 'estoque-baixo';
                statusIcone = '⚠️';
            } else {
                badge = 'OK';
                badgeClass = 'estoque-ok';
                statusIcone = '✅';
            }

            html += `
                <tr class="linha-estoque ${badgeClass}">
                    <td data-label="Produto">
                        <strong>${produto.nome}</strong>
                        <small class="categoria-badge">${produto.categoria}</small>
                    </td>
                    <td data-label="Quantidade">
                        <span class="quantidade-destaque">${produto.estoque}</span>
                    </td>
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
                <button onclick="app.pagination.changePage('anterior', 'listaEstoque', app.estoque.renderizarPagina.bind(app.estoque))" 
                        class="btn-paginacao" ${this.app.pagination.currentPage === 1 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                <span class="info-pagina">Página ${this.app.pagination.currentPage} de ${this.app.pagination.totalPages}</span>
                <button onclick="app.pagination.changePage('proxima', 'listaEstoque', app.estoque.renderizarPagina.bind(app.estoque))" 
                        class="btn-paginacao" ${this.app.pagination.currentPage === this.app.pagination.totalPages ? 'disabled' : ''}>
                    Próxima →
                </button>
            </div>
        `;

        lista.innerHTML = html;
    }
}

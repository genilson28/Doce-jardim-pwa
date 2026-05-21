// ==================== SISTEMA DE PAGINAÇÃO GENÉRICO ====================

export class Pagination {
    constructor() {
        this.currentPage = 1;
        this.itemsPerPage = 25;
        this.totalItems = 0;
        this.totalPages = 0;
        this.filteredData = [];
        this.currentCategory = 'todas';
    }

    setup(items, itemsPerPage = 25) {
        this.filteredData = items;
        this.totalItems = items.length;
        this.itemsPerPage = itemsPerPage;
        this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        this.currentPage = 1;
    }

    getPageItems() {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        return this.filteredData.slice(start, end);
    }

    changePage(direction, containerId, renderFunction) {
        if (direction === 'anterior' && this.currentPage > 1) {
            this.currentPage--;
        } else if (direction === 'proxima' && this.currentPage < this.totalPages) {
            this.currentPage++;
        }
        
        renderFunction();
        
        const container = document.getElementById(containerId);
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    renderPaginationControls(containerId, renderFunction) {
        const paginacaoEl = document.getElementById(containerId);
        if (!paginacaoEl) return;

        if (this.totalPages <= 1) {
            paginacaoEl.style.display = 'none';
            return;
        }

        paginacaoEl.innerHTML = '';
        paginacaoEl.style.display = 'flex';

        // Botão Anterior
        const btnAnterior = document.createElement('button');
        btnAnterior.className = 'btn-paginacao';
        btnAnterior.textContent = '← Anterior';
        btnAnterior.disabled = this.currentPage === 1;
        btnAnterior.addEventListener('click', () => 
            this.changePage('anterior', containerId.replace('paginacao', 'lista'), renderFunction)
        );
        paginacaoEl.appendChild(btnAnterior);

        // Informação da Página
        const spanInfo = document.createElement('span');
        spanInfo.className = 'info-pagina';
        spanInfo.textContent = `Página ${this.currentPage} de ${this.totalPages}`;
        paginacaoEl.appendChild(spanInfo);

        // Botão Próxima
        const btnProxima = document.createElement('button');
        btnProxima.className = 'btn-paginacao';
        btnProxima.textContent = 'Próxima →';
        btnProxima.disabled = this.currentPage === this.totalPages;
        btnProxima.addEventListener('click', () => 
            this.changePage('proxima', containerId.replace('paginacao', 'lista'), renderFunction)
        );
        paginacaoEl.appendChild(btnProxima);
    }
}

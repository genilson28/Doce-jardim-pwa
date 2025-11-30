// ==================== SISTEMA DE FILTRO GENÉRICO ====================

export class Filtering {
    apply(data, searchTerm, category) {
        let filtered = data;
        
        if (category && category !== 'todas') {
            filtered = filtered.filter(item => item.categoria === category);
        }
        
        if (searchTerm) {
            filtered = filtered.filter(item => 
                item.nome.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        return filtered;
    }
}

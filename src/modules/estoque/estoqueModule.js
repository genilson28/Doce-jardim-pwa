/* Estilos para busca e relatório */
.header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 15px;
}

.acoes-rapidas {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.busca-container {
    position: relative;
    display: inline-block;
}

.input-busca {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    width: 250px;
}

.input-busca:focus {
    outline: none;
    border-color: #4caf50;
}

.btn-limpar-busca {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: #999;
    font-size: 14px;
}

.btn-relatorio {
    padding: 8px 16px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

/* Modal */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.relatorio-modal {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 1200px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
}

.relatorio-header {
    padding: 20px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.relatorio-header h2 {
    margin: 0;
    font-size: 20px;
}

.btn-fechar {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
}

.relatorio-conteudo {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
}

.fornecedor-card {
    margin-bottom: 30px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
}

.fornecedor-header {
    background: #f8f9fa;
    padding: 15px;
}

.fornecedor-header h3 {
    margin: 0 0 10px 0;
}

.fornecedor-stats {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
}

.stat {
    font-size: 14px;
    color: #666;
}

.stat.alert {
    color: #ffa500;
}

.stat.critical {
    color: #ff4444;
}

.relatorio-tabela {
    width: 100%;
    border-collapse: collapse;
}

.relatorio-tabela th,
.relatorio-tabela td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #f0f0f0;
}

.relatorio-tabela th {
    background: #fafafa;
    font-weight: 600;
}

.status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.status-critico {
    background: #ff4444;
    color: white;
}

.status-baixo {
    background: #ffa500;
    color: white;
}

.status-ok {
    background: #4caf50;
    color: white;
}

.relatorio-footer {
    padding: 20px;
    border-top: 1px solid #e0e0e0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.btn-imprimir,
.btn-exportar,
.btn-fechar-relatorio {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
}

.btn-imprimir {
    background: #2196f3;
    color: white;
}

.btn-exportar {
    background: #4caf50;
    color: white;
}

.btn-fechar-relatorio {
    background: #f44336;
    color: white;
}

.empty-state {
    text-align: center;
    padding: 40px;
    color: #999;
}

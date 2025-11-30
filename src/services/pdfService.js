// ==================== SERVIÇO DE GERAÇÃO DE PDF ====================

/**
 * Gera comprovante de venda em PDF
 */
export function gerarComprovantePDF(venda, mesaNumero = null) {
    if (typeof window.jspdf === 'undefined') {
        console.error('Biblioteca jsPDF não carregada');
        return false;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Configurações do documento
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        
        // Cabeçalho
        doc.text('🍰 DOCE JARDIM 🍰', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Comprovante de Venda', 105, 22, { align: 'center' });
        
        // Linha separadora
        doc.setDrawColor(200, 200, 200);
        doc.line(15, 25, 195, 25);
        
        let yPosition = 35;
        
        // Informações da venda
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('INFORMAÇÕES DA VENDA', 15, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        const dataVenda = new Date(venda.data).toLocaleString('pt-BR');
        doc.text(`Data/Hora: ${dataVenda}`, 20, yPosition);
        yPosition += 6;
        
        if (mesaNumero) {
            doc.text(`Mesa: ${mesaNumero}`, 20, yPosition);
            yPosition += 6;
        }
        
        doc.text(`Atendente: ${venda.usuario_nome || 'Sistema'}`, 20, yPosition);
        yPosition += 6;
        
        doc.text(`Forma de Pagamento: ${venda.forma_pagamento}`, 20, yPosition);
        yPosition += 10;
        
        // Itens da venda
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('ITENS VENDIDOS', 15, yPosition);
        yPosition += 10;
        
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.text('Produto', 20, yPosition);
        doc.text('Qtd', 120, yPosition);
        doc.text('Valor', 160, yPosition);
        yPosition += 6;
        
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPosition, 195, yPosition);
        yPosition += 8;
        
        // Lista de itens
        let itens = [];
        try {
            itens = JSON.parse(venda.itens || '[]');
        } catch (e) {
            console.error('Erro ao parsear itens:', e);
            itens = [];
        }
        
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        
        itens.forEach(item => {
            if (yPosition > 250) {
                doc.addPage();
                yPosition = 20;
            }
            
            const nomeProduto = item.nome || 'Produto não identificado';
            const nomeLines = doc.splitTextToSize(nomeProduto, 80);
            doc.text(nomeLines, 20, yPosition);
            
            doc.text(`${item.quantidade || 0}x`, 120, yPosition);
            
            const valorItem = ((item.preco || 0) * (item.quantidade || 0)).toFixed(2);
            doc.text(`R$ ${valorItem}`, 160, yPosition);
            
            yPosition += (nomeLines.length * 5) + 2;
        });
        
        yPosition += 5;
        doc.line(15, yPosition, 195, yPosition);
        yPosition += 10;
        
        // Totais
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        
        doc.text('Subtotal:', 120, yPosition);
        doc.text(`R$ ${venda.subtotal?.toFixed(2) || '0.00'}`, 160, yPosition);
        yPosition += 7;
        
        if (venda.desconto && venda.desconto > 0) {
            doc.text('Desconto:', 120, yPosition);
            doc.text(`- R$ ${venda.desconto.toFixed(2)}`, 160, yPosition);
            yPosition += 7;
        }
        
        doc.setFontSize(12);
        doc.text('TOTAL:', 120, yPosition);
        doc.text(`R$ ${venda.total?.toFixed(2) || '0.00'}`, 160, yPosition);
        yPosition += 12;
        
        // Rodapé
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('Obrigado pela preferência! Volte sempre!', 105, yPosition, { align: 'center' });
        yPosition += 5;
        doc.text('Documento gerado automaticamente pelo sistema', 105, yPosition, { align: 'center' });
        
        // Gerar nome do arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const mesaInfo = mesaNumero ? `mesa-${mesaNumero}-` : '';
        const fileName = `comprovante-${mesaInfo}${timestamp}.pdf`;
        
        // Salvar PDF
        doc.save(fileName);
        
        console.log('✅ Comprovante PDF gerado com sucesso');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao gerar comprovante PDF:', error);
        return false;
    }
}

// Exportar objeto de serviço
export const pdfService = {
    gerarComprovantePDF
};
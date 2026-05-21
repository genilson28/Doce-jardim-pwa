// ==================== SERVIÇO DE GERAÇÃO DE PDF ====================

export function gerarComprovantePDF(venda, mesaNumero = null) {
    if (typeof window.jspdf === 'undefined') {
        console.error('Biblioteca jsPDF nao carregada');
        return false;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('DOCE JARDIM', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Comprovante de Venda', 105, 22, { align: 'center' });

        doc.setDrawColor(200, 200, 200);
        doc.line(15, 25, 195, 25);

        let yPosition = 35;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('INFORMACOES DA VENDA', 15, yPosition);
        yPosition += 10;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        doc.text(`Data/Hora: ${new Date(venda.data).toLocaleString('pt-BR')}`, 20, yPosition);
        yPosition += 6;

        if (mesaNumero) {
            doc.text(`Mesa: ${mesaNumero}`, 20, yPosition);
            yPosition += 6;
        }

        if (venda.cliente_nome) {
            doc.text(`Cliente: ${venda.cliente_nome}`, 20, yPosition);
            yPosition += 6;
        }

        doc.text(`Atendente: ${venda.usuario_nome || 'Sistema'}`, 20, yPosition);
        yPosition += 6;

        const formasPagamento = {
            dinheiro: 'Dinheiro', pix: 'PIX',
            credito: 'Cartao Credito', debito: 'Cartao Debito',
            fiado: 'Fiado (a prazo)'
        };
        doc.text(`Forma de Pagamento: ${formasPagamento[venda.forma_pagamento] || venda.forma_pagamento}`, 20, yPosition);
        yPosition += 10;

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

        let itens = [];
        try { itens = JSON.parse(venda.itens || '[]'); } catch (e) {}

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');

        itens.forEach(item => {
            if (yPosition > 250) { doc.addPage(); yPosition = 20; }
            const nomeLines = doc.splitTextToSize(item.nome || 'Produto', 80);
            doc.text(nomeLines, 20, yPosition);
            doc.text(`${item.quantidade || 0}x`, 120, yPosition);
            doc.text(`R$ ${((item.preco || 0) * (item.quantidade || 0)).toFixed(2)}`, 160, yPosition);
            yPosition += (nomeLines.length * 5) + 2;
        });

        yPosition += 5;
        doc.line(15, yPosition, 195, yPosition);
        yPosition += 10;

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

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('Obrigado pela preferencia! Volte sempre!', 105, yPosition, { align: 'center' });

        const mesaInfo = mesaNumero ? `mesa-${mesaNumero}-` : '';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`comprovante-${mesaInfo}${timestamp}.pdf`);

        console.log('Comprovante PDF gerado com sucesso');
        return true;
    } catch (error) {
        console.error('Erro ao gerar comprovante PDF:', error);
        return false;
    }
}

/**
 * Gera comanda da mesa em PDF (para imprimir durante o atendimento)
 */
export function gerarComandaPDF(itens, mesaNumero) {
    if (typeof window.jspdf === 'undefined') {
        console.error('Biblioteca jsPDF nao carregada');
        return false;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('DOCE JARDIM', 105, 18, { align: 'center' });

        doc.setFontSize(13);
        doc.setFont(undefined, 'normal');
        doc.text('Comanda da Mesa', 105, 26, { align: 'center' });

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(15, 30, 195, 30);

        doc.setFontSize(28);
        doc.setFont(undefined, 'bold');
        doc.text(`MESA ${mesaNumero}`, 105, 46, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 105, 53, { align: 'center' });

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(15, 57, 195, 57);

        let yPosition = 68;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('PRODUTO', 20, yPosition);
        doc.text('QTD', 130, yPosition);
        doc.text('SUBTOTAL', 158, yPosition);
        yPosition += 5;

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(15, yPosition, 195, yPosition);
        yPosition += 8;

        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);

        let total = 0;

        itens.forEach((item, index) => {
            if (yPosition > 260) { doc.addPage(); yPosition = 20; }

            if (index % 2 === 0) {
                doc.setFillColor(248, 248, 248);
                doc.rect(15, yPosition - 5, 180, 9, 'F');
            }

            const nomeLines = doc.splitTextToSize(item.nome || 'Produto', 100);
            doc.setTextColor(0, 0, 0);
            doc.text(nomeLines, 20, yPosition);
            doc.text(`${item.quantidade}x`, 130, yPosition);

            const subtotalItem = (item.preco || 0) * (item.quantidade || 0);
            total += subtotalItem;
            doc.text(`R$ ${subtotalItem.toFixed(2)}`, 158, yPosition);

            yPosition += (nomeLines.length * 6) + 3;
        });

        yPosition += 3;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.8);
        doc.line(15, yPosition, 195, yPosition);
        yPosition += 12;

        doc.setFontSize(15);
        doc.setFont(undefined, 'bold');
        doc.text('TOTAL:', 115, yPosition);
        doc.text(`R$ ${total.toFixed(2)}`, 158, yPosition);
        yPosition += 15;

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text('Obrigado pela preferencia!', 105, yPosition, { align: 'center' });

        doc.save(`comanda-mesa-${mesaNumero}-${Date.now()}.pdf`);
        console.log('Comanda PDF gerada com sucesso');
        return true;
    } catch (error) {
        console.error('Erro ao gerar comanda PDF:', error);
        return false;
    }
}

export const pdfService = {
    gerarComprovantePDF,
    gerarComandaPDF
};

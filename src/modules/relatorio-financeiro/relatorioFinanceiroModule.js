// ==================== MÓDULO RELATÓRIO FINANCEIRO ====================

import { mostrarToast } from '../../utils/ui.js';
import { formatarMoeda } from '../../utils/formatters.js';

export class RelatorioFinanceiroModule {
    constructor(app) {
        this.app = app;
        this.dadosRelatorio = null;
    }

    async carregar() {
        try {
            await this.app.compras.carregar();
            await this.app.vendas.carregar();
            
            this.filtrar('hoje');
        } catch (error) {
            console.error('❌ Erro ao carregar relatório financeiro:', error);
            mostrarToast('Erro ao carregar relatório', 'error');
        }
    }

    filtrar(periodo) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        let dataInicio, dataFim;

        switch(periodo) {
            case 'hoje':
                dataInicio = hoje;
                dataFim = new Date(hoje);
                dataFim.setHours(23, 59, 59, 999);
                break;
            
            case 'semana':
                dataInicio = new Date(hoje);
                dataInicio.setDate(hoje.getDate() - hoje.getDay());
                dataFim = new Date();
                break;
            
            case 'mes':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date();
                break;
            
            default:
                dataInicio = new Date(0);
                dataFim = new Date();
        }

        const comprasFiltradas = this.app.compras.compras.filter(c => {
            const dataCompra = new Date(c.data);
            return dataCompra >= dataInicio && dataCompra <= dataFim;
        });

        const vendasFiltradas = this.app.vendas.vendas.filter(v => {
            const dataVenda = new Date(v.data);
            return dataVenda >= dataInicio && dataVenda <= dataFim;
        });

        this.calcularEstatisticas(comprasFiltradas, vendasFiltradas, periodo);
        
        document.querySelectorAll('.filtros-financeiro .btn-filtro').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`filtroFinanceiro${periodo.charAt(0).toUpperCase() + periodo.slice(1)}`);
        if (btnAtivo) btnAtivo.classList.add('active');
    }

    filtrarPorPeriodo() {
        const dataInicio = document.getElementById('financeiroDataInicio').value;
        const dataFim = document.getElementById('financeiroDataFim').value;

        if (!dataInicio || !dataFim) {
            mostrarToast('Selecione as datas', 'warning');
            return;
        }

        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59, 999);

        const comprasFiltradas = this.app.compras.compras.filter(c => {
            const dataCompra = new Date(c.data);
            return dataCompra >= inicio && dataCompra <= fim;
        });

        const vendasFiltradas = this.app.vendas.vendas.filter(v => {
            const dataVenda = new Date(v.data);
            return dataVenda >= inicio && dataVenda <= fim;
        });

        this.calcularEstatisticas(comprasFiltradas, vendasFiltradas, 'personalizado');
        
        document.querySelectorAll('.filtros-financeiro .btn-filtro').forEach(btn => btn.classList.remove('active'));
    }

    calcularEstatisticas(compras, vendas, periodo) {
        const totalInvestido = compras.reduce((sum, c) => sum + parseFloat(c.valor_total || 0), 0);
        const totalVendido = vendas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

        let custoVendas = 0;
        
        for (const venda of vendas) {
            try {
                const itens = JSON.parse(venda.itens || '[]');
                for (const item of itens) {
                    const produto = this.app.produtos.getProdutos().find(p => p.id === item.id);
                    if (produto && produto.custo_unitario) {
                        custoVendas += produto.custo_unitario * item.quantidade;
                    }
                }
            } catch (e) {
                console.error('Erro ao processar venda:', e);
            }
        }

        const lucroReal = totalVendido - custoVendas;
        const margemLucro = totalVendido > 0 ? ((lucroReal / totalVendido) * 100) : 0;

        const produtosLucro = this.calcularProdutosMaisLucrativos(vendas);

        document.getElementById('totalInvestido').textContent = totalInvestido.toFixed(2);
        document.getElementById('totalVendido').textContent = totalVendido.toFixed(2);
        document.getElementById('lucroReal').textContent = lucroReal.toFixed(2);
        document.getElementById('margemLucro').textContent = margemLucro.toFixed(1);

        this.renderizarProdutosMaisLucrativos(produtosLucro);
        this.renderizarHistoricoCompras(compras);
        this.renderizarHistoricoVendas(vendas);

        this.dadosRelatorio = {
            periodo,
            totalInvestido,
            totalVendido,
            custoVendas,
            lucroReal,
            margemLucro,
            compras,
            vendas,
            produtosLucro
        };
    }

    calcularProdutosMaisLucrativos(vendas) {
        const produtos = {};

        for (const venda of vendas) {
            try {
                const itens = JSON.parse(venda.itens || '[]');
                for (const item of itens) {
                    const produto = this.app.produtos.getProdutos().find(p => p.id === item.id);
                    
                    if (!produtos[item.id]) {
                        produtos[item.id] = {
                            nome: item.nome,
                            quantidadeVendida: 0,
                            valorVendido: 0,
                            custoTotal: 0,
                            lucro: 0
                        };
                    }

                    produtos[item.id].quantidadeVendida += item.quantidade;
                    produtos[item.id].valorVendido += item.preco * item.quantidade;
                    
                    if (produto && produto.custo_unitario) {
                        produtos[item.id].custoTotal += produto.custo_unitario * item.quantidade;
                    }
                }
            } catch (e) {
                console.error('Erro ao processar venda:', e);
            }
        }

        Object.values(produtos).forEach(p => {
            p.lucro = p.valorVendido - p.custoTotal;
            p.margemLucro = p.valorVendido > 0 ? ((p.lucro / p.valorVendido) * 100) : 0;
        });

        return Object.values(produtos).sort((a, b) => b.lucro - a.lucro).slice(0, 10);
    }

    renderizarProdutosMaisLucrativos(produtos) {
        const lista = document.getElementById('produtosMaisLucrativos');
        if (!lista) return;

        if (produtos.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma venda no período</div>';
            return;
        }

        lista.innerHTML = produtos.map((produto, index) => `
            <div class="produto-lucro-item">
                <div class="produto-lucro-info">
                    <h4>${index + 1}. ${produto.nome}</h4>
                    <p>Vendidos: ${produto.quantidadeVendida} un. | Margem: ${produto.margemLucro.toFixed(1)}%</p>
                </div>
                <div class="produto-lucro-valores">
                    <small>Vendido: R$ ${produto.valorVendido.toFixed(2)}</small>
                    <strong style="color: ${produto.lucro > 0 ? 'green' : 'red'};">
                        Lucro: R$ ${produto.lucro.toFixed(2)}
                    </strong>
                </div>
            </div>
        `).join('');
    }

    renderizarHistoricoCompras(compras) {
        const historico = document.getElementById('historicoComprasFinanceiro');
        if (!historico) return;

        if (compras.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma compra neste período</div>';
            return;
        }

        const totalPeriodo = compras.reduce((sum, c) => sum + parseFloat(c.valor_total || 0), 0);

        let html = `
            <div class="resumo-periodo">
                <strong>Total investido: R$ ${totalPeriodo.toFixed(2)}</strong> | ${compras.length} compra(s)
            </div>
        `;

        html += compras.map(compra => `
            <div class="venda-item">
                <div class="venda-item-header">
                    <strong>📦 ${compra.data_exibicao}</strong>
                    <strong class="valor-venda" style="color: #f44336;">- R$ ${compra.valor_total.toFixed(2)}</strong>
                </div>
                <p><strong>Fornecedor:</strong> ${compra.fornecedor_nome}</p>
                ${compra.observacoes ? `<p><strong>Obs:</strong> ${compra.observacoes}</p>` : ''}
            </div>
        `).join('');

        historico.innerHTML = html;
    }

    renderizarHistoricoVendas(vendas) {
        const historico = document.getElementById('historicoVendasFinanceiro');
        if (!historico) return;

        if (vendas.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma venda neste período</div>';
            return;
        }

        const totalPeriodo = vendas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

        let html = `
            <div class="resumo-periodo">
                <strong>Total vendido: R$ ${totalPeriodo.toFixed(2)}</strong> | ${vendas.length} venda(s)
            </div>
        `;

        html += vendas.slice(0, 20).map(venda => {
            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>💰 ${venda.data_exibicao}${mesaTexto}</strong>
                        <strong class="valor-venda" style="color: #4CAF50;">+ R$ ${venda.total.toFixed(2)}</strong>
                    </div>
                    <p><strong>Pagamento:</strong> ${venda.forma_pagamento}</p>
                </div>
            `;
        }).join('');

        if (vendas.length > 20) {
            html += `<p style="text-align: center; color: #999; margin-top: 10px;">Mostrando 20 de ${vendas.length} vendas</p>`;
        }

        historico.innerHTML = html;
    }

    exportarPDF() {
        if (typeof window.jspdf === 'undefined') {
            mostrarToast('Erro: Biblioteca de PDF não carregada.', 'error');
            return;
        }

        if (!this.dadosRelatorio) {
            mostrarToast('Carregue os dados primeiro!', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const dados = this.dadosRelatorio;

        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('RELATÓRIO FINANCEIRO', 105, 15, { align: 'center' });
        doc.text('🍰 DOCE JARDIM 🍰', 105, 23, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 30, { align: 'center' });
        doc.text(`Período: ${dados.periodo}`, 105, 35, { align: 'center' });

        let y = 45;

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('💰 RESUMO FINANCEIRO', 14, y);
        y += 10;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(240, 240, 240);
        doc.rect(14, y, 182, 35, 'F');
        doc.rect(14, y, 182, 35, 'S');
        
        y += 8;
        doc.setFont(undefined, 'bold');
        doc.text(`Total Investido:`, 20, y);
        doc.setTextColor(244, 67, 54);
        doc.text(`R$ ${dados.totalInvestido.toFixed(2)}`, 160, y, { align: 'right' });
        
        y += 7;
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Vendido:`, 20, y);
        doc.setTextColor(76, 175, 80);
        doc.text(`R$ ${dados.totalVendido.toFixed(2)}`, 160, y, { align: 'right' });
        
        y += 10;
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(`LUCRO REAL:`, 20, y);
        doc.setTextColor(dados.lucroReal >= 0 ? 0 : 255, dados.lucroReal >= 0 ? 128 : 0, 0);
        doc.text(`R$ ${dados.lucroReal.toFixed(2)}`, 160, y, { align: 'right' });
        
        y += 7;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Margem: ${dados.margemLucro.toFixed(1)}%`, 20, y);

        const timestamp = new Date().toISOString().split('T')[0];
        doc.save(`relatorio-financeiro-${dados.periodo}-${timestamp}.pdf`);

        mostrarToast('Relatório financeiro gerado!', 'sucesso');
    }
}
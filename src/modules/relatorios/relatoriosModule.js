// ==================== MÓDULO DE RELATÓRIOS ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast } from '../../utils/ui.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class RelatoriosModule {
    constructor(app) {
        this.app = app;
        this.vendas = [];
        this.vendasFiltradas = [];
    }

    async carregar() {
        try {
            this.vendas = await this.carregarVendasComHoraCorrigida();
            await this.app.usuarios?.carregar();
            this.criarFiltroUsuarios();
            this.calcularEstatisticas();
            this.filtrarVendas('hoje');
        } catch (error) {
            console.error('❌ Erro ao carregar relatórios:', error);
            mostrarToast('Erro ao carregar relatórios', 'error');
        }
    }

    async carregarVendasComHoraCorrigida() {
        try {
            const { data, error } = await supabase
                .from('vendas')
                .select('*')
                .order('data', { ascending: false });
            
            if (error) throw error;
            
            return (data || []).map(venda => {
                if (venda.data) {
                    const dataUTC = new Date(venda.data);
                    const dataBrasilia = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
                    venda.data_corrigida = dataBrasilia.toISOString();
                    venda.data_exibicao = dataBrasilia.toLocaleString('pt-BR');
                }
                return venda;
            });
        } catch (error) {
            console.error('❌ Erro ao carregar vendas:', error);
            return [];
        }
    }

    criarFiltroUsuarios() {
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (!filtroUsuario) return;
        
        filtroUsuario.innerHTML = '<option value="todos">Todos os usuários</option>';
        
        // Buscar usuários do módulo de usuários se existir
        const usuarios = this.app.usuarios?.getUsuarios() || [];
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.tipo})`;
            filtroUsuario.appendChild(option);
        });
    }

    calcularEstatisticas(vendasFiltradas = null) {
        const vendas = vendasFiltradas || this.vendasFiltradas;
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        const vendasHoje = vendas.filter(v => {
            if (!v.data_corrigida && !v.data) return false;
            const dataVenda = new Date(v.data_corrigida || v.data);
            dataVenda.setHours(0, 0, 0, 0);
            return dataVenda.getTime() === hoje.getTime();
        });
        
        const totalVendasHoje = vendasHoje.reduce((sum, v) => {
            return sum + (parseFloat(v.total) || 0);
        }, 0);
        
        const totalVendas = vendas.length;
        
        const totalProdutos = vendas.reduce((sum, v) => {
            try {
                const itens = JSON.parse(v.itens || '[]');
                return sum + itens.reduce((s, item) => s + (parseInt(item.quantidade) || 0), 0);
            } catch {
                return sum;
            }
        }, 0);
        
        const totalGeralVendas = vendas.reduce((sum, v) => {
            return sum + (parseFloat(v.total) || 0);
        }, 0);
        
        const ticketMedio = totalVendas > 0 ? totalGeralVendas / totalVendas : 0;
        
        document.getElementById('vendasHoje').textContent = totalVendasHoje.toFixed(2);
        document.getElementById('totalVendas').textContent = totalVendas;
        document.getElementById('produtosVendidos').textContent = totalProdutos;
        document.getElementById('ticketMedio').textContent = ticketMedio.toFixed(2);
    }

    filtrarVendas(periodo) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        let vendasFiltradas = [];
        
        switch(periodo) {
            case 'hoje':
                vendasFiltradas = this.vendas.filter(v => {
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    dataVenda.setHours(0, 0, 0, 0);
                    return dataVenda.getTime() === hoje.getTime();
                });
                break;
            
            case 'semana':
                const inicioSemana = new Date(hoje);
                inicioSemana.setDate(hoje.getDate() - hoje.getDay());
                vendasFiltradas = this.vendas.filter(v => {
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    return dataVenda >= inicioSemana;
                });
                break;
            
            case 'mes':
                const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                vendasFiltradas = this.vendas.filter(v => {
                    if (!v.data_corrigida && !v.data) return false;
                    const dataVenda = new Date(v.data_corrigida || v.data);
                    return dataVenda >= inicioMes;
                });
                break;
            
            default:
                vendasFiltradas = this.vendas;
        }
        
        const filtroUsuario = document.getElementById('filtroUsuario');
        if (filtroUsuario && filtroUsuario.value !== 'todos') {
            const usuarioId = parseInt(filtroUsuario.value);
            vendasFiltradas = vendasFiltradas.filter(v => v.usuario_id === usuarioId);
        }
        
        this.vendasFiltradas = vendasFiltradas;
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistorico(vendasFiltradas);
        
        document.querySelectorAll('.filtros-buttons .btn-filtro').forEach(btn => 
            btn.classList.remove('active')
        );
        const btnAtivo = document.getElementById(`filtro${periodo.charAt(0).toUpperCase() + periodo.slice(1)}`);
        if (btnAtivo) btnAtivo.classList.add('active');
    }

    renderizarHistorico(vendas) {
        const historico = document.getElementById('historicoVendas');
        if (!historico) return;
        
        if (vendas.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma venda neste período</div>';
            return;
        }
        
        const totalPeriodo = vendas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
        
        let html = `
            <div class="resumo-periodo">
                <strong>Total do período: R$ ${totalPeriodo.toFixed(2)}</strong> |
                ${vendas.length} venda(s)
            </div>
        `;
        
        html += vendas.map(venda => {
            const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
            let itens = [];
            try {
                if (venda.itens && typeof venda.itens === 'string' && venda.itens.trim() !== '') {
                    itens = JSON.parse(venda.itens);
                }
            } catch (e) {
                console.error('Erro ao fazer parse dos items:', e);
                itens = [];
            }
            
            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            const usuarioTexto = venda.usuario_nome ? ` | ${venda.usuario_nome}` : '';
            const totalVenda = parseFloat(venda.total) || 0;
            
            return `
                <div class="venda-item">
                    <div class="venda-item-header">
                        <strong>${dataExibicao}${mesaTexto}${usuarioTexto}</strong>
                        <strong class="valor-venda">R$ ${totalVenda.toFixed(2)}</strong>
                    </div>
                    <p><strong>Forma de pagamento:</strong> ${venda.forma_pagamento}</p>
                    <div class="venda-item-produtos">
                        <strong>Produtos:</strong> ${itens.map(item => 
                            `${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`
                        ).join(', ')}
                    </div>
                    ${venda.desconto > 0 ? `<p><strong>Desconto:</strong> R$ ${parseFloat(venda.desconto).toFixed(2)}</p>` : ''}
                </div>
            `;
        }).join('');
        
        html += `<div class="exportar-pdf-container"><button onclick="app.relatorios.exportarPDF()" class="btn-primary">📄 Exportar para PDF</button></div>`;
        
        historico.innerHTML = html;
    }

    exportarPDF() {
        if (typeof window.jspdf === 'undefined') {
            mostrarToast('Erro: Biblioteca de PDF não carregada.', 'error');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('RELATÓRIO DE VENDAS - DOCE JARDIM', 105, 15, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 22, { align: 'center' });
        
        let yPosition = 35;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('ESTATÍSTICAS:', 14, yPosition);
        yPosition += 8;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        doc.text(`Vendas Hoje: R$ ${document.getElementById('vendasHoje').textContent}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Total de Vendas: ${document.getElementById('totalVendas').textContent}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Produtos Vendidos: ${document.getElementById('produtosVendidos').textContent}`, 20, yPosition);
        yPosition += 6;
        doc.text(`Ticket Médio: R$ ${document.getElementById('ticketMedio').textContent}`, 20, yPosition);
        yPosition += 12;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('HISTÓRICO DE VENDAS:', 14, yPosition);
        yPosition += 10;
        
        if (this.vendasFiltradas.length === 0) {
            doc.setFontSize(10);
            doc.text('Nenhuma venda no período selecionado.', 20, yPosition);
        } else {
            const totalPDF = this.vendasFiltradas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`Total do período: R$ ${totalPDF.toFixed(2)} | ${this.vendasFiltradas.length} venda(s)`, 14, yPosition);
            yPosition += 8;
            
            this.vendasFiltradas.forEach((venda, index) => {
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                
                const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
                const mesaInfo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                const usuarioInfo = venda.usuario_nome || 'Sistema';
                
                doc.text(`${index + 1}. ${dataExibicao}`, 14, yPosition);
                yPosition += 4;
                
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.text(`${mesaInfo} | ${usuarioInfo} | ${venda.forma_pagamento}`, 14, yPosition);
                yPosition += 4;
                
                let itens = [];
                try {
                    itens = JSON.parse(venda.itens || '[]');
                } catch (e) {
                    itens = [];
                }
                
                itens.forEach(item => {
                    if (yPosition > 270) {
                        doc.addPage();
                        yPosition = 20;
                    }
                    doc.text(`   ${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`, 14, yPosition);
                    yPosition += 4;
                });
                
                if (yPosition > 270) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                const totalVenda = parseFloat(venda.total) || 0;
                doc.text(`Total: R$ ${totalVenda.toFixed(2)}`, 160, yPosition, { align: 'right' });
                yPosition += 8;
                
                doc.setDrawColor(200, 200, 200);
                doc.line(14, yPosition, 196, yPosition);
                yPosition += 10;
            });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`relatorio-vendas-${timestamp}.pdf`);
        
        mostrarToast('Relatório PDF gerado com sucesso!', 'sucesso');
    }
}
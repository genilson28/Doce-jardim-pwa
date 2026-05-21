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

        const usuarios = this.app.usuarios?.getUsuarios() || [];
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.tipo})`;
            filtroUsuario.appendChild(option);
        });
    }

    calcularEstatisticas(vendasFiltradas = null) {
        const vendas = (vendasFiltradas || this.vendasFiltradas).filter(v => !v.cancelada);

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const vendasHoje = vendas.filter(v => {
            if (!v.data_corrigida && !v.data) return false;
            const dataVenda = new Date(v.data_corrigida || v.data);
            dataVenda.setHours(0, 0, 0, 0);
            return dataVenda.getTime() === hoje.getTime();
        });

        const totalVendasHoje = vendasHoje.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
        const totalVendas = vendas.length;
        const totalProdutos = vendas.reduce((sum, v) => {
            try {
                const itens = JSON.parse(v.itens || '[]');
                return sum + itens.reduce((s, item) => s + (parseInt(item.quantidade) || 0), 0);
            } catch { return sum; }
        }, 0);
        const totalGeralVendas = vendas.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);
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

        switch (periodo) {
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
                    return new Date(v.data_corrigida || v.data) >= inicioSemana;
                });
                break;
            case 'mes':
                const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                vendasFiltradas = this.vendas.filter(v => {
                    if (!v.data_corrigida && !v.data) return false;
                    return new Date(v.data_corrigida || v.data) >= inicioMes;
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

    filtrarPorUsuario() {
        this.filtrarVendas('todas');
    }

    filtrarPorPeriodo() {
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;

        if (!dataInicio || !dataFim) {
            mostrarToast('Selecione as datas de início e fim', 'warning');
            return;
        }

        const inicio = new Date(dataInicio + 'T00:00:00');
        const fim = new Date(dataFim + 'T23:59:59');

        const vendasFiltradas = this.vendas.filter(v => {
            if (!v.data_corrigida && !v.data) return false;
            const dataVenda = new Date(v.data_corrigida || v.data);
            return dataVenda >= inicio && dataVenda <= fim;
        });

        this.vendasFiltradas = vendasFiltradas;
        this.calcularEstatisticas(vendasFiltradas);
        this.renderizarHistorico(vendasFiltradas);
    }

    renderizarHistorico(vendas) {
        const historico = document.getElementById('historicoVendas');
        if (!historico) return;

        if (vendas.length === 0) {
            historico.innerHTML = '<div class="empty-state">Nenhuma venda neste período</div>';
            return;
        }

        const usuario = this.app.auth.getUsuarioLogado();
        const isAdmin = usuario?.tipo === 'administrador';

        // Calcular total apenas das vendas não canceladas
        const totalPeriodo = vendas
            .filter(v => !v.cancelada)
            .reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

        const canceladas = vendas.filter(v => v.cancelada).length;

        let html = `
            <div class="resumo-periodo">
                <strong>Total do período: R$ ${totalPeriodo.toFixed(2)}</strong> |
                ${vendas.filter(v => !v.cancelada).length} venda(s)
                ${canceladas > 0 ? `<span style="color:#f44336;"> | ${canceladas} cancelada(s)</span>` : ''}
            </div>
        `;

        html += vendas.map(venda => {
            const cancelada = venda.cancelada;
            const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');

            let itens = [];
            try {
                if (venda.itens && typeof venda.itens === 'string' && venda.itens.trim() !== '') {
                    itens = JSON.parse(venda.itens);
                }
            } catch (e) { itens = []; }

            const mesaTexto = venda.mesa_numero ? ` | Mesa ${venda.mesa_numero}` : '';
            const usuarioTexto = venda.usuario_nome ? ` | ${venda.usuario_nome}` : '';
            const totalVenda = parseFloat(venda.total) || 0;

            const estiloBorda = cancelada
                ? 'border-left: 4px solid #f44336; opacity: 0.6;'
                : 'border-left: 4px solid #4CAF50;';

            const clienteHtml = venda.cliente_nome
                ? `<p><strong>Cliente (Fiado):</strong> ${venda.cliente_nome}</p>`
                : '';

            const canceladaHtml = cancelada
                ? `<div style="margin-top:8px; padding:6px 10px; background:#ffebee; border-radius:6px; color:#f44336; font-size:0.85em;">
                       🚫 Cancelada por <strong>${venda.cancelada_por || '?'}</strong>
                   </div>`
                : '';

            const btnCancelar = (!cancelada && isAdmin)
                ? `<button onclick="app.relatorios.cancelarVenda(${venda.id})"
                       style="margin-top:8px; background:#f44336; color:white; border:none; padding:6px 14px;
                              border-radius:6px; cursor:pointer; font-size:0.85em;">
                       🚫 Cancelar Venda
                   </button>`
                : '';

            return `
                <div class="venda-item" style="${estiloBorda}">
                    <div class="venda-item-header">
                        <strong>${dataExibicao}${mesaTexto}${usuarioTexto}</strong>
                        <strong class="valor-venda" style="color:${cancelada ? '#f44336' : '#4CAF50'};">
                            ${cancelada ? 'CANCELADA' : `R$ ${totalVenda.toFixed(2)}`}
                        </strong>
                    </div>
                    <p><strong>Forma de pagamento:</strong> ${venda.forma_pagamento}</p>
                    ${clienteHtml}
                    <div class="venda-item-produtos">
                        <strong>Produtos:</strong> ${itens.map(item =>
                            `${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`
                        ).join(', ')}
                    </div>
                    ${venda.desconto > 0 ? `<p><strong>Desconto:</strong> R$ ${parseFloat(venda.desconto).toFixed(2)}</p>` : ''}
                    ${canceladaHtml}
                    ${btnCancelar}
                </div>
            `;
        }).join('');

        html += `<div class="exportar-pdf-container"><button onclick="app.relatorios.exportarPDF()" class="btn-primary">Exportar para PDF</button></div>`;

        historico.innerHTML = html;
    }

    async cancelarVenda(vendaId) {
        // Verificar se é administrador
        const usuario = this.app.auth.getUsuarioLogado();
        if (!usuario || usuario.tipo !== 'administrador') {
            mostrarToast('Apenas administradores podem cancelar vendas!', 'error');
            return;
        }

        const venda = this.vendas.find(v => v.id === vendaId);
        if (!venda) {
            mostrarToast('Venda não encontrada!', 'error');
            return;
        }

        if (venda.cancelada) {
            mostrarToast('Esta venda já foi cancelada!', 'warning');
            return;
        }

        const totalVenda = parseFloat(venda.total || 0).toFixed(2);
        const dataVenda = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');

        if (!confirm(`Cancelar venda #${vendaId}?\n\nTotal: R$ ${totalVenda}\nData: ${dataVenda}\n\nO estoque dos produtos será restaurado.`)) {
            return;
        }

        try {
            // Marcar venda como cancelada
            const { error } = await supabase
                .from('vendas')
                .update({
                    cancelada: true,
                    cancelada_por: usuario.nome,
                    cancelada_em: new Date().toISOString()
                })
                .eq('id', vendaId);

            if (error) throw error;

            // Restaurar estoque
            let itens = [];
            try { itens = JSON.parse(venda.itens || '[]'); } catch (e) {}

            for (const item of itens) {
                try {
                    const { data: produtoAtual } = await supabase
                        .from('produto')
                        .select('estoque')
                        .eq('id', item.id)
                        .single();

                    if (produtoAtual) {
                        const novoEstoque = (produtoAtual.estoque || 0) + (item.quantidade || 1);
                        await supabase
                            .from('produto')
                            .update({ estoque: novoEstoque })
                            .eq('id', item.id);
                    }
                } catch (e) {
                    console.error(`Erro ao restaurar estoque produto ${item.id}:`, e);
                }
            }

            // Se era fiado, estornar saldo do cliente
            if (venda.forma_pagamento === 'fiado' && venda.cliente_id) {
                try {
                    const { data: clienteAtual } = await supabase
                        .from('clientes')
                        .select('saldo_devedor')
                        .eq('id', venda.cliente_id)
                        .single();

                    if (clienteAtual) {
                        const novoSaldo = Math.max(0, parseFloat(clienteAtual.saldo_devedor || 0) - parseFloat(venda.total || 0));
                        await supabase
                            .from('clientes')
                            .update({ saldo_devedor: novoSaldo })
                            .eq('id', venda.cliente_id);
                    }
                } catch (e) {
                    console.error('Erro ao estornar saldo do cliente:', e);
                }
            }

            mostrarToast('Venda cancelada e estoque restaurado!', 'sucesso');

            // Recarregar
            this.vendas = await this.carregarVendasComHoraCorrigida();
            this.filtrarVendas('todas');

        } catch (error) {
            console.error('❌ Erro ao cancelar venda:', error);
            mostrarToast('Erro ao cancelar: ' + error.message, 'error');
        }
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
        doc.text('RELATORIO DE VENDAS - DOCE JARDIM', 105, 15, { align: 'center' });

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 105, 22, { align: 'center' });

        let yPosition = 35;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('ESTATISTICAS:', 14, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Vendas Hoje: R$ ${document.getElementById('vendasHoje').textContent}`, 20, yPosition); yPosition += 6;
        doc.text(`Total de Vendas: ${document.getElementById('totalVendas').textContent}`, 20, yPosition); yPosition += 6;
        doc.text(`Produtos Vendidos: ${document.getElementById('produtosVendidos').textContent}`, 20, yPosition); yPosition += 6;
        doc.text(`Ticket Medio: R$ ${document.getElementById('ticketMedio').textContent}`, 20, yPosition); yPosition += 12;

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('HISTORICO DE VENDAS:', 14, yPosition);
        yPosition += 10;

        const vendasParaPDF = this.vendasFiltradas.filter(v => !v.cancelada);

        if (vendasParaPDF.length === 0) {
            doc.setFontSize(10);
            doc.text('Nenhuma venda no periodo selecionado.', 20, yPosition);
        } else {
            const totalPDF = vendasParaPDF.reduce((sum, v) => sum + (parseFloat(v.total) || 0), 0);

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(`Total do periodo: R$ ${totalPDF.toFixed(2)} | ${vendasParaPDF.length} venda(s)`, 14, yPosition);
            yPosition += 8;

            vendasParaPDF.forEach((venda, index) => {
                if (yPosition > 270) { doc.addPage(); yPosition = 20; }

                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                const dataExibicao = venda.data_exibicao || new Date(venda.data).toLocaleString('pt-BR');
                const mesaInfo = venda.mesa_numero ? `Mesa ${venda.mesa_numero}` : 'PDV';
                const usuarioInfo = venda.usuario_nome || 'Sistema';

                doc.text(`${index + 1}. ${dataExibicao}`, 14, yPosition); yPosition += 4;
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                doc.text(`${mesaInfo} | ${usuarioInfo} | ${venda.forma_pagamento}`, 14, yPosition); yPosition += 4;

                if (venda.cliente_nome) {
                    doc.text(`Cliente: ${venda.cliente_nome}`, 14, yPosition); yPosition += 4;
                }

                let itens = [];
                try { itens = JSON.parse(venda.itens || '[]'); } catch (e) {}

                itens.forEach(item => {
                    if (yPosition > 270) { doc.addPage(); yPosition = 20; }
                    doc.text(`   ${item.nome} (${item.quantidade}x R$ ${(parseFloat(item.preco) || 0).toFixed(2)})`, 14, yPosition);
                    yPosition += 4;
                });

                if (yPosition > 270) { doc.addPage(); yPosition = 20; }
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                doc.text(`Total: R$ ${(parseFloat(venda.total) || 0).toFixed(2)}`, 160, yPosition, { align: 'right' });
                yPosition += 8;

                doc.setDrawColor(200, 200, 200);
                doc.line(14, yPosition, 196, yPosition);
                yPosition += 10;
            });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        doc.save(`relatorio-vendas-${timestamp}.pdf`);
        mostrarToast('Relatorio PDF gerado com sucesso!', 'sucesso');
    }
}

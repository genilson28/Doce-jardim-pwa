import { supabase } from '../../config/supabase.js';
import { offlineDB } from '../../services/offlineDB.js';
import { connectionService } from '../../services/connectionService.js';
import { mostrarToast } from '../../utils/ui.js';
import { formatarDataHoraCorreta } from '../../utils/formatters.js';

export class VendasModule {
    constructor(app) {
        this.app = app;
        this.vendas = [];
    }

    async carregar() {
        try {
            if (!connectionService.getStatus()) {
                this.vendas = await offlineDB.obterTodasVendas() || [];
                console.log('📦 Vendas carregadas do cache offline');
                return this.vendas;
            }

            const { data, error } = await supabase
                .from('vendas')
                .select('*')
                .order('data', { ascending: false });

            if (error) throw error;

            this.vendas = (data || []).map(venda => ({
                ...venda,
                data_exibicao: formatarDataHoraCorreta(venda.data)
            }));

            console.log(`✅ ${this.vendas.length} vendas carregadas`);
            return this.vendas;
        } catch (error) {
            console.error('❌ Erro ao carregar vendas:', error);
            try {
                this.vendas = await offlineDB.obterTodasVendas() || [];
                console.log('📦 Vendas carregadas do cache offline (fallback)');
            } catch (offlineError) {
                console.error('❌ Erro ao carregar do offline:', offlineError);
                this.vendas = [];
            }
            return this.vendas;
        }
    }

    async registrar(venda) {
        try {
            if (!connectionService.getStatus()) {
                await offlineDB.salvarVendaOffline(venda);
                mostrarToast('Venda salva offline', 'info');
                return true;
            }

            const { data, error } = await supabase.from('vendas').insert([venda]).select();
            if (error) throw error;

            mostrarToast('Venda registrada com sucesso!', 'sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao registrar venda:', error);
            try {
                await offlineDB.salvarVendaOffline(venda);
                mostrarToast('Venda salva offline', 'info');
                return true;
            } catch (offlineError) {
                console.error('❌ Erro ao salvar offline:', offlineError);
                mostrarToast('ERRO: ' + offlineError.message, 'error');
                return false;
            }
        }
    }

    async cancelarVenda(vendaId) {
        // Verificar se é administrador
        const usuario = this.app.auth.getUsuarioLogado();
        if (!usuario || usuario.tipo !== 'administrador') {
            mostrarToast('Apenas administradores podem cancelar vendas!', 'error');
            return false;
        }

        const venda = this.vendas.find(v => v.id === vendaId);
        if (!venda) {
            mostrarToast('Venda não encontrada!', 'error');
            return false;
        }

        if (venda.cancelada) {
            mostrarToast('Esta venda já foi cancelada!', 'warning');
            return false;
        }

        if (!confirm(`Cancelar venda #${vendaId}?\n\nTotal: R$ ${parseFloat(venda.total || 0).toFixed(2)}\nData: ${venda.data_exibicao || venda.data}\n\nO estoque dos produtos será restaurado.`)) {
            return false;
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

            // Restaurar estoque dos itens
            let itens = [];
            try {
                itens = JSON.parse(venda.itens || '[]');
            } catch (e) {
                console.error('Erro ao parsear itens da venda:', e);
            }

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
                } catch (estoqueError) {
                    console.error(`Erro ao restaurar estoque do produto ${item.id}:`, estoqueError);
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
                } catch (clienteError) {
                    console.error('Erro ao estornar saldo do cliente:', clienteError);
                }
            }

            mostrarToast('Venda cancelada e estoque restaurado!', 'sucesso');

            // Recarregar lista
            await this.carregar();
            await this.listar();
            return true;

        } catch (error) {
            console.error('❌ Erro ao cancelar venda:', error);
            mostrarToast('Erro ao cancelar venda: ' + error.message, 'error');
            return false;
        }
    }

    async listar() {
        await this.carregar();

        const lista = document.getElementById('historicoVendas');
        if (!lista) return;

        const usuario = this.app.auth.getUsuarioLogado();
        const isAdmin = usuario?.tipo === 'administrador';

        if (this.vendas.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhuma venda encontrada</div>';
            return;
        }

        lista.innerHTML = this.vendas.map(venda => {
            const cancelada = venda.cancelada;
            const estilo = cancelada ? 'opacity:0.5; border-left: 4px solid #f44336;' : 'border-left: 4px solid #4CAF50;';

            let itens = [];
            try { itens = JSON.parse(venda.itens || '[]'); } catch (e) {}

            return `
                <div class="venda-item" style="${estilo}">
                    <div class="venda-item-header">
                        <strong>#${venda.id} — ${venda.data_exibicao || venda.data}</strong>
                        <strong style="color: ${cancelada ? '#f44336' : '#4CAF50'};">
                            ${cancelada ? 'CANCELADA' : 'R$ ' + parseFloat(venda.total || 0).toFixed(2)}
                        </strong>
                    </div>
                    <p><strong>Atendente:</strong> ${venda.usuario_nome || 'Sistema'}</p>
                    ${venda.cliente_nome ? `<p><strong>Cliente:</strong> ${venda.cliente_nome}</p>` : ''}
                    <p><strong>Pagamento:</strong> ${venda.forma_pagamento || '-'}</p>
                    <p><strong>Itens:</strong> ${itens.map(i => `${i.nome} x${i.quantidade}`).join(', ') || '-'}</p>
                    ${cancelada
                        ? `<p style="color:#f44336;font-size:0.85em;">Cancelada por ${venda.cancelada_por || '?'}</p>`
                        : isAdmin
                            ? `<button onclick="app.vendas.cancelarVenda(${venda.id})" 
                                style="margin-top:8px; background:#f44336; color:white; border:none; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:0.85em;">
                                🚫 Cancelar Venda
                               </button>`
                            : ''
                    }
                </div>
            `;
        }).join('');
    }

    async sincronizarPendentes() {
        if (!connectionService.getStatus()) return;
        try {
            const vendasPendentes = await offlineDB.obterVendasPendentes();
            if (vendasPendentes.length === 0) return;

            console.log(`🔄 Sincronizando ${vendasPendentes.length} vendas...`);

            for (const venda of vendasPendentes) {
                try {
                    const { error } = await supabase.from('vendas').insert([venda]);
                    if (error) throw error;
                    await offlineDB.marcarVendaSincronizada(venda.id);
                } catch (vendaError) {
                    console.error('❌ Erro ao sincronizar:', vendaError);
                }
            }

            mostrarToast(`${vendasPendentes.length} vendas sincronizadas!`, 'sucesso');
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
        }
    }
}

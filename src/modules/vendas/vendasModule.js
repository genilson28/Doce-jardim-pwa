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

    // ✅ MÉTODO CARREGAR ADICIONADO
    async carregar() {
        try {
            if (!connectionService.getStatus()) {
                // Carregar do banco offline se não houver conexão
                this.vendas = await offlineDB.obterTodasVendas() || [];
                console.log('📦 Vendas carregadas do cache offline');
                return this.vendas;
            }

            // Carregar do Supabase
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
            // Em caso de erro, tentar carregar do offline
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
                const idOffline = await offlineDB.salvarVendaOffline(venda);
                mostrarToast('Venda salva offline', 'info');
                return true;
            }

            const { data, error} = await supabase.from('vendas').insert([venda]).select();
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

            if (vendasPendentes.length > 0) {
                mostrarToast(`${vendasPendentes.length} vendas sincronizadas!`, 'sucesso');
            }
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
        }
    }
}
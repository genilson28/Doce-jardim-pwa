// ==================== MÓDULO DE DÍZIMO ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast } from '../../utils/ui.js';
import { formatarMoeda, formatarDataHora } from '../../utils/formatters.js';

export class DizimoModule {
    constructor(app) {
        this.app = app;
        this.dizimos = [];
    }

    async carregar() {
        try {
            await this.app.clientes.carregar();
            await this.app.vendas.carregar();
            await this.app.compras.carregar();
            await this.app.produtos.carregar();
            await this.carregarDizimos();
        } catch (e) {
            console.error('Erro ao carregar dados do dízimo:', e);
        }
    }

    async carregarDizimos() {
        try {
            const { data, error } = await supabase
                .from('dizimos')
                .select('*')
                .order('mes_ano', { ascending: false });

            if (error) { /* tabela pode não existir ainda */ return; }
            this.dizimos = data || [];
        } catch (e) {
            console.error('Erro ao carregar dízimos:', e);
        }
    }

    /**
     * Calcula o lucro real de um período somando (venda - custo_unitario * qtd) de cada item.
     */
    calcularLucroPeriodo(dataInicio, dataFim) {
        let lucroTotal = 0;
        let totalVendido = 0;
        let custoTotal = 0;

        const vendasFiltradas = this.app.vendas.vendas.filter(v => {
            const dv = new Date(v.data);
            return dv >= dataInicio && dv <= dataFim;
        });

        for (const venda of vendasFiltradas) {
            try {
                const itens = JSON.parse(venda.itens || '[]');
                const valorVenda = parseFloat(venda.total || 0);
                totalVendido += valorVenda;

                for (const item of itens) {
                    const produto = this.app.produtos.getProdutos().find(p => p.id === item.id);
                    if (produto && produto.custo_unitario) {
                        const custoItem = produto.custo_unitario * (item.quantidade || 1);
                        custoTotal += custoItem;
                    }
                }
            } catch (e) { /* ignore item parse error */ }
        }

        lucroTotal = totalVendido - custoTotal;
        return { lucroTotal, totalVendido, custoTotal };
    }

    filtrar(periodo) {
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);

        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - hoje.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        const fimSemana = new Date(hoje);
        fimSemana.setHours(23, 59, 59, 999);

        let dataInicio, dataFim, tipo;

        switch (periodo) {
            case 'hoje':
                dataInicio = new Date(hoje); dataInicio.setHours(0,0,0,0);
                dataFim = new Date(hoje); dataFim.setHours(23,59,59,999);
                tipo = 'hoje';
                break;
            case 'semana':
                dataInicio = inicioSemana;
                dataFim = fimSemana;
                tipo = 'semana';
                break;
            case 'mes':
                dataInicio = inicioMes;
                dataFim = fimMes;
                tipo = 'mes';
                break;
            case 'todas':
                dataInicio = new Date(0);
                dataFim = new Date();
                tipo = 'todas';
                break;
            default:
                dataInicio = inicioMes;
                dataFim = fimMes;
                tipo = 'mes';
        }

        const { lucroTotal, totalVendido, custoTotal } = this.calcularLucroPeriodo(dataInicio, dataFim);
        const dizimo = lucroTotal * 0.10;

        this.renderizarResumo({ lucroTotal, totalVendido, custoTotal, dizimo, periodo: tipo });
        this.renderizarListaDizimos();
        this.renderizarResumoTotalFiado();
        this.atualizarBotoesFiltro(tipo);

        this.dadosPeriodo = { dataInicio, dataFim, lucroTotal, totalVendido, custoTotal, dizimo, periodo: tipo };
    }

    filtrarPorPeriodoPersonalizado() {
        const dataInicioStr = document.getElementById('dizimoDataInicio').value;
        const dataFimStr = document.getElementById('dizimoDataFim').value;

        if (!dataInicioStr || !dataFimStr) {
            mostrarToast('Selecione as datas de início e fim', 'warning');
            return;
        }

        const dataInicio = new Date(dataInicioStr + 'T00:00:00');
        const dataFim = new Date(dataFimStr + 'T23:59:59');

        const { lucroTotal, totalVendido, custoTotal } = this.calcularLucroPeriodo(dataInicio, dataFim);
        const dizimo = lucroTotal * 0.10;

        this.renderizarResumo({ lucroTotal, totalVendido, custoTotal, dizimo, periodo: 'personalizado' });
        this.atualizarBotoesFiltro('personalizado');
        this.dadosPeriodo = { dataInicio, dataFim, lucroTotal, totalVendido, custoTotal, dizimo, periodo: 'personalizado' };
    }

    renderizarResumo({ lucroTotal, totalVendido, custoTotal, dizimo, periodo }) {
        document.getElementById('dizimoTotalVendido').textContent = totalVendido.toFixed(2);
        document.getElementById('dizimoCustoTotal').textContent = custoTotal.toFixed(2);
        document.getElementById('dizimoLucro').textContent = lucroTotal.toFixed(2);
        document.getElementById('dizimoValor').textContent = dizimo.toFixed(2);
    }

    renderizarResumoTotalFiado() {
        const totalFiado = this.calcularTotalFiadoMensal();
        document.getElementById('dizimoTotalFiado').textContent = totalFiado.toFixed(2);
    }

    calcularTotalFiadoMensal() {
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const clientes = this.app.clientes.getClientes() || [];
        return clientes.reduce((s, c) => s + (c.saldo_devedor || 0), 0);
    }

    atualizarBotoesFiltro(ativo) {
    // Removemos active de TODOS os botões primeiro
    const container = document.querySelector('.filtros-dizimo');
    if (container) {
        container.querySelectorAll('.btn-filtro').forEach(btn => btn.classList.remove('active'));
    }
    // Re-adicionamos APENAS no botão da tela de dízimo
    const btn = document.getElementById(`filtroDizimo${ativo.charAt(0).toUpperCase() + ativo.slice(1)}`);
    if (btn) btn.classList.add('active');
}

    async registrarDizimo() {
        if (!this.dadosPeriodo) {
            mostrarToast('Selecione um período primeiro', 'warning');
            return;
        }

        if (!confirm(`Registrar dízimo de 10% sobre o lucro?\n\nLucro: R$ ${this.dadosPeriodo.lucroTotal.toFixed(2)}\nDízimo (10%): R$ ${this.dadosPeriodo.dizimo.toFixed(2)}`)) return;

        try {
            const jaExiste = this.dizimos.find(d =>
                d.data_inicio === this.dadosPeriodo.dataInicio.toISOString() &&
                d.data_fim === this.dadosPeriodo.dataFim.toISOString()
            );
            if (jaExiste) {
                mostrarToast('Este período já foi registrado como dízimo!', 'warning');
                return;
            }

            const { error } = await supabase.from('dizimos').insert([{
                mes_ano: this.formatarMesAno(this.dadosPeriodo.dataInicio),
                total_lucro: this.dadosPeriodo.lucroTotal,
                valor_dizimo: this.dadosPeriodo.dizimo,
                data_inicio: this.dadosPeriodo.dataInicio.toISOString(),
                data_fim: this.dadosPeriodo.dataFim.toISOString(),
                data_registro: new Date().toISOString(),
                usuario_id: this.app.auth.getUsuarioLogado()?.id || null,
                usuario_nome: this.app.auth.getUsuarioLogado()?.nome || 'Sistema'
            }]);

            if (error) throw error;

            await this.carregarDizimos();
            this.filtrar(this.dadosPeriodo.periodo || 'todas');
            mostrarToast(`Dízimo de R$ ${this.dadosPeriodo.dizimo.toFixed(2)} registrado com sucesso!`, 'sucesso');
        } catch (error) {
            console.error('Erro ao registrar dízimo:', error);
            mostrarToast('Erro ao registrar dízimo: ' + error.message, 'error');
        }
    }

    excluirDizimo(id) {
        if (!confirm('Deseja excluir este registro de dízimo?')) return;

        supabase.from('dizimos').delete().eq('id', id)
            .then(() => {
                this.carregarDizimos().then(() => {
                    if (this.dadosPeriodo) this.filtrar(this.dadosPeriodo.periodo || 'todas');
                    mostrarToast('Dízimo excluído!', 'info');
                });
            })
            .catch(error => {
                console.error('Erro ao excluir dízimo:', error);
                mostrarToast('Erro ao excluir', 'error');
            });
    }

    renderizarListaDizimos() {
        const lista = document.getElementById('listaDizimos');
        if (!lista) return;

        if (this.dizimos.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum dízimo registrado ainda</div>';
            return;
        }

        lista.innerHTML = this.dizimos.map(d => `
            <div class="venda-item" style="border-left: 4px solid #2196F3;">
                <div class="venda-item-header">
                    <strong>📅 ${d.mes_ano}</strong>
                    <strong style="color: #2196F3;">Dízimo: R$ ${formatarMoeda(d.valor_dizimo)}</strong>
                </div>
                <p><strong>Período:</strong> ${d.data_inicio ? new Date(d.data_inicio).toLocaleDateString('pt-BR') : '-'} a ${d.data_fim ? new Date(d.data_fim).toLocaleDateString('pt-BR') : '-'}</p>
                <p><strong>Lucro Total:</strong> R$ ${formatarMoeda(d.total_lucro)}</p>
                <p><strong>Registrado por:</strong> ${d.usuario_nome || 'Sistema'}</p>
                <button class="btn-excluir" data-id="${d.id}" style="margin-top: 10px;" onclick="app.dizimo.excluirDizimo(${d.id})">🗑️ Excluir</button>
            </div>
        `).join('');
    }

    formatarMesAno(data) {
        const d = new Date(data);
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        return `${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }
}

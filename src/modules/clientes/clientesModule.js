// ==================== MÓDULO DE CLIENTES ====================

import { supabase } from '../../config/supabase.js';
import { mostrarToast, handleSupabaseError, setButtonLoading } from '../../utils/ui.js';
import { formatarMoeda, formatarDataHora } from '../../utils/formatters.js';

export class ClientesModule {
    constructor(app) {
        this.app = app;
        this.clientes = [];
        this.saldoTotal = 0;
        this.totalFiado = 0;
        this.totalPago = 0;
    }

    async carregar() {
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('*')
                .order('nome');
            if (error) throw error;
            this.clientes = data || [];
            return this.clientes;
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            return [];
        }
    }

    async carregarSaldo() {
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('saldo_devedor');
            if (error) throw error;
            const saldos = (data || []).map(c => parseFloat(c.saldo_devedor || 0));
            this.saldoTotal = saldos.reduce((s, v) => s + v, 0);
            return this.saldoTotal;
        } catch (error) {
            console.error('Erro ao carregar saldo:', error);
            return 0;
        }
    }

    async listar() {
        await this.carregar();
        await this.carregarSaldo();

        const lista = document.getElementById('listaClientes');
        if (!lista) return;

        if (this.clientes.length === 0) {
            lista.innerHTML = '<div class="empty-state">Nenhum cliente cadastrado</div>';
            return;
        }

        lista.innerHTML = this.clientes.map(cliente => `
            <div class="cliente-item">
                <div class="cliente-item-info">
                    <h4>${cliente.nome || 'Sem nome'}</h4>
                    <p>📞 ${cliente.telefone || 'Sem telefone'}</p>
                    <p>📍 ${cliente.endereco || 'Sem endereço'}</p>
                    <p style="color: ${(cliente.saldo_devedor || 0) > 0 ? '#f44336' : '#4CAF50'}; font-weight: bold;">
                        💰 Saldo devedor: R$ ${formatarMoeda(cliente.saldo_devedor || 0)}
                    </p>
                    <small>Cadastro: ${formatarDataHora(cliente.data_cadastro)}</small>
                </div>
                <div class="cliente-item-acoes">
                    <button class="btn-secundario" onclick="app.clientes.editar(${cliente.id})">✏️ Editar</button>
                    <button class="btn-perigo" onclick="app.clientes.excluir(${cliente.id})">🗑️ Excluir</button>
                    <button class="btn-primary" onclick="app.clientes.abrirPagamento(${cliente.id})">💰 Registrar Pagamento</button>
                </div>
            </div>
        `).join('');

        const elTotal = document.getElementById('totalFiado');
        if (elTotal) elTotal.textContent = this.saldoTotal.toFixed(2);
    }

    async adicionar() {
        const nome = document.getElementById('clienteNome').value.trim();
        const telefone = document.getElementById('clienteTelefone').value.trim();
        const endereco = document.getElementById('clienteEndereco').value.trim();
        const observacoes = document.getElementById('clienteObs').value.trim();

        if (!nome) {
            mostrarToast('Informe o nome do cliente!', 'warning');
            return;
        }

        setButtonLoading('adicionarCliente', true, 'Salvar...');

        try {
            const { error } = await supabase.from('clientes').insert([{
                nome,
                telefone: telefone || null,
                endereco: endereco || null,
                observacoes: observacoes || null,
                saldo_devedor: 0,
                data_cadastro: new Date().toISOString()
            }]);
            if (error) throw error;

            document.getElementById('clienteNome').value = '';
            document.getElementById('clienteTelefone').value = '';
            document.getElementById('clienteEndereco').value = '';
            document.getElementById('clienteObs').value = '';

            await this.carregar();
            this.listar();
            mostrarToast('Cliente cadastrado com sucesso!', 'sucesso');
        } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('adicionarCliente', false, 'Cadastrar Cliente');
        }
    }

    editar(clienteId) {
        const cliente = this.clientes.find(c => c.id === clienteId);
        if (!cliente) return;

        document.getElementById('editClienteId').value = cliente.id;
        document.getElementById('editClienteNome').value = cliente.nome || '';
        document.getElementById('editClienteTelefone').value = cliente.telefone || '';
        document.getElementById('editClienteEndereco').value = cliente.endereco || '';
        document.getElementById('editClienteObs').value = cliente.observacoes || '';

        const modal = document.getElementById('modalEditarCliente');
        modal.classList.add('active');
        modal.style.display = 'flex';
    }

    async salvarEdicao() {
        const id = parseInt(document.getElementById('editClienteId').value);
        const nome = document.getElementById('editClienteNome').value.trim();
        const telefone = document.getElementById('editClienteTelefone').value.trim();
        const endereco = document.getElementById('editClienteEndereco').value.trim();
        const observacoes = document.getElementById('editClienteObs').value.trim();

        if (!nome) {
            mostrarToast('Nome é obrigatório!', 'warning');
            return;
        }

        try {
            const { error } = await supabase.from('clientes').update({
                nome,
                telefone: telefone || null,
                endereco: endereco || null,
                observacoes: observacoes || null
            }).eq('id', id);

            if (error) throw error;
            await this.carregar();
            this.listar();
            this.fecharModalEdicao();
            mostrarToast('Cliente atualizado!', 'sucesso');
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    fecharModalEdicao() {
        const modal = document.getElementById('modalEditarCliente');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async excluir(clienteId) {
        const cliente = this.clientes.find(c => c.id === clienteId);
        if (!cliente) return;
        if (!confirm(`Deseja excluir o cliente "${cliente.nome}"?`)) return;

        try {
            const { error } = await supabase.from('clientes').delete().eq('id', clienteId);
            if (error) throw error;
            await this.carregar();
            this.listar();
            mostrarToast('Cliente excluído!', 'info');
        } catch (error) {
            console.error('Erro ao excluir:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        }
    }

    // ==================== CONSUMO / EXTRATO ====================

    /**
     * Busca as vendas registradas como "fiado" para um cliente,
     * usadas para montar o extrato de itens consumidos no modal
     * de pagamento.
     */
    async buscarConsumoCliente(clienteId) {
        try {
            const { data, error } = await supabase
                .from('vendas')
                .select('*')
                .eq('cliente_id', clienteId)
                .eq('forma_pagamento', 'fiado')
                .order('data', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Erro ao buscar consumo do cliente:', error);
            return [];
        }
    }

    /**
     * Renderiza o extrato de consumo (itens por venda) dentro do
     * modal de pagamento, no elemento #pagClienteExtrato.
     */
    async renderizarExtratoConsumo(clienteId) {
        const extratoEl = document.getElementById('pagClienteExtrato');
        if (!extratoEl) return;

        extratoEl.innerHTML = '<div class="empty-state">Carregando consumo...</div>';

        const vendas = await this.buscarConsumoCliente(clienteId);

        if (vendas.length === 0) {
            extratoEl.innerHTML = '<div class="empty-state">Nenhum consumo registrado</div>';
            return;
        }

        extratoEl.innerHTML = vendas.map(venda => {
            let itens = [];
            try {
                itens = JSON.parse(venda.itens || '[]');
            } catch (e) {
                itens = [];
            }

            const itensHtml = itens.map(item => `
                <div class="extrato-item-linha">
                    <span>${item.quantidade}x ${item.nome}</span>
                    <span>R$ ${((item.preco || 0) * item.quantidade).toFixed(2)}</span>
                </div>
            `).join('');

            return `
                <div class="extrato-venda">
                    <div class="extrato-venda-header">
                        <small>${formatarDataHora(venda.data)}</small>
                        <strong>R$ ${(venda.total || 0).toFixed(2)}</strong>
                    </div>
                    <div class="extrato-venda-itens">
                        ${itensHtml || '<div class="extrato-item-linha"><span>Sem itens registrados</span></div>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    // ==================== PAGAMENTO ====================

    async abrirPagamento(clienteId) {
        const cliente = this.clientes.find(c => c.id === clienteId);
        if (!cliente) return;

        document.getElementById('pagClienteId').value = cliente.id;
        document.getElementById('pagClienteNome').textContent = cliente.nome;
        document.getElementById('pagSaldoAtual').textContent = (cliente.saldo_devedor || 0).toFixed(2);
        document.getElementById('pagValor').value = '';

        const modal = document.getElementById('modalPagamentoCliente');
        modal.classList.add('active');
        modal.style.display = 'flex';

        // Carrega o extrato de itens consumidos (fiado) sem travar a abertura do modal
        this.renderizarExtratoConsumo(clienteId);
    }

    fecharModalPagamento() {
        const modal = document.getElementById('modalPagamentoCliente');
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    async registrarPagamento() {
        const clienteId = parseInt(document.getElementById('pagClienteId').value);
        const valor = parseFloat(document.getElementById('pagValor').value);

        if (isNaN(valor) || valor <= 0) {
            mostrarToast('Informe um valor válido!', 'warning');
            return;
        }

        setButtonLoading('confirmarPagamentoCliente', true, 'Registrando...');

        try {
            const { data: cliente, error: errBusca } = await supabase
                .from('clientes')
                .select('saldo_devedor')
                .eq('id', clienteId)
                .single();

            if (errBusca) throw errBusca;

            const saldoAtual = parseFloat(cliente.saldo_devedor || 0);
            const novoSaldo = Math.max(0, saldoAtual - valor);

            const { error } = await supabase.from('clientes').update({
                saldo_devedor: novoSaldo
            }).eq('id', clienteId);

            if (error) throw error;

            await supabase.from('pagamentos_clientes').insert([{
                cliente_id: clienteId,
                valor_pago: valor,
                data: new Date().toISOString()
            }]);

            await this.carregar();
            await this.carregarSaldo();
            this.fecharModalPagamento();
            this.listar();
            mostrarToast(`Pagamento de R$ ${valor.toFixed(2)} registrado!`, 'sucesso');
        } catch (error) {
            console.error('Erro ao registrar pagamento:', error);
            mostrarToast(handleSupabaseError(error), 'error');
        } finally {
            setButtonLoading('confirmarPagamentoCliente', false, 'Confirmar');
        }
    }

    getClientes() { return this.clientes; }
}

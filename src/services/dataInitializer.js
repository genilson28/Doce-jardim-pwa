// ==================== SERVIÇO DE INICIALIZAÇÃO DE DADOS ====================

import { supabase } from '../config/supabase.js';

export class DataInitializer {
    // Hash da senha '123456'
    ADMIN_PASSWORD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

    async criarUsuarioAdmin() {
        try {
            const { error } = await supabase.from('usuarios').insert([{
                nome: 'Administrador',
                login: 'admin',
                senha: this.ADMIN_PASSWORD_HASH,
                tipo: 'administrador'
            }]);
            
            if (error && error.code !== '23505') throw error;
            
            console.log('✅ Usuário admin pronto.');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar usuário admin:', error);
            return false;
        }
    }

    async criarProdutosIniciais() {
        const produtos = [
            { nome: "Café Expresso", preco: 5.00, estoque: 50, categoria: "bebidas" },
            { nome: "Cappuccino", preco: 8.00, estoque: 30, categoria: "bebidas" },
            { nome: "Bolo de Chocolate", preco: 12.00, estoque: 20, categoria: "bolos" },
            { nome: "Bolo de Cenoura", preco: 10.00, estoque: 15, categoria: "bolos" },
            { nome: "Coxinha", preco: 6.00, estoque: 40, categoria: "salgados" },
            { nome: "Empada", preco: 5.50, estoque: 35, categoria: "salgados" },
            { nome: "Sanduíche Natural", preco: 15.00, estoque: 25, categoria: "lanches" },
            { nome: "Misto Quente", preco: 9.00, estoque: 30, categoria: "lanches" },
            { nome: "Suco Natural", preco: 7.00, estoque: 45, categoria: "bebidas" },
            { nome: "Água Mineral", preco: 3.00, estoque: 60, categoria: "bebidas" },
            { nome: "Pudim de Leite", preco: 8.00, estoque: 20, categoria: "sobremesa" },
            { nome: "Mousse de Chocolate", preco: 7.50, estoque: 25, categoria: "sobremesa" },
            { nome: "Torta de Limão", preco: 9.00, estoque: 15, categoria: "sobremesa" },
            { nome: "Sorvete Casquinha", preco: 6.00, estoque: 30, categoria: "sobremesa" },
            { nome: "Brigadeiro", preco: 2.50, estoque: 100, categoria: "bomboniere" },
            { nome: "Beijinho", preco: 2.50, estoque: 80, categoria: "bomboniere" },
            { nome: "Paçoca", preco: 1.50, estoque: 120, categoria: "bomboniere" },
            { nome: "Pipoca Doce", preco: 4.00, estoque: 50, categoria: "bomboniere" }
        ];

        try {
            const { error } = await supabase.from('produto').insert(produtos);
            if (error && error.code !== 'PGRST116') throw error;
            
            console.log('✅ Produtos iniciais prontos.');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar produtos:', error);
            return false;
        }
    }

    async criarMesasIniciais() {
        const mesas = [];
        for (let i = 1; i <= 12; i++) {
            mesas.push({
                numero: i,
                status: 'livre',
                pedido_atual: null,
                valor_total: 0
            });
        }

        try {
            const { error } = await supabase.from('mesas').insert(mesas);
            if (error && error.code !== 'PGRST116') throw error;
            
            console.log('✅ Mesas iniciais prontas.');
            return true;
        } catch (error) {
            console.error('❌ Erro ao criar mesas:', error);
            return false;
        }
    }

    async verificarTabelaClientes() {
        // Verifica se a tabela clientes existe tentando ler 1 registro
        try {
            const { error } = await supabase.from('clientes').select('*').limit(1);
            if (error && error.code === '42P01') {
                console.warn('⚠️ Tabela "clientes" não encontrada. Execute o SQL no Supabase.');
            }
        } catch (e) {
            console.warn('⚠️ Tabela clientes check:', e.message);
        }
    }

    async verificarTabelaDizimos() {
        try {
            const { error } = await supabase.from('dizimos').select('*').limit(1);
            if (error && error.code === '42P01') {
                console.warn('⚠️ Tabela "dizimos" não encontrada. Execute o SQL no Supabase.');
            }
        } catch (e) {
            console.warn('⚠️ Tabela dizimos check:', e.message);
        }
    }

    async inicializarDados() {
        try {
            const { data: usuarios } = await supabase
                .from('usuarios')
                .select('*')
                .limit(1);
            
            if (!usuarios || usuarios.length === 0) {
                await this.criarUsuarioAdmin();
            }

            const { data: produtos } = await supabase
                .from('produto')
                .select('*')
                .limit(1);
            
            if (!produtos || produtos.length === 0) {
                await this.criarProdutosIniciais();
            }

            const { data: mesas } = await supabase
                .from('mesas')
                .select('*')
                .limit(1);
            
            if (!mesas || mesas.length === 0) {
                await this.criarMesasIniciais();
            }

            await this.verificarTabelaClientes();
            await this.verificarTabelaDizimos();

            console.log('🎉 Dados inicializados!');
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar dados:', error);
            return false;
        }
    }

    // Método de inicialização (alias para inicializarDados)
    async init() {
        return await this.inicializarDados();
    }
}

// Exportar instância para uso direto
export const dataInitializer = new DataInitializer();
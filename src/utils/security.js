// ==================== MÓDULO DE SEGURANÇA COMPLETO ====================
// src/utils/security.js

import { mostrarToast } from './ui.js';

export class SecurityUtils {
    // ==================== SANITIZAÇÃO XSS ====================
    
    static sanitizeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    static stripHTML(html) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    }

    static sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? this.sanitizeHTML(obj) : obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.sanitizeObject(item));
        }

        const sanitized = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                sanitized[key] = this.sanitizeObject(obj[key]);
            }
        }
        return sanitized;
    }

    // ==================== VALIDAÇÕES ====================
    
    static validarMoeda(valor) {
        const numero = parseFloat(valor);
        return !isNaN(numero) && numero >= 0 && numero < 1000000;
    }

    static validarQuantidade(qtd) {
        const numero = parseInt(qtd);
        return Number.isInteger(numero) && numero > 0 && numero < 10000;
    }

    static validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    static validarCNPJ(cnpj) {
        cnpj = cnpj.replace(/[^\d]/g, '');
        
        if (cnpj.length !== 14) return false;
        if (/^(\d)\1+$/.test(cnpj)) return false;

        let tamanho = cnpj.length - 2;
        let numeros = cnpj.substring(0, tamanho);
        let digitos = cnpj.substring(tamanho);
        let soma = 0;
        let pos = tamanho - 7;

        for (let i = tamanho; i >= 1; i--) {
            soma += numeros.charAt(tamanho - i) * pos--;
            if (pos < 2) pos = 9;
        }

        let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        if (resultado != digitos.charAt(0)) return false;

        tamanho = tamanho + 1;
        numeros = cnpj.substring(0, tamanho);
        soma = 0;
        pos = tamanho - 7;

        for (let i = tamanho; i >= 1; i--) {
            soma += numeros.charAt(tamanho - i) * pos--;
            if (pos < 2) pos = 9;
        }

        resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
        return resultado == digitos.charAt(1);
    }

    static validarSenha(senha) {
        const resultado = {
            valida: false,
            mensagem: '',
            forca: 'fraca'
        };

        if (!senha || senha.length < 6) {
            resultado.mensagem = 'Senha deve ter no mínimo 6 caracteres';
            return resultado;
        }

        let pontos = 0;
        
        if (senha.length >= 8) pontos++;
        if (senha.length >= 12) pontos++;
        if (/[a-z]/.test(senha)) pontos++;
        if (/[A-Z]/.test(senha)) pontos++;
        if (/[0-9]/.test(senha)) pontos++;
        if (/[^a-zA-Z0-9]/.test(senha)) pontos++;

        if (pontos < 3) {
            resultado.forca = 'fraca';
            resultado.mensagem = 'Senha fraca. Use letras, números e caracteres especiais.';
        } else if (pontos < 5) {
            resultado.forca = 'media';
            resultado.mensagem = 'Senha média.';
            resultado.valida = true;
        } else {
            resultado.forca = 'forte';
            resultado.mensagem = 'Senha forte!';
            resultado.valida = true;
        }

        return resultado;
    }

    static validarObrigatorio(valor, nomeCampo) {
        if (valor === null || valor === undefined || valor === '') {
            mostrarToast(`${nomeCampo} é obrigatório!`, 'warning');
            return false;
        }
        return true;
    }

    // ==================== RATE LIMITING ====================
    
    static rateLimiters = new Map();

    static checkRateLimit(chave, limite = 5, janela = 60000) {
        const agora = Date.now();
        
        if (!this.rateLimiters.has(chave)) {
            this.rateLimiters.set(chave, {
                contagem: 1,
                inicio: agora
            });
            return true;
        }

        const limiter = this.rateLimiters.get(chave);
        
        if (agora - limiter.inicio > janela) {
            limiter.contagem = 1;
            limiter.inicio = agora;
            return true;
        }

        limiter.contagem++;
        
        if (limiter.contagem > limite) {
            const tempoRestante = Math.ceil((janela - (agora - limiter.inicio)) / 1000);
            mostrarToast(`Muitas tentativas. Aguarde ${tempoRestante}s`, 'warning');
            return false;
        }

        return true;
    }

    static throttle(func, delay = 1000) {
        let timeout = null;
        let lastRan = null;

        return function(...args) {
            if (!lastRan) {
                func.apply(this, args);
                lastRan = Date.now();
            } else {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    if ((Date.now() - lastRan) >= delay) {
                        func.apply(this, args);
                        lastRan = Date.now();
                    }
                }, delay - (Date.now() - lastRan));
            }
        };
    }

    static debounce(func, delay = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ==================== PERMISSÕES ====================
    
    static verificarPermissao(usuario, acao) {
        if (!usuario) return false;

        const permissoes = {
            'administrador': [
                'vendas.criar', 'vendas.ver', 'vendas.editar', 'vendas.excluir',
                'produtos.criar', 'produtos.editar', 'produtos.excluir',
                'usuarios.criar', 'usuarios.editar', 'usuarios.excluir',
                'compras.criar', 'compras.ver', 'compras.excluir',
                'fornecedores.criar', 'fornecedores.editar', 'fornecedores.excluir',
                'relatorios.financeiro', 'configuracoes'
            ],
            'normal': [
                'vendas.criar', 'vendas.ver',
                'produtos.ver', 'relatorios.vendas'
            ]
        };

        const permissoesUsuario = permissoes[usuario.tipo] || [];
        return permissoesUsuario.includes(acao);
    }

    static requirePermissao(usuario, acao) {
        if (!this.verificarPermissao(usuario, acao)) {
            mostrarToast('Você não tem permissão para esta ação', 'error');
            return false;
        }
        return true;
    }

    // ==================== CRIPTOGRAFIA ====================
    
    static async hashSenha(senha) {
        const encoder = new TextEncoder();
        const data = encoder.encode(senha);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    static gerarToken(length = 32) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // ==================== AUDITORIA ====================
    
    static async registrarAuditoria(acao, dados = {}, usuario = null) {
        const registro = {
            acao,
            dados: this.sanitizeObject(dados),
            usuario_id: usuario?.id || null,
            usuario_nome: usuario?.nome || 'Sistema',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        const logs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
        logs.push(registro);
        
        if (logs.length > 1000) {
            logs.shift();
        }
        
        localStorage.setItem('audit_logs', JSON.stringify(logs));
        console.log('📋 Auditoria:', registro);
    }

    // ==================== VALIDAÇÃO DE FORMULÁRIOS ====================
    
    static validarFormulario(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;

        const campos = form.querySelectorAll('input[required], select[required], textarea[required]');
        let valido = true;

        campos.forEach(campo => {
            campo.classList.remove('error');

            if (!campo.value.trim()) {
                campo.classList.add('error');
                valido = false;
                return;
            }

            if (campo.type === 'email' && !this.validarEmail(campo.value)) {
                campo.classList.add('error');
                valido = false;
                mostrarToast('Email inválido', 'warning');
            }

            if (campo.type === 'number') {
                const valor = parseFloat(campo.value);
                const min = campo.min ? parseFloat(campo.min) : -Infinity;
                const max = campo.max ? parseFloat(campo.max) : Infinity;

                if (isNaN(valor) || valor < min || valor > max) {
                    campo.classList.add('error');
                    valido = false;
                }
            }
        });

        if (!valido) {
            mostrarToast('Preencha todos os campos obrigatórios', 'warning');
        }

        return valido;
    }

    // ==================== PROTEÇÃO CSRF ====================
    
    static gerarCSRFToken() {
        const token = this.gerarToken();
        sessionStorage.setItem('csrf_token', token);
        return token;
    }

    static validarCSRFToken(token) {
        const storedToken = sessionStorage.getItem('csrf_token');
        return token === storedToken;
    }

    // ==================== UTILITÁRIOS ====================
    
    static contemCodigoMalicioso(str) {
        const patterns = [
            /<script/i, /javascript:/i, /onerror=/i,
            /onload=/i, /<iframe/i, /eval\(/i, /expression\(/i
        ];
        return patterns.some(pattern => pattern.test(str));
    }

    static sanitizeFilename(filename) {
        return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
}

// ==================== FUNÇÕES LEGADAS (para compatibilidade) ====================

export async function hashPassword(password) {
    return SecurityUtils.hashSenha(password);
}

export function handleSupabaseError(error) {
    if (!error) return 'Ocorreu um erro desconhecido.';
    
    const errorMap = {
        'PGRST116': 'Registro não encontrado.',
        '23505': 'Este registro já existe.',
        '23503': 'Violação de chave estrangeira.',
        '42501': 'Sem permissão para esta ação.'
    };
    
    return errorMap[error.code] || `Erro: ${error.message}`;
}

export default SecurityUtils;
// O usuário continua entrando com o "login" de sempre (ex.: cintia).
// O login do Supabase precisa de um e-mail, então usamos um endereço interno:
// cintia@doce-jardim.app (nenhum e-mail é enviado para ele).
// A mesma regra está na Edge Function admin-usuarios.

const DOMINIO = 'doce-jardim.app';

export function loginParaEmail(login) {
    const base = String(login || '')
        .trim()
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${base}@${DOMINIO}`;
}

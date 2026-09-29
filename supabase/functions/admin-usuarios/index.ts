// Edge Function: admin-usuarios (Doce Jardim)
// Tudo que mexe no login passa por aqui, com a service_role, e só roda
// se quem chamou for um administrador.
//
// O usuário continua entrando com o "login" de sempre (ex.: cintia). Por trás,
// o login do Supabase usa um e-mail interno: cintia@doce-jardim.app
// (nenhum e-mail é enviado para esse endereço).
//
// Ações (campo "action"):
//   criar          { nome, login, senha, tipo }
//   editar         { id, nome, login, tipo, senha? }
//   definir_senha  { id, senha }     -> cria o login do Supabase se ainda não existir
//   excluir        { id }

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIPOS = ['administrador', 'normal']
const DOMINIO = 'doce-jardim.app'

class Erro extends Error {
  status: number
  constructor(status: number, msg: string) { super(msg); this.status = status }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Mesma regra do app (src/utils/loginEmail.js)
export const loginParaEmail = (login: string) => {
  const base = String(login || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${base}@${DOMINIO}`
}

const exigir = (cond: unknown, msg: string) => { if (!cond) throw new Erro(400, msg) }
const validarSenha = (s: unknown) =>
  exigir(typeof s === 'string' && s.length >= 6, 'A senha deve ter no mínimo 6 caracteres')

async function outroAdmin(admin: SupabaseClient, id: number) {
  const { count, error } = await admin.from('usuarios')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'administrador').neq('id', id)
  if (error) throw error
  if (!count) throw new Erro(400, 'Não é possível: este é o único administrador')
}

async function definirSenha(admin: SupabaseClient, usuario: { id: number; login: string; nome: string; auth_id: string | null }, senha: string) {
  if (usuario.auth_id) {
    const { error } = await admin.auth.admin.updateUserById(usuario.auth_id, { password: senha })
    if (error) throw error
    return usuario.auth_id
  }
  // Ainda não tem login no Supabase: cria e liga ao cadastro
  const { data, error } = await admin.auth.admin.createUser({
    email: loginParaEmail(usuario.login),
    password: senha,
    email_confirm: true,
    user_metadata: { nome: usuario.nome, login: usuario.login },
  })
  if (error) {
    throw new Erro(400, /already|registered|exists/i.test(error.message)
      ? 'Já existe um login com esse nome de usuário' : error.message)
  }
  const { error: e2 } = await admin.from('usuarios').update({ auth_id: data.user.id }).eq('id', usuario.id)
  if (e2) { await admin.auth.admin.deleteUser(data.user.id); throw e2 }
  return data.user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // Quem está chamando?
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) throw new Erro(401, 'Não autenticado')
    const { data: quem, error: eQuem } = await admin.auth.getUser(token)
    if (eQuem || !quem?.user) throw new Erro(401, 'Sessão inválida')

    const { data: chamador } = await admin.from('usuarios')
      .select('id, tipo').eq('auth_id', quem.user.id).maybeSingle()
    if (chamador?.tipo !== 'administrador') throw new Erro(403, 'Apenas administradores podem gerenciar usuários')

    const body = await req.json().catch(() => ({}))
    const id = Number(body.id) || undefined

    const buscar = async (uid: number) => {
      const { data, error } = await admin.from('usuarios').select('id, nome, login, tipo, auth_id').eq('id', uid).single()
      if (error || !data) throw new Erro(404, 'Usuário não encontrado')
      return data
    }
    const loginEmUso = async (login: string, ignorarId?: number) => {
      let q = admin.from('usuarios').select('id').ilike('login', login.replace(/[%_\\]/g, (c) => '\\' + c))
      if (ignorarId) q = q.neq('id', ignorarId)
      const { data } = await q
      if (data && data.length) throw new Erro(400, 'Login já existe! Escolha outro.')
    }

    switch (body.action) {
      case 'criar': {
        const nome = String(body.nome ?? '').trim()
        const login = String(body.login ?? '').trim()
        const tipo = String(body.tipo ?? '')
        exigir(nome && login, 'Preencha nome e login')
        exigir(TIPOS.includes(tipo), 'Tipo de usuário inválido')
        validarSenha(body.senha)
        await loginEmUso(login)

        const { data: novo, error } = await admin.from('usuarios')
          .insert({ nome, login, tipo, ultimo_acesso: null }).select('id, nome, login, tipo, auth_id').single()
        if (error) throw error
        try {
          await definirSenha(admin, novo, body.senha)
        } catch (e) {
          await admin.from('usuarios').delete().eq('id', novo.id)   // desfaz
          throw e
        }
        return json({ success: true, id: novo.id })
      }

      case 'editar': {
        exigir(id, 'id obrigatório')
        const atual = await buscar(id!)
        const nome = String(body.nome ?? '').trim()
        const login = String(body.login ?? '').trim()
        const tipo = String(body.tipo ?? '')
        exigir(nome && login, 'Preencha nome e login')
        exigir(TIPOS.includes(tipo), 'Tipo de usuário inválido')
        if (atual.tipo === 'administrador' && tipo !== 'administrador') {
          if (id === chamador.id) throw new Erro(400, 'Você não pode remover seu próprio acesso de administrador')
          await outroAdmin(admin, id!)
        }
        if (login.toLowerCase() !== atual.login.toLowerCase()) {
          await loginEmUso(login, id)
          if (atual.auth_id) {
            const { error } = await admin.auth.admin.updateUserById(atual.auth_id, {
              email: loginParaEmail(login), email_confirm: true,
            })
            if (error) throw new Erro(400, 'Não foi possível alterar o login: ' + error.message)
          }
        }
        const { error } = await admin.from('usuarios').update({ nome, login, tipo }).eq('id', id)
        if (error) throw error
        if (body.senha) {
          validarSenha(body.senha)
          await definirSenha(admin, { ...atual, login }, body.senha)
        }
        return json({ success: true })
      }

      case 'definir_senha': {
        exigir(id, 'id obrigatório')
        validarSenha(body.senha)
        await definirSenha(admin, await buscar(id!), body.senha)
        return json({ success: true })
      }

      case 'excluir': {
        exigir(id, 'id obrigatório')
        if (id === chamador.id) throw new Erro(400, 'Você não pode excluir seu próprio usuário!')
        const alvo = await buscar(id!)
        if (alvo.tipo === 'administrador') await outroAdmin(admin, id!)
        const { error } = await admin.from('usuarios').delete().eq('id', id)
        if (error) {
          throw new Erro(400, error.code === '23503'
            ? 'Este usuário tem registros (compras/dízimos) ligados a ele e não pode ser excluído'
            : error.message)
        }
        if (alvo.auth_id) await admin.auth.admin.deleteUser(alvo.auth_id)
        return json({ success: true })
      }

      default:
        throw new Erro(400, 'Ação inválida')
    }
  } catch (err) {
    const status = err instanceof Erro ? err.status : 500
    const msg = err instanceof Error ? err.message : String(err)
    console.error('admin-usuarios:', msg)
    return json({ success: false, error: msg }, status)
  }
})

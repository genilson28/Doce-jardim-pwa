// ==================== CONFIGURAÇÃO SUPABASE ====================
// Projeto NOVO do Doce Jardim (separado do sistema pwa_).
// Troque os dois valores abaixo pelos do projeto novo:
//   Supabase > Project Settings > API > Project URL / anon public key
const SUPABASE_URL = 'https://weuefulhpeperuvkqbkl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Vlhq5i87XG4kxS7UEVZAGA_13mbmfac';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
});

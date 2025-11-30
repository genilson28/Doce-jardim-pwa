// ==================== CONFIGURAÇÃO SUPABASE ====================
const SUPABASE_URL = 'https://utykuriccvvhitlrdqcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0eWt1cmljY3Z2aGl0bHJkcWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTA0MTksImV4cCI6MjA3NjM4NjQxOX0.KWbJdcKAf_6UFxTiFL-Qxzd0_wnxLueNblDLMfeaqIc';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

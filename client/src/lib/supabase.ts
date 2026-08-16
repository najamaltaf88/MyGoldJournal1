import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let currentSession: Session | null = null;

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    currentSession = data.session;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
  });
}

export function getSupabaseAccessToken() {
  return currentSession?.access_token ?? null;
}

export async function refreshSupabaseSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  return data.session;
}

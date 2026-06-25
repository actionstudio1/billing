import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseMode = () =>
  import.meta.env.VITE_USE_SUPABASE === 'true' && !!url && !!anonKey;

export const supabase = isSupabaseMode()
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'gst-billing-auth',
      },
    })
  : null;

/** Wait until Supabase auth session is available (handles page reload timing). */
export async function waitForSession(maxAttempts = 25) {
  if (!supabase) return null;
  for (let i = 0; i < maxAttempts; i++) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (session?.user) return session;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

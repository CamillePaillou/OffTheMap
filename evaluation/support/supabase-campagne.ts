/**
 * Remplace lib/supabase/serveur.ts pendant la campagne (evaluation/vite.config.mts) : pas de navigateur ni de cookies,
 * les lectures se font avec la clé service_role de la base locale (.env.supabase), comme le serveur.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export async function clientSupabase() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente : lancer `make up` pour générer .env.supabase');
  return createClient<Database>(SUPABASE_URL, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}

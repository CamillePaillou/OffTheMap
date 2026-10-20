import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { SUPABASE_URL } from './serveur';

/**
 * Client Supabase du serveur, avec la clé service_role (écrite par `make up` dans .env.supabase).
 * Il contourne la RLS : réservé aux cas d'usage côté serveur, jamais importé dans un composant client.
 */
export function clientService() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente : lancer `make up` pour générer .env.supabase');
  return createClient<Database>(SUPABASE_URL, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}

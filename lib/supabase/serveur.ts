import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

// Dans Docker, le serveur joint Supabase par SUPABASE_URL (host.docker.internal) ; hors Docker, par l'URL publique.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Client Supabase côté serveur, au nom du conseiller connecté (session lue dans les cookies, RLS appliquée). */
export async function clientSupabase() {
  const magasin = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (aEcrire) => {
        try {
          for (const { name, value, options } of aEcrire) magasin.set(name, value, options);
        } catch {
          // Appelé depuis un Server Component : les cookies y sont en lecture seule, le proxy rafraîchit la session.
        }
      },
    },
  });
}

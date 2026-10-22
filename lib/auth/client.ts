import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { clientSupabase } from '@/lib/supabase/serveur';
import { ESPACE_CLIENT, urlConnexionClient } from './redirection';

export interface Client {
  id: string;
  email: string;
  /** Adresse confirmée : condition pour retrouver ses demandes (email_client() dans la base). */
  confirme: boolean;
}

/** Le client connecté, session vérifiée auprès de Supabase Auth ; null sans session. */
export async function clientConnecte(): Promise<Client | null> {
  await connection();
  const supabase = await clientSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: user.email, confirme: !!user.email_confirmed_at };
}

/** Pages du compte : sans session, page de connexion qui ramène ici. */
export async function exigerClient(suite: string = ESPACE_CLIENT): Promise<Client> {
  const client = await clientConnecte();
  if (!client) redirect(urlConnexionClient(suite));
  return client;
}

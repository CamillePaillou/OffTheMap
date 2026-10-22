import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { suiteClientSure } from '@/lib/auth/redirection';
import { clientSupabase } from '@/lib/supabase/serveur';

const TYPES: readonly EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change'];

/**
 * Lien des mails de l'espace client : confirmation de l'adresse et récupération du mot de passe.
 * token_hash (modèles de supabase/templates, le lien marche aussi ouvert sur un autre appareil) ou code (PKCE,
 * modèles par défaut de Supabase). La session ouverte, on continue vers la page du compte demandée.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const suite = suiteClientSure(url.searchParams.get('suite'));
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const code = url.searchParams.get('code');

  const supabase = await clientSupabase();
  let ok = false;
  if (tokenHash && type && TYPES.includes(type)) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;

  const cible = ok ? suite : `/compte/connexion?erreur=lien${suite.startsWith('/compte/nouveau-mot-de-passe') ? '-mdp' : ''}`;
  return NextResponse.redirect(new URL(cible, request.url));
}

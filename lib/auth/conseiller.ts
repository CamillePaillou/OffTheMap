import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { clientSupabase } from '@/lib/supabase/serveur';
import { ESPACE_CONSEILLER, urlConnexion } from './redirection';

export interface Conseiller {
  id: string;
  nomAffiche: string;
}

/**
 * Contrôle sûr de l'accès au back-office : session vérifiée auprès de Supabase Auth
 * et profil existant (même règle que est_conseiller() dans la base). Sinon, page de connexion.
 * Le proxy ne fait qu'un contrôle rapide ; chaque page et cas d'usage du conseiller appelle cette fonction.
 */
export async function exigerConseiller(suite: string = ESPACE_CONSEILLER): Promise<Conseiller> {
  await connection(); // contrôle fait à chaque requête : jamais pré-rendu (le client Supabase lit l'heure)
  const supabase = await clientSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(urlConnexion(suite));

  const { data: profil } = await supabase
    .from('profils')
    .select('id, nom_affiche')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil) redirect(`${urlConnexion(suite)}&erreur=profil`);

  return { id: profil.id, nomAffiche: profil.nom_affiche };
}

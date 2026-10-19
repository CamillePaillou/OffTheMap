'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { PAGE_CONNEXION, suiteSure } from '@/lib/auth/redirection';
import { clientSupabase } from '@/lib/supabase/serveur';

const Identifiants = z.object({
  email: z.email(),
  motDePasse: z.string().min(1),
});

export interface EtatConnexion {
  erreur?: string;
}

export async function connecter(_etat: EtatConnexion, formulaire: FormData): Promise<EtatConnexion> {
  const saisie = Identifiants.safeParse({
    email: formulaire.get('email'),
    motDePasse: formulaire.get('motDePasse'),
  });
  if (!saisie.success) return { erreur: 'Saisissez une adresse e-mail et un mot de passe.' };

  const supabase = await clientSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: saisie.data.email,
    password: saisie.data.motDePasse,
  });
  if (error) return { erreur: 'Adresse e-mail ou mot de passe incorrect.' };

  redirect(suiteSure(formulaire.get('suite')?.toString()));
}

export async function deconnecter() {
  const supabase = await clientSupabase();
  await supabase.auth.signOut();
  redirect(PAGE_CONNEXION);
}

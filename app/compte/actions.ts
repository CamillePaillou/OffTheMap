'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { z } from 'zod';
import { suiteClientSure } from '@/lib/auth/redirection';
import { clientSupabase } from '@/lib/supabase/serveur';
import { EspaceClientSupabase } from '@/src/infrastructure/db/espaceClientSupabase';

// Compte client facultatif (docs/specs/espace-client.md) : inscription avec confirmation de l'adresse, connexion,
// mot de passe oublié. Aucun message ne dit si une adresse a déjà un compte.

export interface EtatCompte {
  erreur?: string;
  /** Message de réussite affiché à la place du formulaire. */
  envoye?: string;
  email?: string;
}

const MOT_DE_PASSE_MIN = 8; // même règle que supabase/config.toml (minimum_password_length)
const Email = z.email({ error: 'Saisissez une adresse e-mail valide, par exemple prenom@exemple.fr.' });
const NouveauMotDePasse = z
  .object({
    motDePasse: z.string().min(MOT_DE_PASSE_MIN, { error: `Choisissez un mot de passe d’au moins ${MOT_DE_PASSE_MIN} caractères.` }),
    confirmation: z.string(),
  })
  .refine((v) => v.motDePasse === v.confirmation, { error: 'Les deux mots de passe ne sont pas identiques.' });

const texte = (f: FormData, nom: string) => f.get(nom)?.toString() ?? '';

/**
 * Adresse du site pour les liens des mails, comme le lien de correction (E1.2). Supabase Auth n'accepte que les
 * adresses de sa liste (additional_redirect_urls) : un en-tête Host forgé ne fait pas partir le lien ailleurs.
 */
async function origine() {
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
}

const lienConfirmer = async (suite: string) => `${await origine()}/compte/confirmer?suite=${encodeURIComponent(suite)}`;

/** Messages des erreurs de Supabase Auth qui demandent une action du client ; les autres restent génériques. */
function messageAuth(code: string | undefined, defaut: string) {
  switch (code) {
    case 'weak_password':
      return `Ce mot de passe est trop simple : au moins ${MOT_DE_PASSE_MIN} caractères, avec des lettres et des chiffres.`;
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Trop d’essais en peu de temps. Réessayez dans une minute.';
    case 'same_password':
      return 'Choisissez un mot de passe différent de l’ancien.';
    default:
      return defaut;
  }
}

export async function inscrire(_e: EtatCompte, f: FormData): Promise<EtatCompte> {
  const email = Email.safeParse(texte(f, 'email').trim());
  if (!email.success) return { erreur: email.error.issues[0]!.message, email: texte(f, 'email') };
  const mdp = NouveauMotDePasse.safeParse({ motDePasse: texte(f, 'motDePasse'), confirmation: texte(f, 'confirmation') });
  if (!mdp.success) return { erreur: mdp.error.issues[0]!.message, email: email.data };

  const supabase = await clientSupabase();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: mdp.data.motDePasse,
    options: { emailRedirectTo: await lienConfirmer('/compte') },
  });
  if (error) return { erreur: messageAuth(error.code, 'L’inscription n’a pas abouti. Réessayez dans un instant.'), email: email.data };
  // même réponse si l'adresse a déjà un compte : Supabase n'envoie rien dans ce cas, et on ne le dit pas
  return { envoye: `Un e-mail part vers ${email.data}. Ouvrez le lien qu’il contient pour confirmer votre adresse : vos demandes apparaîtront ensuite dans votre espace.`, email: email.data };
}

export async function connecterClient(_e: EtatCompte, f: FormData): Promise<EtatCompte> {
  const email = texte(f, 'email').trim();
  const supabase = await clientSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password: texte(f, 'motDePasse') });
  if (error?.code === 'email_not_confirmed')
    return { erreur: 'Confirmez d’abord votre adresse : le lien est dans l’e-mail reçu à l’inscription.', email };
  if (error) return { erreur: messageAuth(error.code, 'Adresse e-mail ou mot de passe incorrect.'), email };
  redirect(suiteClientSure(texte(f, 'suite')));
}

/** Renvoie le mail de confirmation de l'inscription. Même réponse que l'adresse existe ou non. */
export async function renvoyerConfirmation(_e: EtatCompte, f: FormData): Promise<EtatCompte> {
  const email = Email.safeParse(texte(f, 'email').trim());
  if (!email.success) return { erreur: email.error.issues[0]!.message };
  const supabase = await clientSupabase();
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.data, options: { emailRedirectTo: await lienConfirmer('/compte') } });
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) return { erreur: messageAuth(error.code, '') };
  return { envoye: `Si un compte attend une confirmation pour ${email.data}, un nouvel e-mail vient de partir.` };
}

export async function demanderNouveauMotDePasse(_e: EtatCompte, f: FormData): Promise<EtatCompte> {
  const email = Email.safeParse(texte(f, 'email').trim());
  if (!email.success) return { erreur: email.error.issues[0]!.message, email: texte(f, 'email') };
  const supabase = await clientSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: await lienConfirmer('/compte/nouveau-mot-de-passe') });
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) return { erreur: messageAuth(error.code, ''), email: email.data };
  return { envoye: `Si un compte existe pour ${email.data}, un e-mail part avec un lien pour choisir un nouveau mot de passe. Le lien vaut une heure.` };
}

/** Après le lien du mail de récupération (session de récupération), ou depuis le compte. */
export async function changerMotDePasse(_e: EtatCompte, f: FormData): Promise<EtatCompte> {
  const mdp = NouveauMotDePasse.safeParse({ motDePasse: texte(f, 'motDePasse'), confirmation: texte(f, 'confirmation') });
  if (!mdp.success) return { erreur: mdp.error.issues[0]!.message };
  const supabase = await clientSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erreur: 'Le lien a expiré. Demandez un nouveau lien depuis « Mot de passe oublié ».' };
  const { error } = await supabase.auth.updateUser({ password: mdp.data.motDePasse });
  if (error) return { erreur: messageAuth(error.code, 'Le mot de passe n’a pas été changé. Réessayez dans un instant.') };
  redirect('/compte?mot-de-passe=change');
}

export async function deconnecterClient() {
  const supabase = await clientSupabase();
  await supabase.auth.signOut();
  redirect('/');
}

export interface EtatReponseEnLigne {
  erreur?: string;
}

const MESSAGES_REPONSE = {
  introuvable: 'Cette proposition n’est plus disponible dans votre espace.',
  plus_en_attente: 'Cette proposition n’attend plus de réponse : le conseiller l’a déjà fait avancer.',
  deja_repondu: 'Vous avez déjà répondu à cette proposition.',
  message_requis: 'Dites au conseiller ce que vous voulez changer (1000 caractères au plus).',
} as const;

/** Réponse en ligne du client : acceptation (case à cocher) ou demande de changement (message). */
export async function repondreEnLigne(propositionId: string, _e: EtatReponseEnLigne, f: FormData): Promise<EtatReponseEnLigne> {
  const type = texte(f, 'type');
  if (type !== 'acceptee' && type !== 'changement') return { erreur: 'Choisissez d’accepter ou de demander un changement.' };
  if (type === 'acceptee' && f.get('confirmer') !== 'on') return { erreur: 'Cochez la case pour confirmer que vous acceptez la proposition.' };
  const message = texte(f, 'message').trim();
  if (type === 'changement' && (!message || message.length > 1000)) return { erreur: MESSAGES_REPONSE.message_requis };

  const r = await new EspaceClientSupabase().repondre(propositionId, type, type === 'changement' ? message : null);
  if (!r.ok) return { erreur: MESSAGES_REPONSE[r.raison] };
  refresh();
  return {};
}

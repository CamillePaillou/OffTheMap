'use server';

import { headers } from 'next/headers';
import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { cheminCorrection } from '@/src/application/corrigerDemande';
import { envoyerLienCorrection, trierACorriger, trierDossier, type RefusTri } from '@/src/application/trierDossier';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { TriSupabase } from '@/src/infrastructure/db/triSupabase';
import { CHAMPS_CORRIGEABLES, type ChampCorrigeable } from '@/types/correction';
import type { ErreursChamps } from '@/src/application/deposerDemande';
import { lienMailto, mailACorriger } from '@/src/domain/mails';

export interface EtatTri {
  erreurs?: ErreursChamps;
  /** Saisie à remettre dans le formulaire « à corriger » après une erreur. */
  valeurs?: Record<string, string>;
  /** Lien créé : affiché une seule fois, il n'est pas récupérable ensuite (seule son empreinte est en base). */
  lien?: { url: string; mailto: string; expireLe: string; sujet: string; corps: string };
}

const MESSAGES: Record<RefusTri | 'boucles_epuisees' | 'lien_non_cree', string> = {
  introuvable: 'Ce dossier n’existe plus.',
  transition_interdite: 'Ce tri n’est pas possible depuis le statut actuel du dossier.',
  transition_non_livree: 'Ce tri n’est pas encore disponible.',
  auteur_non_identifie: 'Votre compte n’est pas reconnu : reconnectez-vous.',
  statut_modifie: 'Le dossier a changé entre-temps : rechargez la page.',
  sans_fiche: 'La fiche n’est pas encore prête.',
  boucles_epuisees: 'Deux corrections ont déjà été demandées : appelez le client, ou validez ou refusez la demande.',
  lien_non_cree: 'Le dossier est à corriger, mais le lien n’a pas pu être créé : réessayez avec « Envoyer un lien ».',
};

/** Validation ou refus. Le refus est définitif : il demande une case de confirmation (pas de fenêtre du navigateur). */
export async function trier(dossierId: string, decision: 'validee' | 'refusee', _etat: EtatTri, f: FormData): Promise<EtatTri> {
  const conseiller = await exigerConseiller(`/conseiller/dossiers/${dossierId}`);
  if (decision === 'refusee' && f.get('confirmer_refus') !== 'on') {
    return { erreurs: { confirmer_refus: 'Cochez la case pour confirmer : un refus est définitif.' } };
  }
  const r = await trierDossier(new TriSupabase(), { dossierId, decision, conseillerId: conseiller.id });
  if (!r.ok) return { erreurs: { formulaire: MESSAGES[r.raison] } };
  refresh();
  return {};
}

/** « À corriger » depuis une fiche prête, ou nouveau lien pour un dossier déjà à corriger. */
export async function demanderUneCorrection(dossierId: string, _etat: EtatTri, f: FormData): Promise<EtatTri> {
  const conseiller = await exigerConseiller(`/conseiller/dossiers/${dossierId}`);
  const champs = f.getAll('champs').map(String).filter((c): c is ChampCorrigeable => (CHAMPS_CORRIGEABLES as readonly string[]).includes(c));
  const commentaires = Object.fromEntries(champs.map((c) => [c, f.get(`commentaire_${c}`)?.toString() ?? '']));
  const entree = { dossierId, conseillerId: conseiller.id, champs, motif: f.get('motif')?.toString() ?? '', commentaires };
  const valeurs = Object.fromEntries([...f.entries()].filter(([k, v]) => typeof v === 'string' && !k.startsWith('$')).map(([k, v]) => [k, String(v)]));
  for (const c of champs) valeurs[`champ_${c}`] = 'on';

  const tri = new TriSupabase();
  const corrections = new CorrectionsSupabase();
  const statut = await tri.lireStatut(dossierId);
  const r = statut === 'a_corriger' ? await envoyerLienCorrection(corrections, entree) : await trierACorriger(tri, corrections, entree);
  if (!r.ok) {
    refresh(); // le tri a pu passer même si le lien n'a pas été créé
    return { erreurs: 'erreurs' in r ? r.erreurs : { formulaire: MESSAGES[r.raison] }, valeurs };
  }

  const dossier = await new DossiersSupabase().detail(dossierId);
  const h = await headers();
  const origine = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
  const url = `${origine}${cheminCorrection(r.jeton)}`;
  const mail = mailACorriger({
    nom: dossier?.demande.client.nom ?? '',
    points: champs,
    commentaires: Object.fromEntries(Object.entries(commentaires).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
    motif: entree.motif.trim(),
    url,
    expireLe: r.expireLe,
    conseiller: conseiller.nomAffiche,
  });
  const mailto = lienMailto(dossier?.demande.client.email ?? '', mail);
  refresh();
  return { lien: { url, mailto, expireLe: r.expireLe, sujet: mail.sujet, corps: mail.corps } };
}

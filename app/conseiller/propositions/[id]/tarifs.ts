'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import {
  accepterVerification,
  confirmerTarif,
  envoyerProposition,
  marquerIndisponible,
  remplacerLigne,
  revoirLigne,
  type RefusLigne,
  type ResultatLigne,
} from '@/src/application/tarifs';
import type { ErreursChamps } from '@/src/application/deposerDemande';
import { TarifsSupabase } from '@/src/infrastructure/db/tarifsSupabase';

export interface EtatAction {
  erreurs?: ErreursChamps;
  valeurs?: Record<string, string>;
  /** Raisons qui bloquent l'envoi. */
  bloquants?: string[];
  envoyee?: string;
}

const REFUS: Record<RefusLigne, string> = {
  introuvable: 'Cette ligne n’existe plus.',
  transition_interdite: 'Ce changement n’est pas possible pour cette ligne.',
  ligne_modifiee: 'La ligne a changé entre-temps : rechargez la page.',
  proposition_figee: 'La proposition est envoyée : ses tarifs ne se modifient plus.',
  pas_de_prix_verifie: 'Aucun prix revérifié à accepter : vérifiez la ligne ou saisissez un tarif.',
  prestation_refusee: 'Cette prestation n’est plus au catalogue : choisissez-en une autre.',
  meme_prestation: 'Même prestation à la même date : choisissez une autre prestation ou une autre date.',
};

function versEtat(r: ResultatLigne, valeurs?: Record<string, string>): EtatAction {
  if (r.ok) {
    refresh();
    return {};
  }
  return 'erreurs' in r ? { erreurs: r.erreurs, valeurs } : { erreurs: { formulaire: REFUS[r.raison] } };
}

const chemin = (propositionId: string) => `/conseiller/propositions/${propositionId}`;

export async function saisirTarif(propositionId: string, ligneId: string, _e: EtatAction, f: FormData): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  const montant = f.get('montant')?.toString() ?? '';
  const source = f.get('source')?.toString() ?? '';
  return versEtat(await confirmerTarif(new TarifsSupabase(), { ligneId, conseillerId: id, montant, source }), { montant, source });
}

export async function accepter(propositionId: string, ligneId: string): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  return versEtat(await accepterVerification(new TarifsSupabase(), { ligneId, conseillerId: id }));
}

export async function indisponible(propositionId: string, ligneId: string): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  return versEtat(await marquerIndisponible(new TarifsSupabase(), { ligneId, conseillerId: id }));
}

export async function revoir(propositionId: string, ligneId: string): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  return versEtat(await revoirLigne(new TarifsSupabase(), { ligneId, conseillerId: id }));
}

/** Remplace une ligne indisponible par une autre prestation du catalogue (E5.2). */
export async function remplacer(propositionId: string, ligneId: string, _e: EtatAction, f: FormData): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  const prestationId = f.get('prestation')?.toString() ?? '';
  const date = f.get('date')?.toString() ?? '';
  const r = await remplacerLigne(new TarifsSupabase(), { ligneId, conseillerId: id, prestationId, date });
  return versEtat(r, { prestation: prestationId, date });
}

/** Envoi : marque la proposition envoyée. Le mail lui-même part de la messagerie du conseiller (E5.4). */
export async function envoyer(propositionId: string): Promise<EtatAction> {
  const { id } = await exigerConseiller(chemin(propositionId));
  const r = await envoyerProposition(new TarifsSupabase(), { propositionId, conseillerId: id });
  refresh();
  if (r.ok) return { envoyee: r.total };
  if (r.raison === 'bloque') return { bloquants: r.bloquants };
  if (r.raison === 'statut_modifie') return { erreurs: { formulaire: 'La proposition a changé entre-temps : rechargez la page.' } };
  if (r.raison === 'statut') return { erreurs: { formulaire: `La proposition est au statut « ${r.statut} » : elle ne peut pas être envoyée.` } };
  return { erreurs: { formulaire: 'Cette proposition n’existe plus.' } };
}

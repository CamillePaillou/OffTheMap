'use server';

import { redirect } from 'next/navigation';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { demanderChangement, type ResultatChangement } from '@/src/application/changementClient';
import { VersionsSupabase } from '@/src/infrastructure/db/versionsSupabase';

export interface EtatChangement {
  erreur?: string;
  motif?: string; // saisie reprise après une erreur
}

const MESSAGES: Record<Exclude<ResultatChangement, { ok: true }>['raison'], string> = {
  motif_invalide: 'Décrivez le changement demandé par le client.',
  introuvable: 'Cette proposition n’existe plus.',
  transition_interdite: 'Une nouvelle version ne peut être créée que depuis une proposition envoyée.',
  statut_modifie: 'La proposition a changé entre-temps : rechargez la page.',
  chiffrage_impossible: 'La nouvelle version n’a pas pu être chiffrée.',
};

/** Le client demande un changement (E6.1) : la version envoyée est gardée telle quelle, la suivante est créée. */
export async function changementDemande(propositionId: string, _e: EtatChangement, f: FormData): Promise<EtatChangement> {
  const { id } = await exigerConseiller(`/conseiller/propositions/${propositionId}`);
  const motif = f.get('motif')?.toString() ?? '';
  let r: ResultatChangement;
  try {
    r = await demanderChangement(new VersionsSupabase(), { propositionId, conseillerId: id, motif });
  } catch {
    return { erreur: 'La nouvelle version n’a pas pu être créée. Réessayez dans un instant.', motif };
  }
  if (!r.ok) return { erreur: r.raison === 'motif_invalide' ? r.message : MESSAGES[r.raison], motif };
  redirect(`/conseiller/propositions/${r.versionSuivanteId}`);
}

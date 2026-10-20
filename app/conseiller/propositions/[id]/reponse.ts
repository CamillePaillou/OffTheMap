'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { enregistrerReponse, type Reponse, type ResultatReponse } from '@/src/application/reponseClient';
import { ReponseClientSupabase } from '@/src/infrastructure/db/reponseClientSupabase';

export interface EtatReponse {
  erreur?: string;
}

const MESSAGES: Record<Exclude<ResultatReponse, { ok: true }>['raison'], string> = {
  non_confirme: 'Cochez la case pour confirmer.',
  introuvable: 'Cette proposition n’existe plus.',
  transition_interdite: 'Ce n’est pas possible depuis le statut actuel de la proposition.',
  statut_modifie: 'La proposition a changé entre-temps : rechargez la page.',
  deja_acceptee: 'Une autre proposition de ce dossier est déjà acceptée.',
};

/** Acceptation du client, puis dépôt de garantie reçu (E7.1). */
export async function repondre(propositionId: string, reponse: Reponse, _e: EtatReponse, f: FormData): Promise<EtatReponse> {
  const { id } = await exigerConseiller(`/conseiller/propositions/${propositionId}`);
  const r = await enregistrerReponse(new ReponseClientSupabase(), {
    propositionId, reponse, conseillerId: id, confirme: f.get('confirmer') === 'on',
  });
  if (!r.ok) return { erreur: MESSAGES[r.raison] };
  refresh();
  return {};
}

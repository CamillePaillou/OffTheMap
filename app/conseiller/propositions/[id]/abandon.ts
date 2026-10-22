'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { abandonnerDossier, type ResultatAbandon } from '@/src/application/abandonDossier';
import { AbandonSupabase } from '@/src/infrastructure/db/abandonSupabase';

export interface EtatAbandon {
  erreur?: string;
}

const MESSAGES: Record<Exclude<ResultatAbandon, { ok: true }>['raison'], string> = {
  non_confirme: 'Cochez la case pour confirmer.',
  introuvable: 'Cette proposition n’existe plus.',
  transition_interdite: 'Le dossier ne peut être abandonné que depuis une proposition restée sans réponse.',
  trop_tot: 'L’abandon n’est proposé que 14 jours après l’envoi.',
  statut_modifie: 'La proposition a changé entre-temps : rechargez la page.',
};

/** Abandonner un dossier resté sans réponse à J+14 (E6.5), après confirmation du conseiller. */
export async function abandonner(propositionId: string, _e: EtatAbandon, f: FormData): Promise<EtatAbandon> {
  const { id } = await exigerConseiller(`/conseiller/propositions/${propositionId}`);
  const r = await abandonnerDossier(new AbandonSupabase(), { propositionId, conseillerId: id, confirme: f.get('confirmer') === 'on' });
  if (!r.ok) return { erreur: MESSAGES[r.raison] };
  refresh();
  return {};
}

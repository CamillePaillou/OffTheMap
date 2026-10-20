'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PROPOSITION_DEPOT_RECU } from '@/fixtures/dashboard';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { donnerAccord } from '@/src/application/donnerAccord';
import { MESSAGES_REFUS_ACCORD } from '@/src/domain/accord';
import { accordsDemo } from './depot';

export interface EtatAccord {
  ok?: true;
  erreur?: string;
}

const Saisie = z.object({
  propositionId: z.uuid(),
  ligneId: z.uuid(),
  prixAfficheCents: z.coerce.number().int().nonnegative(),
});

/**
 * Autorise UNE écriture précise : une ligne, au prix affiché. Le conseiller vient de la session (jamais du formulaire)
 * et la proposition est relue côté serveur. Aucun appel au simulateur : la pose de l'option est E9.4.
 */
export async function autoriser(_etat: EtatAccord, formulaire: FormData): Promise<EtatAccord> {
  const conseiller = await exigerConseiller();
  const saisie = Saisie.safeParse({
    propositionId: formulaire.get('propositionId'),
    ligneId: formulaire.get('ligneId'),
    prixAfficheCents: formulaire.get('prixAfficheCents'),
  });
  if (!saisie.success) return { erreur: 'Demande invalide.' };

  // Fixtures en attendant la vraie route GET /api/propositions/{id} (E4.5).
  const proposition = PROPOSITION_DEPOT_RECU;
  if (proposition.id !== saisie.data.propositionId) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };

  const r = await donnerAccord(accordsDemo, {
    conseiller: { id: conseiller.id },
    proposition,
    ligneId: saisie.data.ligneId,
    prixAfficheCents: saisie.data.prixAfficheCents,
  });
  if (!r.ok) return { erreur: MESSAGES_REFUS_ACCORD[r.raison] };

  revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
  return { ok: true };
}

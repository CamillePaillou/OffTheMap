'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PROPOSITION_DEPOT_RECU } from '@/fixtures/dashboard';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { donnerAccord } from '@/src/application/donnerAccord';
import { poserOption } from '@/src/application/poserOption';
import { confirmerReservation } from '@/src/application/confirmerReservation';
import { creerPrestataires } from '@/src/infrastructure/prestataires/simulateur';
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

/** E9.4 : l'accord est vérifié et consommé côté serveur avant l'appel d'écriture au simulateur. */
export async function poser(_etat: EtatAccord, formulaire: FormData): Promise<EtatAccord> {
  const conseiller = await exigerConseiller();
  const saisie = z.object({ propositionId: z.uuid(), ligneId: z.uuid() }).safeParse({
    propositionId: formulaire.get('propositionId'), ligneId: formulaire.get('ligneId'),
  });
  if (!saisie.success) return { erreur: 'Demande invalide.' };

  const proposition = PROPOSITION_DEPOT_RECU;
  if (proposition.id !== saisie.data.propositionId) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };
  try {
    const resultat = await poserOption(accordsDemo, creerPrestataires(), {
      conseiller: { id: conseiller.id, nom: conseiller.nomAffiche }, proposition, ligneId: saisie.data.ligneId,
    });
    if (!resultat.ok) return { erreur: messagesPose[resultat.raison] ?? 'La pose de l’option a échoué. Consultez la trace.' };
    revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
    return { ok: true };
  } catch {
    return { erreur: 'Impossible de contacter le simulateur. La tentative est à vérifier dans les traces.' };
  }
}

const messagesPose: Record<string, string> = {
  conseiller_non_identifie: 'Conseiller non identifié.',
  ligne_introuvable: 'Ligne introuvable.',
  accord_absent_ou_expire: 'Aucun accord valide et non utilisé pour cette prestation.',
  accord_incoherent: 'L’accord ne correspond plus à la prestation ou au prix revérifié.',
  simulateur_delai: 'Le simulateur n’a pas répondu à temps. L’accord a été consommé par sécurité ; vérifiez la trace avant toute nouvelle tentative.',
  simulateur_erreur: 'Erreur du simulateur. L’accord a été consommé par sécurité ; vérifiez la trace.',
  simulateur_refus: 'Le simulateur a refusé la pose de l’option.',
  reponse_serveur_incoherente: 'La réponse du simulateur ne correspond pas à l’accord. Vérifiez la trace avant toute action.',
};


/** E9.5 : seconde validation distincte. La clé reste en mémoire le temps de l'appel et n'est jamais journalisée. */
export async function confirmer(_etat: EtatAccord, formulaire: FormData): Promise<EtatAccord> {
  const conseiller = await exigerConseiller();
  const saisie = z.object({ propositionId: z.uuid(), ligneId: z.uuid(), cleApprobation: z.string().min(1).max(500) }).safeParse({
    propositionId: formulaire.get('propositionId'), ligneId: formulaire.get('ligneId'), cleApprobation: formulaire.get('cleApprobation'),
  });
  if (!saisie.success) return { erreur: 'Saisissez la clé d’approbation pour confirmer.' };
  const proposition = PROPOSITION_DEPOT_RECU;
  if (proposition.id !== saisie.data.propositionId) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };
  try {
    const resultat = await confirmerReservation(accordsDemo, creerPrestataires(), {
      conseiller: { id: conseiller.id, nom: conseiller.nomAffiche }, ligneId: saisie.data.ligneId, cleApprobation: saisie.data.cleApprobation,
    });
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        conseiller_non_identifie: 'Conseiller non identifié.',
        cle_absente: 'La clé d’approbation est obligatoire.',
        option_introuvable: 'Aucune option active à confirmer.',
        option_expiree:
          'L’option a expiré ; vérifiez à nouveau la disponibilité avant toute nouvelle option.',
        simulateur_delai: 'Délai dépassé : vérifiez la trace avant de réessayer.',
        simulateur_erreur: 'Erreur du simulateur : vérifiez la trace.',
        simulateur_refus: 'Le simulateur a refusé la confirmation.',
        reponse_serveur_incoherente:
          'Réponse de confirmation incohérente ; vérifiez la trace.',
      };

      if (
        resultat.raison === 'option_expiree' &&
        'prix_unitaire_reverifie_cents' in resultat &&
        typeof resultat.prix_unitaire_reverifie_cents === 'number'
      ) {
        messages.option_expiree =
          `L’option a expiré. Le prix vient d’être revérifié : ${
            resultat.prix_unitaire_reverifie_cents / 100
          } € par participant. Revenez à l’accord et posez une nouvelle option.`;
      }

      revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
      return {
        erreur: messages[resultat.raison] ?? 'Confirmation refusée.',
      };
    }

    revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
    return { ok: true };
  } catch {
    return {
      erreur:
        'Impossible de confirmer. Vérifiez la trace avant toute nouvelle tentative.',
    };
  }
}

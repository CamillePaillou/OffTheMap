'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { donnerAccord } from '@/src/application/donnerAccord';
import { poserOption } from '@/src/application/poserOption';
import { confirmerReservation } from '@/src/application/confirmerReservation';
import { annulerReservation } from '@/src/application/annulerReservation';
import { creerPrestataires } from '@/src/infrastructure/prestataires/simulateur';
import { MESSAGES_POSE_OPTION, MESSAGES_REFUS_ACCORD } from '@/src/domain/accord';
import { AccordsSupabase } from '@/src/infrastructure/db/accordsSupabase';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';

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

  const proposition = await new PropositionsSupabase().proposition(saisie.data.propositionId);
  if (!proposition) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };

  const r = await donnerAccord(new AccordsSupabase(), {
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

  const proposition = await new PropositionsSupabase().proposition(saisie.data.propositionId);
  if (!proposition) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };
  try {
    const resultat = await poserOption(new AccordsSupabase(), creerPrestataires(), {
      conseiller: { id: conseiller.id, nom: conseiller.nomAffiche }, proposition, ligneId: saisie.data.ligneId,
    });
    // même en échec : l'accord a pu être consommé, la page ne doit plus le proposer
    revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
    if (!resultat.ok) {
      const message = MESSAGES_POSE_OPTION[resultat.raison] ?? 'La pose de l’option a échoué. Consultez la trace.';
      return { erreur: resultat.detail ? `${message} ${resultat.detail}` : message };
    }
    return { ok: true };
  } catch {
    return { erreur: 'Le prestataire n’a pas pu être joint. Regardez la trace avant de recommencer.' };
  }
}

/** E9.5 : seconde validation distincte. La clé reste en mémoire le temps de l'appel et n'est jamais journalisée. */
export async function confirmer(_etat: EtatAccord, formulaire: FormData): Promise<EtatAccord> {
  const conseiller = await exigerConseiller();
  const saisie = z.object({ propositionId: z.uuid(), ligneId: z.uuid(), cleApprobation: z.string().min(1).max(500) }).safeParse({
    propositionId: formulaire.get('propositionId'), ligneId: formulaire.get('ligneId'), cleApprobation: formulaire.get('cleApprobation'),
  });
  if (!saisie.success) return { erreur: 'Saisissez la clé d’approbation pour confirmer.' };
  const proposition = await new PropositionsSupabase().proposition(saisie.data.propositionId);
  if (!proposition?.lignes.some((l) => l.id === saisie.data.ligneId)) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };
  try {
    const resultat = await confirmerReservation(new AccordsSupabase(), creerPrestataires(), {
      conseiller: { id: conseiller.id, nom: conseiller.nomAffiche }, ligneId: saisie.data.ligneId, cleApprobation: saisie.data.cleApprobation,
    });
    if (!resultat.ok) {
      const messages: Record<string, string> = {
        conseiller_non_identifie: 'Conseiller non identifié.',
        cle_absente: 'La clé d’approbation est obligatoire.',
        option_introuvable: 'Aucune option active à confirmer.',
        option_expiree:
          'L’option a expiré ; vérifiez à nouveau la disponibilité avant toute nouvelle option.',
        simulateur_delai: 'Le prestataire n’a pas répondu à temps. Regardez la trace avant de confirmer à nouveau : la réservation a peut-être abouti.',
        simulateur_erreur: 'Le prestataire n’a pas pu confirmer la réservation. Regardez la trace avant de recommencer.',
        simulateur_refus: 'Le prestataire a refusé la confirmation : vérifiez la clé d’approbation et l’option.',
        reponse_serveur_incoherente:
          'La réponse du prestataire ne correspond pas à l’option : regardez la trace avant toute action.',
      };

      if (
        resultat.raison === 'option_expiree' &&
        'prix_unitaire_reverifie_cents' in resultat &&
        typeof resultat.prix_unitaire_reverifie_cents === 'number'
      ) {
        const maintenant = new Date();
        const prix = (resultat.prix_unitaire_reverifie_cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
        const jour = maintenant.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
        const heure = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
        messages.option_expiree =
          `L’option a expiré. Prix revérifié le ${jour} à ${heure} : ${prix} par participant. Revenez à l’accord pour poser une nouvelle option.`;
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

const messagesAnnulation: Record<string, string> = {
  conseiller_non_identifie: 'Conseiller non identifié.',
  cle_absente: 'La clé d’approbation est obligatoire pour annuler.',
  confirmation_absente: 'Cochez la case pour confirmer l’annulation.',
  reservation_introuvable: 'Aucune réservation confirmée à annuler sur cette prestation.',
  simulateur_delai: 'Le prestataire n’a pas répondu à temps : l’annulation n’est pas certaine. Regardez la trace avant de recommencer.',
  simulateur_erreur: 'Le prestataire n’a pas pu annuler la réservation. Regardez la trace avant de recommencer.',
  simulateur_refus: 'Le prestataire a refusé l’annulation : vérifiez la clé d’approbation, la réservation est peut-être déjà annulée.',
  reponse_serveur_incoherente: 'La réponse du prestataire ne correspond pas à la réservation : regardez la trace avant toute action.',
};

/** E9.8 : annulation d'une réservation confirmée. Clé d'approbation saisie + case de confirmation ; la clé n'est jamais journalisée. */
export async function annuler(_etat: EtatAccord, formulaire: FormData): Promise<EtatAccord> {
  const conseiller = await exigerConseiller();
  const saisie = z.object({ propositionId: z.uuid(), ligneId: z.uuid(), cleApprobation: z.string().min(1).max(500) }).safeParse({
    propositionId: formulaire.get('propositionId'), ligneId: formulaire.get('ligneId'), cleApprobation: formulaire.get('cleApprobation'),
  });
  if (!saisie.success) return { erreur: 'Saisissez la clé d’approbation pour annuler.' };
  const proposition = await new PropositionsSupabase().proposition(saisie.data.propositionId);
  if (!proposition?.lignes.some((l) => l.id === saisie.data.ligneId)) return { erreur: MESSAGES_REFUS_ACCORD.proposition_introuvable };
  try {
    const resultat = await annulerReservation(new AccordsSupabase(), creerPrestataires(), {
      conseiller: { id: conseiller.id, nom: conseiller.nomAffiche }, ligneId: saisie.data.ligneId,
      cleApprobation: saisie.data.cleApprobation, confirme: formulaire.get('confirme') === 'on',
    });
    revalidatePath(`/conseiller/propositions/${proposition.id}/accord`);
    if (!resultat.ok) return { erreur: messagesAnnulation[resultat.raison] ?? 'Annulation refusée.' };
    return { ok: true };
  } catch {
    return { erreur: 'Impossible d’annuler. Vérifiez la trace avant toute nouvelle tentative.' };
  }
}

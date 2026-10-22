/**
 * Règle pure de l'accord du conseiller (E9.3, ADR-0010) : peut-il autoriser l'écriture d'une option
 * sur UNE ligne, au prix qu'il a sous les yeux ? Aucune écriture ici ; le cas d'usage donnerAccord s'en charge.
 *
 * L'accord est lié à une ligne (prestation, date, participants) et à un prix total : si le prix revérifié
 * n'est plus celui affiché, il est refusé. Usage unique et durée de vie : voir LIMITES.dureeAccordMinutes.
 */
import type { LigneProposition } from '../../types/dashboard';
import type { StatutProposition } from '../../types/enums';
import { LIMITES } from '../../types/enums';

export type RefusAccord =
  | 'proposition_pas_au_depot' // l'accord n'a de sens qu'après l'acceptation du client et le dépôt
  | 'ligne_indisponible' // E7.4 : à remplacer ou retirer depuis la proposition
  | 'ligne_non_confirmee' // la ligne n'est pas « confirmée » par l'agent (à vérifier, remplacée, retirée, réservée)
  | 'prestation_inactive'
  | 'verification_absente'
  | 'verification_non_ok' // échec ou indisponible : aucun prix fiable
  | 'demarche_en_cours' // un accord ou une option est déjà en cours sur cette ligne
  | 'prix_modifie' // le prix revérifié n'est plus celui que le conseiller a vu
  | 'prix_a_reverifier'; // E11.2 (E02) : le prestataire a posé l'option à un autre prix depuis la dernière vérification

export interface DemandeAccord {
  statutProposition: StatutProposition;
  ligne: LigneProposition;
  /** Total de la ligne affiché au conseiller au moment du clic (centimes). */
  prixAfficheCents: number;
  demarcheEnCours: boolean;
  /**
   * E11.2 (E02) : date du dernier échec de pose `reponse_serveur_incoherente` de la ligne, ou null. Le prix vérifié
   * n'est plus celui du prestataire : un nouvel accord attend une vérification postérieure.
   */
  refusPrixLe?: string | null;
  maintenant: Date;
}

export type VerdictAccord =
  | { ok: true; prix_accorde_cents: number; accord_le: string; accord_expire_le: string }
  | { ok: false; raison: RefusAccord };

/** Prix total revérifié d'une ligne (centimes), ou null si la ligne n'a pas de vérification « ok ». */
export function prixReverifieCents(ligne: LigneProposition): number | null {
  const v = ligne.derniere_verification;
  if (!v || v.statut !== 'ok' || v.prix_unitaire_cents === null) return null;
  return v.prix_unitaire_cents * ligne.participants;
}

export function evaluerAccord(d: DemandeAccord): VerdictAccord {
  if (d.statutProposition !== 'depot_recu') return { ok: false, raison: 'proposition_pas_au_depot' };
  if (!d.ligne.prestation.actif) return { ok: false, raison: 'prestation_inactive' };
  if (d.ligne.statut === 'indisponible') return { ok: false, raison: 'ligne_indisponible' };
  if (d.ligne.statut !== 'confirme') return { ok: false, raison: 'ligne_non_confirmee' };
  if (!d.ligne.derniere_verification) return { ok: false, raison: 'verification_absente' };
  const prix = prixReverifieCents(d.ligne);
  if (prix === null) return { ok: false, raison: 'verification_non_ok' };
  if (d.demarcheEnCours) return { ok: false, raison: 'demarche_en_cours' };
  if (d.refusPrixLe && Date.parse(d.ligne.derniere_verification.le) <= Date.parse(d.refusPrixLe)) return { ok: false, raison: 'prix_a_reverifier' };
  if (prix !== d.prixAfficheCents) return { ok: false, raison: 'prix_modifie' };

  return {
    ok: true,
    prix_accorde_cents: prix,
    accord_le: d.maintenant.toISOString(),
    accord_expire_le: new Date(d.maintenant.getTime() + LIMITES.dureeAccordMinutes * 60_000).toISOString(),
  };
}

export const MESSAGES_REFUS_ACCORD: Record<RefusAccord | 'ligne_introuvable' | 'proposition_introuvable' | 'conseiller_non_identifie', string> = {
  proposition_pas_au_depot: 'L’accord n’est possible qu’après l’acceptation du client et le dépôt reçu.',
  ligne_indisponible: 'Prestation indisponible : remplacez-la ou retirez-la depuis la proposition, avec l’accord du client.',
  ligne_non_confirmee: 'Cette ligne n’est pas confirmée par l’agent.',
  prestation_inactive: 'Cette prestation n’est plus proposée au catalogue.',
  verification_absente: 'Le prix de cette ligne n’a pas encore été vérifié.',
  verification_non_ok: 'La dernière vérification n’a pas abouti : aucun prix fiable.',
  demarche_en_cours: 'Un accord ou une option est déjà en cours sur cette ligne.',
  prix_modifie: 'Le prix a changé depuis l’affichage : rechargez la page et relisez-le avant d’autoriser.',
  prix_a_reverifier: 'Le prestataire a posé l’option à un autre prix que celui vérifié : revérifiez la ligne avant un nouvel accord.',
  ligne_introuvable: 'Ligne introuvable dans cette proposition.',
  proposition_introuvable: 'Proposition introuvable.',
  conseiller_non_identifie: 'Conseiller non identifié.',
};

/** Raisons d'un échec de pose de l'option (E9.4), affichées au clic et tant que l'échec est la dernière démarche de la ligne. */
export const MESSAGES_POSE_OPTION: Record<string, string> = {
  conseiller_non_identifie: 'Conseiller non identifié.',
  ligne_introuvable: 'Ligne introuvable.',
  accord_absent_ou_expire: 'Aucun accord valide et non utilisé pour cette prestation.',
  accord_incoherent: 'L’accord ne correspond plus à la prestation ou au prix revérifié.',
  simulateur_delai: 'Le prestataire n’a pas répondu à temps. Par sécurité, l’accord est consommé : regardez la trace avant de recommencer.',
  simulateur_erreur: 'Le prestataire n’a pas pu poser l’option. Par sécurité, l’accord est consommé : regardez la trace avant de recommencer.',
  simulateur_refus: 'Le prestataire a refusé l’option : cette prestation n’est plus disponible à ces conditions.',
  reponse_serveur_incoherente: 'La réponse du prestataire ne correspond pas à l’accord (prix, date ou participants) : l’option n’est pas retenue. Revérifiez le prix de la ligne avant un nouvel accord ; l’option reste chez le prestataire jusqu’à son expiration.',
};

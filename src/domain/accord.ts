/**
 * Règle pure de l'accord du conseiller (E9.3, ADR-0010) : peut-il autoriser l'écriture d'une option
 * sur UNE ligne, au prix qu'il a sous les yeux ? Aucune écriture ici ; le cas d'usage donnerAccord s'en charge.
 *
 * L'accord est lié à une ligne (prestation, date, participants) et à un prix total : si le prix de référence
 * n'est plus celui affiché, il est refusé. Usage unique et durée de vie : voir LIMITES.dureeAccordMinutes.
 *
 * Prix de référence (`basePrixAccord`) : le plus récent entre la dernière vérification de l'agent et le tarif confirmé
 * de la ligne (prix de l'agent accepté, ou saisi à la main : téléphone, mail, lien). Une vérification en échec n'apporte
 * aucune information et ne compte pas ; une vérification plus récente qui constate « indisponible » bloque.
 * Le simulateur fait toujours foi à la pose de l'option.
 */
import type { LigneProposition } from '../../types/dashboard';
import type { SourcePrix, StatutProposition } from '../../types/enums';
import { LIMITES } from '../../types/enums';

export type RefusAccord =
  | 'proposition_pas_au_depot' // l'accord n'a de sens qu'après l'acceptation du client et le dépôt
  | 'ligne_indisponible' // E7.4 : à remplacer ou retirer depuis la proposition
  | 'ligne_non_confirmee' // la ligne n'est pas « confirmée » (à vérifier, remplacée, retirée, réservée)
  | 'prestation_inactive'
  | 'verification_absente' // aucun prix vérifié ni confirmé (une vérification en échec ne donne pas de prix)
  | 'verification_non_ok' // la dernière information utile est « indisponible » : aucun prix fiable
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
   * E11.2 (E02) : date du dernier échec de pose `reponse_serveur_incoherente` de la ligne, ou null. Le prix de
   * référence n'est plus celui du prestataire : un nouvel accord attend une vérification ou un tarif saisi postérieurs.
   */
  refusPrixLe?: string | null;
  maintenant: Date;
}

export type VerdictAccord =
  | { ok: true; prix_accorde_cents: number; source_prix: SourcePrix; accord_le: string; accord_expire_le: string }
  | { ok: false; raison: RefusAccord };

/** D'où vient le prix de l'accord : l'agent (vérification « ok ») ou un tarif saisi à la main, et quand. */
export interface BasePrixAccord {
  source: SourcePrix;
  prix_unitaire_cents: number;
  le: string;
}

/**
 * Prix de référence de l'accord : la plus récente des informations utiles.
 * - Une vérification de l'agent « ok » ou « indisponible » plus récente que le tarif confirmé l'emporte : son prix, ou
 *   aucun prix fiable s'il n'y a plus de place.
 * - Sinon, le tarif confirmé de la ligne : prix de l'agent accepté, ou tarif saisi à la main. Un tarif saisi après un
 *   constat « indisponible » vaut donc (le conseiller a joint le prestataire depuis).
 * - Une vérification en échec (agent ou simulateur injoignable) ne dit rien du prix : elle est ignorée.
 */
export function basePrixAccord(ligne: Pick<LigneProposition, 'derniere_verification' | 'prix_confirme'>): BasePrixAccord | null {
  const v = ligne.derniere_verification?.statut === 'echec' ? null : ligne.derniere_verification;
  const p = ligne.prix_confirme;
  if (v && (!p || Date.parse(v.le) >= Date.parse(p.le))) {
    return v.statut === 'ok' && v.prix_unitaire_cents !== null ? { source: 'agent', prix_unitaire_cents: v.prix_unitaire_cents, le: v.le } : null;
  }
  return p ? { source: p.source, prix_unitaire_cents: p.montant_cents, le: p.le } : null;
}

/** Prix total de l'accord (centimes) : prix de référence × participants × nuits ; null sans prix fiable. */
export function prixAccordCents(ligne: LigneProposition): number | null {
  const base = basePrixAccord(ligne);
  return base === null ? null : base.prix_unitaire_cents * ligne.participants * ligne.nb_nuits;
}

/** Dates des nuits d'une ligne (AAAA-MM-JJ) : une pour un transport, une activité ou un hôtel d'une nuit. */
export function datesDeLaLigne(ligne: Pick<LigneProposition, 'date' | 'nb_nuits'>): string[] {
  return Array.from({ length: ligne.nb_nuits }, (_, i) => new Date(Date.parse(`${ligne.date}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
}

export function evaluerAccord(d: DemandeAccord): VerdictAccord {
  if (d.statutProposition !== 'depot_recu') return { ok: false, raison: 'proposition_pas_au_depot' };
  if (!d.ligne.prestation.actif) return { ok: false, raison: 'prestation_inactive' };
  if (d.ligne.statut === 'indisponible') return { ok: false, raison: 'ligne_indisponible' };
  if (d.ligne.statut !== 'confirme') return { ok: false, raison: 'ligne_non_confirmee' };
  const base = basePrixAccord(d.ligne);
  // « indisponible » : l'agent a constaté qu'il n'y a plus de place ; sinon, aucun prix vérifié ni confirmé
  if (base === null) return { ok: false, raison: d.ligne.derniere_verification?.statut === 'indisponible' ? 'verification_non_ok' : 'verification_absente' };
  const prix = base.prix_unitaire_cents * d.ligne.participants * d.ligne.nb_nuits;
  if (d.demarcheEnCours) return { ok: false, raison: 'demarche_en_cours' };
  if (d.refusPrixLe && Date.parse(base.le) <= Date.parse(d.refusPrixLe)) return { ok: false, raison: 'prix_a_reverifier' };
  if (prix !== d.prixAfficheCents) return { ok: false, raison: 'prix_modifie' };

  return {
    ok: true,
    prix_accorde_cents: prix,
    source_prix: base.source,
    accord_le: d.maintenant.toISOString(),
    accord_expire_le: new Date(d.maintenant.getTime() + LIMITES.dureeAccordMinutes * 60_000).toISOString(),
  };
}

export const MESSAGES_REFUS_ACCORD: Record<RefusAccord | 'ligne_introuvable' | 'proposition_introuvable' | 'conseiller_non_identifie', string> = {
  proposition_pas_au_depot: 'L’accord n’est possible qu’après l’acceptation du client et le dépôt reçu.',
  ligne_indisponible: 'Prestation indisponible : remplacez-la ou retirez-la depuis la proposition, avec l’accord du client.',
  ligne_non_confirmee: 'Cette ligne n’est pas confirmée : acceptez le prix de l’agent ou saisissez le tarif obtenu.',
  prestation_inactive: 'Cette prestation n’est plus proposée au catalogue.',
  verification_absente: 'Aucun prix vérifié ni confirmé pour cette ligne : lancez la vérification depuis la ligne.',
  verification_non_ok: 'La dernière vérification indique que la prestation n’est plus disponible : aucun prix fiable. Revérifiez la ligne, ou marquez-la indisponible pour la remplacer.',
  demarche_en_cours: 'Un accord ou une option est déjà en cours sur cette ligne.',
  prix_modifie: 'Le prix a changé depuis l’affichage : rechargez la page et relisez-le avant d’autoriser.',
  prix_a_reverifier: 'Le prestataire a posé l’option à un autre prix que celui attendu : revérifiez la ligne ou saisissez le tarif annoncé avant un nouvel accord.',
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
  reponse_serveur_incoherente: 'La réponse du prestataire ne correspond pas à l’accord (prix, date ou participants) : l’option n’est pas retenue. Revérifiez la ligne ou corrigez le tarif saisi avant un nouvel accord ; l’option reste chez le prestataire jusqu’à son expiration.',
};

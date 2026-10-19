/**
 * Contrat du chiffrage (E4.1). Règles détaillées : docs/specs/chiffrage.md.
 * La fonction de chiffrage (E4.2) vit dans src/domain et doit donner les résultats de
 * docs/specs/chiffrage-exemples.json. Les valeurs marquées « à confirmer » attendent le client.
 */

/** Codes des alertes écrites dans propositions.alertes. */
export const CODES_ALERTE = [
  'capacite_depassee', // participants > capacité de la prestation
  'participants_superieurs_voyageurs', // participants > nombre de voyageurs du dossier
  'date_hors_sejour', // date en dehors du séjour (hébergement : la nuit du départ est exclue)
  'nuits_incoherentes', // nombre de nuits d'hébergement différent de nb_nuits_fixe
  'prestation_inactive', // prestation retirée du catalogue
  'budget_depasse', // total > budget de référence
  'budget_proche', // total >= SEUIL_BUDGET_PROCHE du budget de référence
] as const;
export type CodeAlerte = (typeof CODES_ALERTE)[number];

/** Une alerte bloquante empêche l'envoi ; une alerte non bloquante informe le conseiller. */
export const ALERTES_BLOQUANTES: readonly CodeAlerte[] = [
  'capacite_depassee', 'participants_superieurs_voyageurs', 'date_hors_sejour', 'prestation_inactive',
];

export interface Alerte {
  code: CodeAlerte;
  ligne_id?: string; // absent pour une alerte sur toute la proposition
  message: string; // pour l'affichage ; le code fait foi
}

export const REGLES_CHIFFRAGE = {
  margeCents: 0, // décidé : pas de marge
  seuilBudgetProche: 0.9, // à confirmer
  devise: 'EUR',
  locale: 'fr-FR',
} as const;

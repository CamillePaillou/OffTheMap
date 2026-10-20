/**
 * Énumérations partagées. Valeurs identiques aux types PostgreSQL de la migration
 * supabase/migrations/20261019120000_schema_initial.sql.
 *
 * Pourquoi des tableaux en plus des types générés par `supabase gen types` : Zod a besoin des
 * valeurs à l'exécution (z.enum). Le test enums.test.ts compare ces tableaux à la migration,
 * pour qu'un oubli d'un côté fasse échouer la CI.
 */

export const STATUTS_DOSSIER = [
  'nouvelle', 'fiche_en_cours', 'fiche_prete', 'erreur', 'go', 'a_corriger', 'refusee',
  'rdv_propose', 'entretien_fait', 'en_proposition', 'gagnee', 'abandonnee',
] as const;
export type StatutDossier = (typeof STATUTS_DOSSIER)[number];

export const DECISIONS_TRI = ['go', 'a_corriger', 'refusee'] as const;
export type DecisionTri = (typeof DECISIONS_TRI)[number];

export const STATUTS_PROPOSITION = [
  'brouillon_en_cours', 'brouillon_pret', 'a_verifier', 'prete', 'envoyee', 'sans_reponse',
  'changement_demande', 'remplacee', 'acceptee', 'depot_recu', 'reservee', 'erreur',
] as const;
export type StatutProposition = (typeof STATUTS_PROPOSITION)[number];

export const STATUTS_LIGNE = ['a_verifier', 'confirme', 'indisponible', 'remplacee', 'reservee'] as const;
export type StatutLigne = (typeof STATUTS_LIGNE)[number];

export const SOURCES_PRIX = ['agent', 'telephone', 'mail', 'lien'] as const;
export type SourcePrix = (typeof SOURCES_PRIX)[number];

export const TYPES_PRESTATION = ['transport', 'hebergement', 'activite'] as const;
export type TypePrestation = (typeof TYPES_PRESTATION)[number];

export const STATUTS_VERIFICATION = ['ok', 'echec', 'indisponible'] as const;
export type StatutVerification = (typeof STATUTS_VERIFICATION)[number];

export const ARRETS_AGENT = ['conclusion', 'tours_max', 'echec_serveur', 'reponse_invalide'] as const;
export type ArretAgent = (typeof ARRETS_AGENT)[number];

export const STATUTS_OPTION = ['accord_donne', 'posee', 'expiree', 'echec', 'confirmee', 'annulee'] as const;
export type StatutOption = (typeof STATUTS_OPTION)[number];

export const TYPES_EVENEMENT = [
  'statut', 'mail', 'rappel', 'depot', 'changement', 'verification', 'accord', 'option', 'reservation',
] as const;
export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

export const AUTEURS_EVENEMENT = ['conseiller', 'systeme'] as const;
export type AuteurEvenement = (typeof AUTEURS_EVENEMENT)[number];

export const NIVEAUX_PHYSIQUES = ['faible', 'modere', 'soutenu', 'intense'] as const;
export type NiveauPhysique = (typeof NIVEAUX_PHYSIQUES)[number];

export const TRANCHES_AGE = ['0_2', '3_11', '12_17', 'adulte'] as const;
export type TrancheAge = (typeof TRANCHES_AGE)[number];

export const REGIMES = ['vegetarien', 'vegetalien', 'sans_gluten', 'allergie', 'autre'] as const;
export type Regime = (typeof REGIMES)[number];

export const MOBILITES = ['aucune', 'reduite'] as const;
export type Mobilite = (typeof MOBILITES)[number];

/** Règles métier chiffrées, partagées par le domain et l'interface. */
export const LIMITES = {
  participantsMax: 20, // limite du simulateur
  nuitsMax: 14,
  toursAgentMax: 3,
  dureeOptionMetierHeures: 72, // règle de l'agence, pour l'affichage et la documentation
  // L'expiration réelle d'une option est TOUJOURS lue dans `expire_le` renvoyé par le simulateur,
  // jamais calculée avec cette constante (le simulateur du cours pose 30 minutes : écart annoncé).
  dureeAccordMinutes: 10, // choix de l'équipe : un accord ancien ne sert plus
  nomConseillerMax: 80, // limite de `approuve_par` côté simulateur
} as const;

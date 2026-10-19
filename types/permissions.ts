/**
 * Schéma des permissions (E9.1) : qui peut lire, proposer, poser, confirmer.
 * Spécification lisible : docs/specs/permissions.md ; un test vérifie que les deux disent la même chose
 * et que la matrice est cohérente avec l'outil de l'agent (types/ia.ts) et les transitions (types/transitions.ts).
 */

export const ACTEURS = ['visiteur', 'conseiller', 'modele', 'systeme'] as const;
export type Acteur = (typeof ACTEURS)[number];
// visiteur : le client, sans compte ; conseiller : compte Supabase Auth avec profil ;
// modele : le LLM via OpenRouter (fiche, brouillon, agent de vérification) ; il ne fait que lire et proposer.
// systeme : le code serveur (cas d'usage, clé service_role), qui valide puis écrit.

export type Nature = 'lecture' | 'proposition' | 'ecriture' | 'ecriture_externe';
// ecriture_externe : écrit chez le prestataire (simulateur) ; c'est le seul effet réel du parcours.

export interface Permission {
  action: string;
  nature: Nature;
  autorises: readonly Acteur[];
  condition: string;
  garantie: string; // où la règle est appliquée
}

export const PERMISSIONS: readonly Permission[] = [
  { action: 'Déposer une demande', nature: 'ecriture', autorises: ['visiteur'],
    condition: 'consentements RGPD et IA donnés', garantie: 'route serveur POST /api/demandes ; contrainte CHECK en base' },
  { action: 'Lire les dossiers, fiches et propositions', nature: 'lecture', autorises: ['conseiller', 'systeme'],
    condition: 'conseiller connecté avec un profil', garantie: 'RLS lecture_conseiller ; aucune politique pour anon' },
  { action: 'Proposer une fiche ou un brouillon', nature: 'proposition', autorises: ['modele'],
    condition: 'le système valide la réponse (FicheIA, BrouillonIA) puis l’écrit', garantie: 'schémas Zod ; le modèle ne reçoit que DemandePourLLM' },
  { action: 'Consulter une disponibilité', nature: 'lecture', autorises: ['modele', 'systeme'],
    condition: 'arguments identiques à la ligne vérifiée', garantie: 'outil unique verifier_disponibilite (OUTILS_AUTORISES) ; contrôle du programme' },
  { action: 'Conclure une vérification (prix, places)', nature: 'proposition', autorises: ['modele'],
    condition: 'faits égaux au JSON du simulateur ; sinon réponse invalide', garantie: 'ConclusionVerification ; comparaison des faits (E8.5)' },
  { action: 'Trier, corriger la fiche, confirmer un prix', nature: 'ecriture', autorises: ['conseiller'],
    condition: 'transition autorisée par la matrice', garantie: 'cas d’usage côté serveur ; trouverTransition()' },
  { action: 'Envoyer la proposition', nature: 'ecriture', autorises: ['conseiller'],
    condition: 'aucune ligne à vérifier ni alerte bloquante', garantie: 'garde de la transition prete → envoyee' },
  { action: 'Donner l’accord pour une option', nature: 'ecriture', autorises: ['conseiller'],
    condition: 'proposition depot_recu, vérification ok ; accord à usage unique, valable 10 minutes', garantie: 'transition de création accord_donne ; index unique par ligne' },
  { action: 'Poser une option sur le simulateur', nature: 'ecriture_externe', autorises: ['systeme'],
    condition: 'accord valide, non expiré, non utilisé', garantie: 'transition accord_donne → posee réservée au système ; CHECK accord_utilise' },
  { action: 'Confirmer une réservation', nature: 'ecriture_externe', autorises: ['conseiller'],
    condition: 'seconde validation : clé d’approbation saisie ; prix de l’option = prix accordé', garantie: 'transition posee → confirmee réservée au conseiller ; CHECK prix en base' },
  { action: 'Annuler une réservation (Could)', nature: 'ecriture_externe', autorises: ['conseiller'],
    condition: 'clé d’approbation saisie et confirmation', garantie: 'transition confirmee → annulee réservée au conseiller' },
  { action: 'Écrire le journal', nature: 'ecriture', autorises: ['systeme'],
    condition: 'en même temps que le changement de statut', garantie: 'fonction de transition unique (E0.7)' },
];

/** Qui détient chaque secret. Le modèle n'en détient aucun. */
export const SECRETS = [
  { secret: 'Clé d’équipe du simulateur (X-Team-Key)', detenteur: 'serveur (.env)' },
  { secret: 'Clé OpenRouter', detenteur: 'serveur (.env)' },
  { secret: 'Clé service_role Supabase', detenteur: 'serveur (.env.supabase)' },
  { secret: 'Clé d’approbation', detenteur: 'conseiller, saisie à chaque confirmation, jamais stockée' },
] as const;

export function peut(acteur: Acteur, action: string): boolean {
  return PERMISSIONS.some((p) => p.action === action && p.autorises.includes(acteur));
}

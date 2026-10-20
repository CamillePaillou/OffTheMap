/** Libellés affichés au conseiller pour les valeurs des énumérations (types/enums.ts). */
import type { EtatFiche } from '@/types/dashboard';
import type { DecisionTri, StatutDossier, StatutProposition } from '@/types/enums';

export const STATUT_DOSSIER: Record<StatutDossier, string> = {
  nouvelle: 'Nouvelle demande',
  fiche_en_cours: 'Fiche en cours',
  fiche_prete: 'Fiche prête',
  erreur: 'Fiche en erreur',
  validee: 'Validée',
  a_corriger: 'À corriger',
  refusee: 'Refusée',
  rdv_propose: 'Rendez-vous proposé',
  entretien_fait: 'Entretien fait',
  en_proposition: 'En proposition',
  gagnee: 'Gagnée',
  abandonnee: 'Abandonnée',
};

export const ETAT_FICHE: Record<EtatFiche, string> = {
  en_cours: 'en cours',
  prete: 'prête',
  erreur: 'en erreur',
  validee: 'validée',
};

export const DECISION: Record<DecisionTri, string> = { validee: 'Validée', a_corriger: 'À corriger', refusee: 'Refusée' };

export const STATUT_PROPOSITION: Record<StatutProposition, string> = {
  brouillon_en_cours: 'Brouillon en cours',
  brouillon_pret: 'Brouillon prêt',
  a_verifier: 'À vérifier',
  prete: 'Prête',
  envoyee: 'Envoyée',
  sans_reponse: 'Sans réponse',
  changement_demande: 'Changement demandé',
  remplacee: 'Remplacée',
  acceptee: 'Acceptée',
  depot_recu: 'Dépôt reçu',
  reservee: 'Réservée',
  erreur: 'En erreur',
};

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const euros = (cents: number) => FORMAT_EUROS.format(cents / 100);

/** AAAA-MM-JJ → « 7 nov. 2026 », sans décalage de fuseau. */
export const jour = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const instantParis = (instant: string) =>
  new Date(instant).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

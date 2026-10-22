/**
 * Code couleur des statuts (dossier, proposition, ligne) : chaque statut appartient à une famille, qui donne la couleur
 * de sa pastille (`.bo-puce--<famille>`, app/globals.css). Le libellé est toujours écrit : la couleur n'est jamais le
 * seul signal. Encre = à moi d'agir, orange = le client, vert = validé ou conclu, rouge = erreur, gris-bleu = automatique.
 *
 * Record<Statut…, …> : un statut ajouté à une énumération sans famille fait échouer la compilation.
 */
import type { StatutDossier, StatutLigne, StatutProposition } from './enums';

export type FamilleStatut = 'auto' | 'moi' | 'client' | 'valide' | 'conclue' | 'erreur' | 'proposition' | 'clos';

export interface StyleStatut {
  famille: FamilleStatut;
  libelle: string;
  icone?: string;
}

const ICONE_ERREUR = '⚠\uFE0E'; // U+FE0E : glyphe texte, pas l'emoji en couleur

export const FAMILLE_STATUT: Record<StatutDossier, StyleStatut> = {
  nouvelle: { famille: 'auto', libelle: 'Nouvelle', icone: '⟳' },
  fiche_en_cours: { famille: 'auto', libelle: 'Fiche en cours', icone: '⟳' },
  fiche_prete: { famille: 'moi', libelle: 'Fiche prête' },
  erreur: { famille: 'erreur', libelle: 'Erreur', icone: ICONE_ERREUR },
  validee: { famille: 'valide', libelle: 'Validée', icone: '✓' },
  a_corriger: { famille: 'client', libelle: 'À corriger' },
  rdv_propose: { famille: 'client', libelle: 'RDV proposé' },
  entretien_fait: { famille: 'moi', libelle: 'Entretien fait' },
  en_proposition: { famille: 'proposition', libelle: 'En proposition' },
  gagnee: { famille: 'conclue', libelle: 'Conclue', icone: '✓' }, // la valeur en base reste `gagnee`
  refusee: { famille: 'clos', libelle: 'Refusée' },
  abandonnee: { famille: 'clos', libelle: 'Abandonnée' },
};

// libellés repris de STATUT_PROPOSITION (app/conseiller/_composants/libelles.ts) ; famille d'après prochaineEtape
export const FAMILLE_STATUT_PROPOSITION: Record<StatutProposition, StyleStatut> = {
  brouillon_en_cours: { famille: 'auto', libelle: 'Brouillon en cours', icone: '⟳' },
  brouillon_pret: { famille: 'auto', libelle: 'Brouillon prêt', icone: '⟳' }, // le code chiffre les lignes aussitôt
  a_verifier: { famille: 'moi', libelle: 'À vérifier' },
  prete: { famille: 'moi', libelle: 'Prête' },
  envoyee: { famille: 'client', libelle: 'Envoyée' },
  sans_reponse: { famille: 'moi', libelle: 'Sans réponse' }, // au conseiller de relancer le client (E6.4)
  changement_demande: { famille: 'auto', libelle: 'Changement demandé', icone: '⟳' }, // version suivante créée aussitôt
  remplacee: { famille: 'clos', libelle: 'Remplacée' },
  acceptee: { famille: 'valide', libelle: 'Acceptée', icone: '✓' },
  depot_recu: { famille: 'valide', libelle: 'Dépôt reçu', icone: '✓' },
  reservee: { famille: 'conclue', libelle: 'Réservée', icone: '✓' },
  erreur: { famille: 'erreur', libelle: 'En erreur', icone: ICONE_ERREUR },
};

export const FAMILLE_STATUT_LIGNE: Record<StatutLigne, StyleStatut> = {
  a_verifier: { famille: 'moi', libelle: 'À vérifier' },
  confirme: { famille: 'valide', libelle: 'Confirmé', icone: '✓' },
  indisponible: { famille: 'erreur', libelle: 'Indisponible', icone: ICONE_ERREUR },
  remplacee: { famille: 'clos', libelle: 'Remplacée' },
  reservee: { famille: 'conclue', libelle: 'Réservée', icone: '✓' },
  retiree: { famille: 'clos', libelle: 'Retirée' },
};

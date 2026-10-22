/**
 * Matrice des transitions autorisées (E0.8). Source unique pour la fonction de transition (E0.7).
 * La spécification lisible est docs/specs/transitions.md ; un test vérifie que les deux disent la même chose.
 *
 * `de: null` = création de la ligne. Toute transition absente de cette liste est refusée.
 * `par` : qui la déclenche ; une transition « conseiller » exige un conseiller identifié (auteur_id).
 */
import type { StatutDossier, StatutLigne, StatutOption, StatutProposition } from './enums';

export type Auteur = 'conseiller' | 'systeme';
export type Priorite = 'must' | 'should' | 'could';

export interface Transition<S extends string> {
  de: S | null;
  vers: S;
  par: Auteur;
  quand: string; // déclencheur
  garde?: string; // condition vérifiée par le code avant d'écrire
  priorite: Priorite;
}

const t = <S extends string>(de: S | null, vers: S, par: Auteur, quand: string, garde?: string, priorite: Priorite = 'must'): Transition<S> =>
  ({ de, vers, par, quand, garde, priorite });

// ------------------------------------------------------------------ dossier (dossiers.statut)
export const TRANSITIONS_DOSSIER: Transition<StatutDossier>[] = [
  t(null, 'nouvelle', 'systeme', 'formulaire envoyé', 'consentements RGPD et IA donnés'),
  t('nouvelle', 'fiche_en_cours', 'systeme', 'génération de la fiche lancée'),
  t('fiche_en_cours', 'fiche_prete', 'systeme', 'fiche écrite', 'JSON conforme à FicheIA'),
  t('fiche_en_cours', 'erreur', 'systeme', 'génération échouée après un nouvel essai'),
  t('erreur', 'fiche_en_cours', 'conseiller', 'bouton « relancer »'),
  t('fiche_prete', 'validee', 'conseiller', 'tri : validée'),
  t('fiche_prete', 'a_corriger', 'conseiller', 'tri : à corriger'),
  t('fiche_prete', 'refusee', 'conseiller', 'tri : refus définitif'),
  t('a_corriger', 'validee', 'conseiller', 'réponse du client reportée dans la fiche'),
  t('a_corriger', 'refusee', 'conseiller', 'pas de correction possible'),
  t('a_corriger', 'fiche_en_cours', 'systeme', 'nouvelle version de la demande reçue', 'version précédente marquée remplacee_le', 'should'),
  t('validee', 'rdv_propose', 'conseiller', 'rendez-vous proposé au client'),
  t('rdv_propose', 'entretien_fait', 'conseiller', 'entretien de cadrage terminé'),
  t('entretien_fait', 'en_proposition', 'conseiller', 'fiche corrigée et validée', 'budget_reel_cents, dates fixes et validee_par renseignés'),
  t('en_proposition', 'gagnee', 'systeme', 'dernière ligne réservée', 'toutes les lignes de la proposition acceptée sont reservee'),
  t('a_corriger', 'abandonnee', 'conseiller', 'abandon confirmé', undefined, 'could'),
  t('validee', 'abandonnee', 'conseiller', 'abandon confirmé', undefined, 'could'),
  t('rdv_propose', 'abandonnee', 'conseiller', 'abandon confirmé', undefined, 'could'),
  t('entretien_fait', 'abandonnee', 'conseiller', 'abandon confirmé', undefined, 'could'),
  t('en_proposition', 'abandonnee', 'conseiller', 'abandon confirmé (proposition sans réponse)', 'proposition sans_reponse envoyée depuis 14 jours'), // livrée par E6.5
];
export const FINAUX_DOSSIER: StatutDossier[] = ['refusee', 'gagnee', 'abandonnee'];

// ------------------------------------------------------------------ proposition (propositions.statut)
export const TRANSITIONS_PROPOSITION: Transition<StatutProposition>[] = [
  t(null, 'brouillon_en_cours', 'systeme', 'brouillon demandé par le conseiller', 'dossier en_proposition'),
  t('brouillon_en_cours', 'brouillon_pret', 'systeme', 'brouillon écrit', 'JSON conforme à BrouillonIA, prestations dans la liste fournie'),
  t('brouillon_en_cours', 'erreur', 'systeme', 'génération échouée après un nouvel essai'),
  t('erreur', 'brouillon_en_cours', 'conseiller', 'bouton « relancer »'),
  t('brouillon_pret', 'a_verifier', 'systeme', 'lignes chiffrées par le code', 'toutes les lignes créées à a_verifier'),
  t('a_verifier', 'prete', 'systeme', 'dernière ligne confirmée', 'aucune ligne a_verifier ni indisponible'),
  t('prete', 'a_verifier', 'systeme', 'une ligne ajoutée ou repassée à vérifier'),
  t('prete', 'envoyee', 'conseiller', 'envoi au client', 'aucune ligne a_verifier ni indisponible'),
  t('envoyee', 'acceptee', 'conseiller', 'acceptation du client enregistrée'),
  t('envoyee', 'changement_demande', 'conseiller', 'le client demande un changement'), // livrée par E6.1
  t('envoyee', 'sans_reponse', 'systeme', 'rappel à J+3'), // livrée par E6.4
  t('sans_reponse', 'acceptee', 'conseiller', 'acceptation du client enregistrée'), // livrée par E6.4
  t('sans_reponse', 'changement_demande', 'conseiller', 'le client demande un changement'), // livrée par E6.4
  t('changement_demande', 'remplacee', 'systeme', 'version suivante créée', 'version suivante en brouillon_en_cours'), // livrée par E6.1
  t('acceptee', 'depot_recu', 'conseiller', 'dépôt de garantie reçu'),
  t('depot_recu', 'reservee', 'systeme', 'dernière ligne réservée', 'toutes les lignes sont reservee'),
];
export const FINAUX_PROPOSITION: StatutProposition[] = ['remplacee', 'reservee'];

// ------------------------------------------------------------------ ligne (proposition_lignes.statut)
export const TRANSITIONS_LIGNE: Transition<StatutLigne>[] = [
  t(null, 'a_verifier', 'systeme', 'ligne créée par le brouillon', 'prestation du catalogue, prix catalogue copié'),
  t('a_verifier', 'confirme', 'conseiller', 'tarif accepté depuis l’agent ou saisi', 'prix_confirme_cents, source, confirme_le et confirme_par renseignés'),
  t('a_verifier', 'indisponible', 'conseiller', 'vérification « indisponible » acceptée'),
  t('confirme', 'a_verifier', 'conseiller', 'nouvelle vérification demandée avant envoi', 'proposition pas encore envoyée'),
  t('confirme', 'indisponible', 'conseiller', 'prestation devenue indisponible avant la réservation'),
  t('confirme', 'reservee', 'systeme', 'option confirmée sur le simulateur', 'option de la ligne en confirmee'),
  t('indisponible', 'a_verifier', 'conseiller', 'nouvelle vérification demandée'),
  t('indisponible', 'remplacee', 'conseiller', 'ligne remplacée par une autre prestation', 'nouvelle ligne créée', 'should'),
];
export const FINAUX_LIGNE: StatutLigne[] = ['remplacee', 'reservee'];

// ------------------------------------------------------------------ option (options.statut)
export const TRANSITIONS_OPTION: Transition<StatutOption>[] = [
  t(null, 'accord_donne', 'conseiller', 'accord donné sur l’écran de proposition', 'proposition depot_recu, vérification ok récente, aucune démarche en cours sur la ligne'),
  t('accord_donne', 'posee', 'systeme', 'POST /api/v1/options réussi', 'accord non expiré et non utilisé ; accord_utilise passe à vrai'),
  t('accord_donne', 'echec', 'systeme', 'accord expiré ou option refusée par le simulateur'),
  t('posee', 'confirmee', 'conseiller', 'seconde validation avec la clé d’approbation', 'option non expirée et prix_option_cents = prix_accorde_cents'),
  t('posee', 'expiree', 'systeme', 'expire_le dépassé ou refus option_expired'),
  t('posee', 'echec', 'systeme', 'prix de l’option différent du prix accordé'),
  t('confirmee', 'annulee', 'conseiller', 'annulation avec la clé d’approbation', undefined, 'could'),
];
export const FINAUX_OPTION: StatutOption[] = ['expiree', 'echec', 'annulee'];

export const MACHINES = {
  dossier: { transitions: TRANSITIONS_DOSSIER, finaux: FINAUX_DOSSIER },
  proposition: { transitions: TRANSITIONS_PROPOSITION, finaux: FINAUX_PROPOSITION },
  ligne: { transitions: TRANSITIONS_LIGNE, finaux: FINAUX_LIGNE },
  option: { transitions: TRANSITIONS_OPTION, finaux: FINAUX_OPTION },
} as const;
export type Machine = keyof typeof MACHINES;

/** Renvoie la transition autorisée, ou null : la fonction de transition (E0.7) refuse alors l'écriture. */
export function trouverTransition<S extends string>(
  transitions: readonly Transition<S>[], de: S | null, vers: S, par: Auteur,
): Transition<S> | null {
  return transitions.find((x) => x.de === de && x.vers === vers && x.par === par) ?? null;
}

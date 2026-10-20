/**
 * Lignes lues dans Supabase → payloads du dashboard (types/dashboard.ts), validés par leur schéma Zod.
 * Fonctions pures : testées sans base (versPayloadsDashboard.test.ts).
 */
import { DetailDossier, DossierResume, EvenementHistorique } from '../../../types/dashboard';
import { resumeEvenement } from '../../domain/resumeEvenement';
import type { Database } from '../../../types/database';
import { etatFiche } from '../../domain/etatFiche';

type Tables = Database['public']['Tables'];
type Ligne<T extends keyof Tables, K extends keyof Tables[T]['Row']> = Pick<Tables[T]['Row'], K>;

/** Postgres rend « 2026-10-12T07:00:00+00:00 » ; le contrat veut de l'UTC suffixé Z. */
const utc = (instant: string) => new Date(instant).toISOString();

/** Version en cours : celle qui n'a pas été remplacée, sinon la plus récente. */
export function versionEnCours<D extends { version: number; remplacee_le: string | null }>(demandes: D[]): D | undefined {
  return [...demandes].sort((a, b) => Number(a.remplacee_le !== null) - Number(b.remplacee_le !== null) || b.version - a.version)[0];
}

const derniere = <P extends { version: number }>(propositions: P[]) => [...propositions].sort((a, b) => b.version - a.version)[0];

// ------------------------------------------------------------------ liste
export type LigneDossierListe = Ligne<'dossiers', 'id' | 'statut' | 'cree_le'> & {
  demandes: (Ligne<'demandes', 'version' | 'remplacee_le' | 'nom' | 'destination' | 'date_debut' | 'date_fin' | 'voyageurs' | 'budget_annonce_cents'> & {
    fiches: Ligne<'fiches', 'erreur_generation' | 'validee_le'> | null;
  })[];
  propositions: (Ligne<'propositions', 'id' | 'version' | 'statut' | 'total_cents'> & {
    proposition_lignes: Ligne<'proposition_lignes', 'statut'>[];
  })[];
};

export function versDossierResume(d: LigneDossierListe): DossierResume {
  const demande = versionEnCours(d.demandes);
  if (!demande) throw new Error(`dossier sans demande : ${d.id}`);
  const proposition = derniere(d.propositions);
  const etat = etatFiche(d.statut, demande.fiches);
  return DossierResume.parse({
    dossier_id: d.id,
    statut: d.statut,
    cree_le: utc(d.cree_le),
    client: { nom: demande.nom },
    demande: {
      version: demande.version,
      destination: demande.destination,
      date_debut: demande.date_debut,
      date_fin: demande.date_fin,
      voyageurs: demande.voyageurs.length,
      budget_annonce: demande.budget_annonce_cents === null ? null : { montant_cents: demande.budget_annonce_cents },
    },
    fiche: etat === null ? null : { etat },
    proposition: proposition
      ? {
          id: proposition.id,
          version: proposition.version,
          statut: proposition.statut,
          total_cents: proposition.total_cents,
          lignes_a_verifier: proposition.proposition_lignes.filter((l) => l.statut === 'a_verifier').length,
        }
      : null,
  });
}

// ------------------------------------------------------------------ détail
export type LigneFicheDetail = Ligne<'fiches',
  | 'envies' | 'contraintes' | 'points_flous' | 'regimes' | 'mobilite' | 'niveau_physique' | 'budget_reel_cents'
  | 'date_debut_fixe' | 'date_fin_fixe' | 'nb_nuits_fixe' | 'notes_conseiller' | 'decision' | 'validee_le' | 'erreur_generation'>;

export type LigneDossierDetail = Ligne<'dossiers', 'id' | 'statut' | 'cree_le'> & {
  demandes: (Ligne<'demandes',
    | 'version' | 'remplacee_le' | 'nom' | 'email' | 'destination' | 'date_debut' | 'date_fin' | 'nb_nuits' | 'voyageurs'
    | 'budget_annonce_cents' | 'envies' | 'contraintes'> & { fiches: LigneFicheDetail | null })[];
  propositions: Ligne<'propositions', 'id' | 'version' | 'statut' | 'total_cents'>[];
};

export type LigneHistorique = Ligne<'historique_dossier', 'cree_le' | 'type' | 'proposition_id' | 'ancien_statut' | 'nouveau_statut' | 'auteur'> & {
  detail?: Ligne<'historique_dossier', 'detail'>['detail'];
  profils: Ligne<'profils', 'nom_affiche'> | null;
};

function resume(h: LigneHistorique) {
  const r = resumeEvenement(h.type, h.detail);
  return r ? { resume: r } : {};
}

export function versEvenement(h: LigneHistorique): EvenementHistorique {
  return EvenementHistorique.parse({
    date: utc(h.cree_le),
    type: h.type,
    cible: h.type === 'statut' ? (h.proposition_id ? 'proposition' : 'dossier') : null,
    ancien_statut: h.ancien_statut,
    nouveau_statut: h.nouveau_statut,
    auteur: h.auteur,
    auteur_nom: h.auteur === 'conseiller' ? (h.profils?.nom_affiche ?? 'Conseiller') : null,
    ...resume(h),
  });
}

export function versDetailDossier(d: LigneDossierDetail, historique: LigneHistorique[]): DetailDossier {
  const demande = versionEnCours(d.demandes);
  if (!demande) throw new Error(`dossier sans demande : ${d.id}`);
  const f = demande.fiches;
  const etat = etatFiche(d.statut, f);
  return DetailDossier.parse({
    dossier_id: d.id,
    statut: d.statut,
    cree_le: utc(d.cree_le),
    demande: {
      version: demande.version,
      client: { nom: demande.nom, email: demande.email },
      destination: demande.destination,
      dates: { debut: demande.date_debut, fin: demande.date_fin, nb_nuits: demande.nb_nuits },
      voyageurs: demande.voyageurs,
      budget_annonce: demande.budget_annonce_cents === null ? null : { montant_cents: demande.budget_annonce_cents },
      envies: demande.envies,
      contraintes: demande.contraintes,
    },
    // sans ligne dans fiches (aucune génération aboutie), l'état reste lisible sur le statut du dossier
    fiche: f && etat
      ? {
          etat,
          erreur: f.erreur_generation,
          envies: f.envies,
          contraintes: f.contraintes,
          points_flous: f.points_flous,
          regimes: f.regimes,
          mobilite: f.mobilite,
          niveau_physique: f.niveau_physique,
          budget_reel_cents: f.budget_reel_cents,
          dates_fixes: { debut: f.date_debut_fixe, fin: f.date_fin_fixe, nb_nuits: f.nb_nuits_fixe },
          notes_conseiller: f.notes_conseiller,
          decision: f.decision,
          validee_le: f.validee_le === null ? null : utc(f.validee_le),
        }
      : null,
    propositions: [...d.propositions].sort((a, b) => a.version - b.version),
    historique: historique.map(versEvenement),
  });
}

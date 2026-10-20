/**
 * Lignes lues dans Supabase → payloads Proposition et VerificationLigne (types/dashboard.ts), validés par leur schéma.
 * Fonctions pures : testées sans base (versPayloadsPropositions.test.ts).
 */
import { Proposition, VerificationLigne } from '../../../types/dashboard';
import type { Database } from '../../../types/database';

type Tables = Database['public']['Tables'];
type Ligne<T extends keyof Tables, K extends keyof Tables[T]['Row']> = Pick<Tables[T]['Row'], K>;

/** Postgres rend « 2026-10-14T11:00:00+00:00 » ; le contrat veut de l'UTC suffixé Z. */
const utc = (instant: string) => new Date(instant).toISOString();
const plusRecente = <V extends { cree_le: string }>(vs: V[]) => [...vs].sort((a, b) => Date.parse(b.cree_le) - Date.parse(a.cree_le))[0];

export type LignePropositionBase = Ligne<'proposition_lignes',
  | 'id' | 'date' | 'participants' | 'prix_unitaire_catalogue_cents' | 'prix_confirme_cents' | 'source' | 'confirme_le'
  | 'statut' | 'total_ligne_cents' | 'cree_le'> & {
  prestations: Ligne<'prestations', 'id' | 'nom' | 'type' | 'capacite' | 'actif'> | null;
  profils: Ligne<'profils', 'nom_affiche'> | null; // auteur de la confirmation
  verifications: Ligne<'verifications', 'statut' | 'prix_unitaire_cents' | 'places_restantes' | 'cree_le'>[];
};

export type PropositionBase = Ligne<'propositions', 'id' | 'dossier_id' | 'version' | 'statut' | 'total_cents' | 'alertes' | 'ecarts'> & {
  proposition_lignes: LignePropositionBase[];
  dossiers: {
    demandes: (Ligne<'demandes', 'version' | 'remplacee_le' | 'budget_annonce_cents'> & {
      fiches: Ligne<'fiches', 'budget_reel_cents'> | null;
    })[];
  } | null;
};

/** Budget de référence des alertes : réel (fiche), sinon annoncé (version en cours de la demande), sinon null. */
function budgetReference(p: PropositionBase): number | null {
  const demande = [...(p.dossiers?.demandes ?? [])]
    .sort((a, b) => Number(a.remplacee_le !== null) - Number(b.remplacee_le !== null) || b.version - a.version)[0];
  return demande?.fiches?.budget_reel_cents ?? demande?.budget_annonce_cents ?? null;
}

export function versProposition(p: PropositionBase): Proposition {
  const lignes = [...p.proposition_lignes].sort((a, b) => a.date.localeCompare(b.date) || a.cree_le.localeCompare(b.cree_le) || a.id.localeCompare(b.id));
  return Proposition.parse({
    id: p.id,
    dossier_id: p.dossier_id,
    version: p.version,
    statut: p.statut,
    lignes: lignes.map((l) => {
      if (!l.prestations) throw new Error(`ligne sans prestation : ${l.id}`);
      const v = plusRecente(l.verifications);
      return {
        id: l.id,
        prestation: l.prestations,
        date: l.date,
        participants: l.participants,
        prix_unitaire_catalogue_cents: l.prix_unitaire_catalogue_cents,
        prix_confirme: l.prix_confirme_cents === null
          ? null
          : { montant_cents: l.prix_confirme_cents, source: l.source, le: utc(l.confirme_le!), par: l.profils?.nom_affiche ?? 'Conseiller' },
        statut: l.statut,
        total_ligne_cents: l.total_ligne_cents,
        derniere_verification: v
          ? { statut: v.statut, prix_unitaire_cents: v.prix_unitaire_cents, places_restantes: v.places_restantes, le: utc(v.cree_le) }
          : null,
      };
    }),
    total_cents: p.total_cents,
    marge_cents: 0, // décidé : pas de marge (REGLES_CHIFFRAGE)
    budget_reference_cents: budgetReference(p),
    alertes: p.alertes,
    ecarts: p.ecarts,
  });
}

export type VerificationBase = Ligne<'verifications',
  | 'id' | 'ligne_id' | 'statut' | 'prix_unitaire_cents' | 'prix_total_cents' | 'places_restantes' | 'resume' | 'reponse_serveur'
  | 'trace' | 'modele' | 'nb_tours' | 'arret' | 'cree_le'> & { profils: Ligne<'profils', 'nom_affiche'> | null };

export function versVerificationLigne(v: VerificationBase): VerificationLigne {
  return VerificationLigne.parse({
    id: v.id,
    ligne_id: v.ligne_id,
    statut: v.statut,
    prix_unitaire_cents: v.prix_unitaire_cents,
    prix_total_cents: v.prix_total_cents,
    places_restantes: v.places_restantes,
    resume: v.resume,
    reponse_serveur: v.reponse_serveur,
    trace: v.trace,
    modele: v.modele,
    nb_tours: v.nb_tours,
    arret: v.arret,
    demandee_par: v.profils?.nom_affiche ?? 'Conseiller',
    le: utc(v.cree_le),
  });
}

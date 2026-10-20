/**
 * Payloads du dashboard conseiller (E0.12, plan section 5.2) : liste des dossiers, détail d'un dossier, proposition.
 * Les fixtures de fixtures/dashboard/ suivent ces schémas ; un test les valide pour que les écrans
 * (E2.1, E4.5, E8.4, E9.3) se construisent sans la base. Écarts avec la section 5.2 : docs/specs/dashboard.md.
 * Principes : montants en centimes ; valeur indisponible = null, jamais 0 ; dates en UTC ISO-8601.
 */
import { z } from 'zod';
import { CODES_ALERTE } from './chiffrage';
import {
  ARRETS_AGENT, AUTEURS_EVENEMENT, DECISIONS_TRI, LIMITES, MOBILITES, NIVEAUX_PHYSIQUES, REGIMES, SOURCES_PRIX, STATUTS_DOSSIER,
  STATUTS_LIGNE, STATUTS_PROPOSITION, STATUTS_VERIFICATION, TRANCHES_AGE, TYPES_EVENEMENT, TYPES_PRESTATION,
} from './enums';
import { TraceVerification } from './trace';

const uuid = z.uuid();
const dateJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-JJ');
const instant = z.iso.datetime(); // UTC, suffixe Z
const cents = z.number().int().nonnegative();
const centsPositif = z.number().int().positive();

/** État de la fiche, déduit des colonnes de `fiches` (la table n'a pas de statut). */
export const ETATS_FICHE = ['en_cours', 'prete', 'erreur', 'validee'] as const;
export type EtatFiche = (typeof ETATS_FICHE)[number];

// ------------------------------------------------------------------ pagination
const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
  }).strict();

// ------------------------------------------------------------------ GET /api/dossiers
export const DossierResume = z.object({
  dossier_id: uuid,
  statut: z.enum(STATUTS_DOSSIER),
  cree_le: instant,
  client: z.object({ nom: z.string().min(1).max(120) }).strict(),
  demande: z.object({
    version: z.number().int().min(1),
    destination: z.string().nullable(), // null = « aucune idée »
    date_debut: dateJour,
    date_fin: dateJour,
    voyageurs: z.number().int().min(1).max(LIMITES.participantsMax),
    budget_annonce: z.object({ montant_cents: centsPositif }).strict().nullable(), // budget total du groupe
  }).strict(),
  fiche: z.object({ etat: z.enum(ETATS_FICHE) }).strict().nullable(),
  proposition: z.object({
    id: uuid,
    version: z.number().int().min(1),
    statut: z.enum(STATUTS_PROPOSITION),
    total_cents: cents.nullable(),
    lignes_a_verifier: z.number().int().nonnegative(),
  }).strict().nullable(), // la dernière version
}).strict();
export type DossierResume = z.infer<typeof DossierResume>;

export const ListeDossiers = page(DossierResume);
export type ListeDossiers = z.infer<typeof ListeDossiers>;

// ------------------------------------------------------------------ GET /api/dossiers/{id}
export const EvenementHistorique = z.object({
  date: instant,
  type: z.enum(TYPES_EVENEMENT),
  cible: z.enum(['dossier', 'proposition']).nullable(), // machine du changement de statut ; null pour les autres événements
  ancien_statut: z.string().nullable(),
  nouveau_statut: z.string().nullable(),
  auteur: z.enum(AUTEURS_EVENEMENT),
  auteur_nom: z.string().nullable(), // nom affiché du conseiller ; null pour le système
}).strict().refine((e) => (e.type === 'statut') === (e.cible !== null && e.nouveau_statut !== null), {
  message: 'un changement de statut a une cible et un nouveau statut ; les autres événements n’en ont pas',
})
  .refine((e) => (e.auteur === 'conseiller') === (e.auteur_nom !== null), { message: 'seul un conseiller a un nom' });
export type EvenementHistorique = z.infer<typeof EvenementHistorique>;

export const DetailDossier = z.object({
  dossier_id: uuid,
  statut: z.enum(STATUTS_DOSSIER),
  cree_le: instant,
  demande: z.object({
    version: z.number().int().min(1),
    client: z.object({ nom: z.string().min(1).max(120), email: z.email() }).strict(),
    destination: z.string().nullable(),
    dates: z.object({ debut: dateJour, fin: dateJour, nb_nuits: z.number().int().min(0).max(LIMITES.nuitsMax) }).strict(),
    voyageurs: z.array(z.enum(TRANCHES_AGE)).min(1).max(LIMITES.participantsMax),
    budget_annonce: z.object({ montant_cents: centsPositif }).strict().nullable(), // budget total du groupe
    envies: z.string().nullable(),
    contraintes: z.string().nullable(),
  }).strict(),
  fiche: z.object({
    etat: z.enum(ETATS_FICHE),
    erreur: z.string().nullable(), // message de génération, pour le bouton « relancer »
    envies: z.array(z.string()),
    contraintes: z.array(z.string()),
    points_flous: z.array(z.string()),
    regimes: z.array(z.enum(REGIMES)),
    mobilite: z.enum(MOBILITES).nullable(),
    niveau_physique: z.enum(NIVEAUX_PHYSIQUES).nullable(),
    // corrigé après l'entretien ; jamais écrasé par une régénération
    budget_reel_cents: centsPositif.nullable(),
    dates_fixes: z.object({ debut: dateJour.nullable(), fin: dateJour.nullable(), nb_nuits: z.number().int().min(0).max(LIMITES.nuitsMax).nullable() }).strict(),
    notes_conseiller: z.string().nullable(),
    decision: z.enum(DECISIONS_TRI).nullable(),
    validee_le: instant.nullable(),
  }).strict().nullable(),
  propositions: z.array(z.object({
    id: uuid,
    version: z.number().int().min(1),
    statut: z.enum(STATUTS_PROPOSITION),
    total_cents: cents.nullable(),
  }).strict()),
  historique: z.array(EvenementHistorique), // du plus ancien au plus récent
}).strict();
export type DetailDossier = z.infer<typeof DetailDossier>;

// ------------------------------------------------------------------ GET /api/propositions/{id}
export const LigneProposition = z.object({
  id: uuid,
  prestation: z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    nom: z.string().min(1),
    type: z.enum(TYPES_PRESTATION),
    capacite: z.number().int().positive(),
    actif: z.boolean(),
  }).strict(),
  date: dateJour,
  participants: z.number().int().min(1).max(LIMITES.participantsMax),
  prix_unitaire_catalogue_cents: cents,
  prix_confirme: z.object({ montant_cents: cents, source: z.enum(SOURCES_PRIX), le: instant, par: z.string().min(1) }).strict().nullable(),
  statut: z.enum(STATUTS_LIGNE),
  total_ligne_cents: cents,
  derniere_verification: z.object({
    statut: z.enum(STATUTS_VERIFICATION),
    prix_unitaire_cents: cents.nullable(),
    places_restantes: z.number().int().nonnegative().nullable(),
    le: instant,
  }).strict().refine((v) => (v.statut === 'echec') === (v.prix_unitaire_cents === null && v.places_restantes === null), {
    message: 'pas de prix ni de places si le simulateur a échoué ; toujours sinon',
  }).nullable(),
}).strict()
  .refine((l) => ['a_verifier', 'indisponible', 'remplacee'].includes(l.statut) || l.prix_confirme !== null, {
    message: 'une ligne confirmée ou réservée a un prix confirmé',
  })
  .refine((l) => l.total_ligne_cents === (l.prix_confirme?.montant_cents ?? l.prix_unitaire_catalogue_cents) * l.participants, {
    message: 'total de ligne = (prix confirmé, sinon catalogue) × participants',
  });
export type LigneProposition = z.infer<typeof LigneProposition>;

export const Proposition = z.object({
  id: uuid,
  dossier_id: uuid,
  version: z.number().int().min(1),
  statut: z.enum(STATUTS_PROPOSITION),
  lignes: z.array(LigneProposition),
  total_cents: cents.nullable(),
  marge_cents: cents, // 0 : décidé, pas de marge (REGLES_CHIFFRAGE)
  budget_reference_cents: centsPositif.nullable(), // réel, sinon annoncé, sinon null
  alertes: z.array(z.object({ code: z.enum(CODES_ALERTE), ligne_id: uuid.optional(), message: z.string().min(1) }).strict()),
  ecarts: z.object({ resume: z.string() }).strict().nullable(), // Should
}).strict();
export type Proposition = z.infer<typeof Proposition>;

// ------------------------------------------------------------------ GET /api/lignes/{id}/verification (E8.4)
/** Dernière vérification d'une ligne : ce que le conseiller regarde avant d'accepter un tarif. */
export const VerificationLigne = z.object({
  id: uuid,
  ligne_id: uuid,
  statut: z.enum(STATUTS_VERIFICATION),
  prix_unitaire_cents: cents.nullable(),
  prix_total_cents: cents.nullable(),
  places_restantes: z.number().int().nonnegative().nullable(),
  resume: z.string().nullable(), // texte de l'agent, sans montant
  reponse_serveur: z.unknown(), // JSON brut du simulateur (montants en euros), affiché tel quel
  trace: TraceVerification, // format de E8.5 (types/trace.ts), expurgé avant écriture
  modele: z.string().min(1),
  nb_tours: z.number().int().min(0).max(LIMITES.toursAgentMax),
  arret: z.enum(ARRETS_AGENT),
  demandee_par: z.string().min(1),
  le: instant,
}).strict()
  .refine((v) => (v.statut === 'echec') === (v.prix_unitaire_cents === null && v.prix_total_cents === null && v.places_restantes === null), {
    message: 'pas de prix ni de places si le simulateur a échoué ; toujours sinon',
  })
  .refine((v) => v.trace.length === v.nb_tours, { message: 'un tour tracé par tour compté' });
export type VerificationLigne = z.infer<typeof VerificationLigne>;

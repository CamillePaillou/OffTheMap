/**
 * Contrats des réponses du LLM (plan, section 5.3). Chaque réponse est validée par ces schémas
 * AVANT toute écriture : une réponse non conforme produit une erreur explicite, jamais une écriture partielle.
 * Règle commune : aucun montant dans un champ texte. Les prix viennent du code ou du simulateur.
 */
import { z } from 'zod';
import { LIMITES, MOBILITES, NIVEAUX_PHYSIQUES, REGIMES } from './enums';

const MONTANT = /\d[\d\s.,]*\s?(€|eur\b|euros?\b)|€|\beuros?\b/i;
/** Texte court sans montant. */
export const texteSansMontant = (max = 2000) =>
  z.string().trim().min(1).max(max).refine((t) => !MONTANT.test(t), { message: 'montant interdit dans le texte' });

const idPrestation = z.string().regex(/^[a-z0-9-]+$/);
const dateJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-JJ');

// ------------------------------------------------------------------ fiche (étape 2)
export const FicheIA = z.object({
  envies: z.array(texteSansMontant(200)).max(15),
  contraintes: z.array(texteSansMontant(200)).max(15),
  regimes: z.array(z.enum(REGIMES)),
  mobilite: z.enum(MOBILITES).nullable(),
  niveau_physique: z.enum(NIVEAUX_PHYSIQUES).nullable(),
  points_flous: z.array(texteSansMontant(300)).max(10),
}).strict(); // le budget n'est pas recopié par l'IA : le code le reprend de la demande
export type FicheIA = z.infer<typeof FicheIA>;

// ------------------------------------------------------------------ brouillon (étape 6)
/**
 * Le schéma dépend des prestations que le code a laissées passer (destination, capacité) :
 * toute prestation hors de cette liste est refusée.
 */
export const schemaBrouillon = (idsAutorises: readonly string[], participants: number) =>
  z.object({
    programme: z.array(z.object({
      date: dateJour,
      titre: texteSansMontant(120),
      texte: texteSansMontant(1500),
    }).strict()).min(1).max(14),
    lignes: z.array(z.object({
      prestation_id: idPrestation,
      date: dateJour,
      participants: z.number().int().min(1).max(LIMITES.participantsMax),
    }).strict()).min(1).max(30),
    ecartes: z.array(z.object({ prestation_id: idPrestation, raison: texteSansMontant(300) }).strict()).default([]),
  }).strict().superRefine((b, ctx) => {
    const autorises = new Set(idsAutorises);
    b.lignes.forEach((l, i) => {
      if (!autorises.has(l.prestation_id)) {
        ctx.addIssue({ code: 'custom', path: ['lignes', i, 'prestation_id'], message: 'prestation hors de la liste fournie' });
      }
      if (l.participants > participants) {
        ctx.addIssue({ code: 'custom', path: ['lignes', i, 'participants'], message: 'plus de participants que de voyageurs' });
      }
    });
  });
export type BrouillonIA = z.infer<ReturnType<typeof schemaBrouillon>>;

// ------------------------------------------------------------------ agent de vérification (étape 7)
/** Le seul outil exposé au modèle. Lecture seule. */
export const ArgsVerifierDisponibilite = z.object({
  prestation_id: idPrestation,
  date: dateJour,
  participants: z.number().int().min(1).max(LIMITES.participantsMax),
}).strict();
export type ArgsVerifierDisponibilite = z.infer<typeof ArgsVerifierDisponibilite>;

/** Définition envoyée à OpenRouter (format « tools » compatible OpenAI). */
export const OUTIL_VERIFIER_DISPONIBILITE = {
  type: 'function',
  function: {
    name: 'verifier_disponibilite',
    description: 'Lit le prix et les places restantes d’une prestation pour une date et un nombre de participants. Ne bloque aucune place.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['prestation_id', 'date', 'participants'],
      properties: {
        prestation_id: { type: 'string', pattern: '^[a-z0-9-]+$' },
        date: { type: 'string', description: 'AAAA-MM-JJ' },
        participants: { type: 'integer', minimum: 1, maximum: LIMITES.participantsMax },
      },
    },
  },
} as const;
export const OUTILS_AUTORISES = ['verifier_disponibilite'] as const;

/**
 * Conclusion de l'agent. Union discriminée : en cas d'échec, le type interdit tout prix et toute place.
 * Les faits (prix, places) sont ensuite comparés au JSON du simulateur (E8.5).
 */
export const ConclusionVerification = z.discriminatedUnion('statut', [
  z.object({
    statut: z.literal('ok'),
    prix_unitaire_cents: z.number().int().nonnegative(),
    places_restantes: z.number().int().nonnegative(),
    resume: texteSansMontant(500),
  }).strict(),
  z.object({
    statut: z.literal('indisponible'),
    prix_unitaire_cents: z.number().int().nonnegative(),
    places_restantes: z.number().int().nonnegative(),
    resume: texteSansMontant(500),
  }).strict(),
  z.object({
    statut: z.literal('echec'),
    prix_unitaire_cents: z.null(),
    places_restantes: z.null(),
    raison: z.enum(['delai', 'erreur_serveur', 'reponse_invalide', 'tours_max']),
    resume: texteSansMontant(500),
  }).strict(),
]);
export type ConclusionVerification = z.infer<typeof ConclusionVerification>;

// ------------------------------------------------------------------ écarts (Should, étape 9)
export const EcartsIA = z.object({
  resume: z.string().trim().min(1).max(1500).refine((t) => !/\d/.test(t), { message: 'aucun nombre dans le résumé' }),
}).strict();
export type EcartsIA = z.infer<typeof EcartsIA>;

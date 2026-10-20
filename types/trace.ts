/**
 * Trace d'une vérification par l'agent (E8.5, contrat docs/agent/contrat-agent.md, rubrique « Trace »).
 * Stockée dans verifications.trace (un tableau de tours) ; modèle, nombre de tours et raison d'arrêt
 * ont leurs propres colonnes. Expurgée AVANT écriture (src/domain/verification/expurger.ts) :
 * jamais X-Team-Key, clé OpenRouter ni clé d'approbation. Aucune donnée du client n'y entre :
 * l'entrée de l'agent est construite par le code à partir de la ligne (prestation, date, participants).
 */
import { z } from 'zod';

export const DECISIONS_CODE = ['accepte', 'refuse'] as const;
export type DecisionCode = (typeof DECISIONS_CODE)[number];

/** Champs que le programme compare au JSON du simulateur (src/domain/verification/comparerFaits.ts). */
export const CHAMPS_FAIT = ['reponse_serveur', 'statut', 'places_restantes', 'prix_unitaire_cents'] as const;
export type ChampFait = (typeof CHAMPS_FAIT)[number];

/** Un fait annoncé par le modèle qui contredit le simulateur. `serveur` vaut `null` si aucune réponse n'a abouti. */
export const EcartFait = z.object({
  champ: z.enum(CHAMPS_FAIT),
  annonce: z.union([z.string(), z.number()]),
  serveur: z.union([z.string(), z.number()]).nullable(),
}).strict();
export type EcartFait = z.infer<typeof EcartFait>;

/** Ce que le modèle a proposé dans ce tour. `null` : le modèle a rendu sa conclusion sans appel d'outil. */
export const AppelTrace = z.object({
  nom: z.string().max(100),
  arguments: z.record(z.string(), z.unknown()),
}).strict();

export const TourTrace = z.object({
  numero: z.number().int().min(1).max(3),
  horodatage: z.string().datetime({ offset: true }),
  appel: AppelTrace.nullable(),
  /** JSON brut rendu par le modèle comme conclusion, `null` pour un tour d'appel d'outil. Conservé même rejeté. */
  conclusion: z.unknown().nullable(),
  /** Décision du programme : sur l'appel d'outil, ou sur la conclusion (faits comparés au JSON). */
  decision: z.object({
    statut: z.enum(DECISIONS_CODE),
    raison: z.string().max(500).nullable(),
    /** Faits de la conclusion contredits par le simulateur ; vide pour un appel d'outil ou une conclusion exacte. */
    ecarts: z.array(EcartFait).max(CHAMPS_FAIT.length),
  }).strict(),
  /** `null` si aucune requête n'est partie (appel refusé, conclusion, délai avant réponse). */
  http_statut: z.number().int().min(100).max(599).nullable(),
  /** Réponse brute du simulateur, telle que reçue. */
  reponse_simulateur: z.unknown().nullable(),
  duree_ms: z.number().int().nonnegative(),
}).strict();
export type TourTrace = z.infer<typeof TourTrace>;

/** Contenu de verifications.trace : 3 tours maximum, comme verifications.nb_tours. */
export const TraceVerification = z.array(TourTrace).max(3);
export type TraceVerification = z.infer<typeof TraceVerification>;

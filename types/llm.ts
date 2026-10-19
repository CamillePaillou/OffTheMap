/**
 * Ce qui a le droit de partir vers le LLM (ADR-0007, minimisation).
 * `DemandePourLLM` est un type « marqué » : on ne peut l'obtenir qu'en passant par `versDemandePourLLM`.
 * Le port LlmClient n'accepte que ce type : envoyer un nom, un e-mail ou une précision de santé
 * devient une erreur de compilation, pas seulement un test qui échoue.
 */
import { z } from 'zod';
import { LIMITES, MOBILITES, NIVEAUX_PHYSIQUES, REGIMES, TRANCHES_AGE } from './enums';
import type { Mobilite, NiveauPhysique, Regime, TrancheAge } from './enums';

/** Une ligne de `demandes` telle que lue en base (sous-ensemble utile ici). */
export interface DemandeLue {
  nom: string;
  email: string;
  tel: string | null;
  destination: string | null;
  date_debut: string;
  date_fin: string;
  dates_flexibles: boolean;
  nb_nuits: number;
  voyageurs: TrancheAge[];
  budget_annonce_cents: number | null;
  budget_ferme: boolean;
  envies: string | null;
  contraintes: string | null;
  niveau_physique: NiveauPhysique | null;
  regimes: Regime[];
  regime_precision: string | null;
  mobilite: Mobilite | null;
  sante_precision: string | null;
}

const schemaDemandePourLLM = z.object({
  destination: z.string().nullable(),
  date_debut: z.string(),
  date_fin: z.string(),
  dates_flexibles: z.boolean(),
  nb_nuits: z.number().int().min(0).max(LIMITES.nuitsMax),
  voyageurs: z.array(z.enum(TRANCHES_AGE)).min(1).max(LIMITES.participantsMax),
  budget_annonce_cents: z.number().int().positive().nullable(),
  budget_ferme: z.boolean(),
  envies: z.string().nullable(),
  contraintes: z.string().nullable(),
  niveau_physique: z.enum(NIVEAUX_PHYSIQUES).nullable(),
  regimes: z.array(z.enum(REGIMES)), // catégories seulement
  mobilite: z.enum(MOBILITES).nullable(),
}).strict(); // un champ en trop (nom, e-mail, précision…) fait échouer la validation

declare const minimisee: unique symbol;
export type DemandePourLLM = z.infer<typeof schemaDemandePourLLM> & { readonly [minimisee]: true };

/** Seule porte d'entrée vers le LLM. Recopie champ par champ, sans spread, pour ne rien laisser passer. */
export function versDemandePourLLM(d: DemandeLue): DemandePourLLM {
  const sortie = schemaDemandePourLLM.parse({
    destination: d.destination,
    date_debut: d.date_debut,
    date_fin: d.date_fin,
    dates_flexibles: d.dates_flexibles,
    nb_nuits: d.nb_nuits,
    voyageurs: d.voyageurs,
    budget_annonce_cents: d.budget_annonce_cents,
    budget_ferme: d.budget_ferme,
    envies: d.envies,
    contraintes: d.contraintes,
    niveau_physique: d.niveau_physique,
    regimes: d.regimes,
    mobilite: d.mobilite,
  });
  return sortie as DemandePourLLM;
}

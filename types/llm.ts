/**
 * Ce qui a le droit de partir vers le LLM (ADR-0007, minimisation).
 * `DemandePourLLM` est un type « marqué » : on ne peut l'obtenir qu'en passant par `versDemandePourLLM`.
 * Le port LlmClient n'accepte que ce type : envoyer un nom ou un e-mail
 * devient une erreur de compilation, pas seulement un test qui échoue.
 */
import { z } from 'zod';
import { LIMITES, MOBILITES, REGIMES, TRANCHES_AGE } from './enums';
import type { Mobilite, Regime, TrancheAge } from './enums';

/** Une ligne de `demandes` telle que lue en base (sous-ensemble utile ici). */
export interface DemandeLue {
  nom: string;
  email: string;
  destination: string | null;
  date_debut: string;
  date_fin: string;
  nb_nuits: number;
  voyageurs: TrancheAge[];
  budget_annonce_cents: number | null;
  envies: string | null;
  contraintes: string | null;
  regimes: Regime[];
  mobilite: Mobilite | null;
}

const schemaDemandePourLLM = z.object({
  destination: z.string().nullable(),
  date_debut: z.string(),
  date_fin: z.string(),
  nb_nuits: z.number().int().min(0).max(LIMITES.nuitsMax),
  voyageurs: z.array(z.enum(TRANCHES_AGE)).min(1).max(LIMITES.participantsMax),
  budget_annonce_cents: z.number().int().positive().nullable(),
  envies: z.string().nullable(),
  contraintes: z.string().nullable(),
  regimes: z.array(z.enum(REGIMES)), // catégories seulement
  mobilite: z.enum(MOBILITES).nullable(),
}).strict(); // un champ en trop (nom, e-mail…) fait échouer la validation

declare const minimisee: unique symbol;
export type DemandePourLLM = z.infer<typeof schemaDemandePourLLM> & { readonly [minimisee]: true };

/** Seule porte d'entrée vers le LLM. Recopie champ par champ, sans spread, pour ne rien laisser passer. */
export function versDemandePourLLM(d: DemandeLue): DemandePourLLM {
  const sortie = schemaDemandePourLLM.parse({
    destination: d.destination,
    date_debut: d.date_debut,
    date_fin: d.date_fin,
    nb_nuits: d.nb_nuits,
    voyageurs: d.voyageurs,
    budget_annonce_cents: d.budget_annonce_cents,
    envies: d.envies,
    contraintes: d.contraintes,
    regimes: d.regimes,
    mobilite: d.mobilite,
  });
  return sortie as DemandePourLLM;
}

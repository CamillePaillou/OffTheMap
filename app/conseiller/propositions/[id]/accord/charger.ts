import 'server-only';
import { PROPOSITION_DEPOT_RECU } from '@/fixtures/dashboard';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import type { Proposition } from '@/types/dashboard';

/**
 * La proposition de l'écran d'accord (E9.3) : lue en base, au nom du conseiller connecté (RLS). La proposition des
 * fixtures du dashboard reste disponible pour la démonstration sans base. Null si elle n'existe pas.
 */
export async function chargerProposition(id: string): Promise<Proposition | null> {
  if (id === PROPOSITION_DEPOT_RECU.id) return PROPOSITION_DEPOT_RECU;
  return new PropositionsSupabase().proposition(id);
}

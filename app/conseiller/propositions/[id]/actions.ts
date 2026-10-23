'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { genererBrouillonEnArrierePlan } from '@/lib/proposition/generation';
import { relancerBrouillon } from '@/src/application/genererBrouillon';
import { StatutsSupabase } from '@/src/infrastructure/db/statutsSupabase';

/** Bouton « relancer » d'un brouillon en erreur (E4.4) : erreur → brouillon_en_cours, puis génération en arrière-plan. */
export async function relancerBrouillonAction(propositionId: string): Promise<{ erreur?: string }> {
  const conseiller = await exigerConseiller(`/conseiller/propositions/${propositionId}`);
  const r = await relancerBrouillon(new StatutsSupabase(), propositionId, conseiller.id);
  if (!r.ok) {
    return { erreur: r.raison === 'statut_modifie' ? 'La proposition a changé entre-temps : rechargez la page.' : 'Ce brouillon ne peut pas être relancé.' };
  }
  genererBrouillonEnArrierePlan(propositionId);
  refresh();
  return {};
}

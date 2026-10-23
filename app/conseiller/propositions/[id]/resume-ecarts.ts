'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { resumerEcarts } from '@/src/application/resumeEcarts';
import { PropositionsSupabase, ResumeEcartsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { creerLlmClient } from '@/src/infrastructure/llm';

export interface EtatResume {
  erreur?: string;
}

const MESSAGES = {
  introuvable: 'Cette proposition n’existe plus.',
  premiere_version: 'Il n’y a pas de version précédente à comparer.',
  aucun_ecart: 'Aucune prestation n’a changé : il n’y a rien à résumer.',
} as const;

/** « Rédiger le résumé pour le client » (E6.3) : appel au modèle, réponse validée sans chiffres, puis enregistrée. */
export async function rediger(propositionId: string): Promise<EtatResume> {
  await exigerConseiller(`/conseiller/propositions/${propositionId}`);
  let r;
  try {
    r = await resumerEcarts(
      { lecture: new PropositionsSupabase(), ecriture: new ResumeEcartsSupabase(), llm: creerLlmClient() },
      propositionId,
    );
  } catch {
    return { erreur: 'Le résumé n’a pas pu être écrit. Réessayez dans un instant.' };
  }
  if (!r.ok) return { erreur: r.raison === 'modele' ? r.message : MESSAGES[r.raison] };
  refresh();
  return {};
}

import 'server-only';
import { after } from 'next/server';
import { genererBrouillon } from '@/src/application/genererBrouillon';
import { GenerationBrouillonSupabase } from '@/src/infrastructure/db/generationBrouillonSupabase';
import { creerLlmClient } from '@/src/infrastructure/llm';

/**
 * Génère le brouillon côté serveur, après la réponse envoyée au navigateur (ADR-0005, comme la fiche) :
 * le conseiller n'attend pas le modèle. Le statut de la proposition (brouillon_en_cours, a_verifier, erreur) dit où on en est.
 */
export function genererBrouillonEnArrierePlan(propositionId: string) {
  after(async () => {
    try {
      const r = await genererBrouillon({ brouillons: new GenerationBrouillonSupabase(), llm: creerLlmClient() }, propositionId);
      if (!r.ok) console.warn(`[brouillon] proposition ${propositionId} : ${'raison' in r ? r.raison : `erreur après ${r.essais} essais`}`);
    } catch (e) {
      // ni données du client ni clé dans les journaux du serveur : le nom de l'erreur seulement
      console.error(`[brouillon] proposition ${propositionId} : génération interrompue (${e instanceof Error ? e.name : 'erreur'})`);
    }
  });
}

'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { reverifierLigne } from '@/src/application/reverifierLigne';
import { verifierPrestation } from '@/src/application/verifierPrestation';
import { PropositionsSupabase, VerificationsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { lireConfigOpenRouter, OpenRouterLlmClient } from '@/src/infrastructure/llm/openrouter-llm-client';
import { creerPrestataires } from '@/src/infrastructure/prestataires/simulateur';
import { LlmError } from '@/src/ports/llm-client';

export interface EtatReverification {
  erreur?: string;
}

/** Lance l'agent de vérification (E8.3) sur la ligne et enregistre son résultat (E8.4). */
export async function reverifier(propositionId: string, ligneId: string): Promise<EtatReverification> {
  const conseiller = await exigerConseiller(`/conseiller/propositions/${propositionId}/lignes/${ligneId}`);

  let deps;
  try {
    deps = {
      modele: new OpenRouterLlmClient(lireConfigOpenRouter(process.env)),
      prestataires: creerPrestataires(process.env),
      // masquées dans la trace avant tout enregistrement
      secrets: [process.env.LLM_API_KEY, process.env.SIMULATEUR_TEAM_KEY],
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { erreur: `L’agent n’est pas configuré sur le serveur : ${detail}.` };
  }

  try {
    const r = await reverifierLigne(
      { lecture: new PropositionsSupabase(), ecriture: new VerificationsSupabase(), verifier: (ligne) => verifierPrestation(ligne, deps) },
      { propositionId, ligneId, conseillerId: conseiller.id },
    );
    if (!r.ok) return { erreur: 'Ligne introuvable.' };
  } catch (e) {
    if (e instanceof LlmError) return { erreur: 'Le modèle n’a pas pu être appelé. Réessayez dans un instant.' };
    return { erreur: 'La vérification n’a pas pu être enregistrée. Réessayez dans un instant.' };
  }
  refresh();
  return {};
}

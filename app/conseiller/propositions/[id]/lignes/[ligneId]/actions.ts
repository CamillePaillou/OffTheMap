'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { reverifierLigne } from '@/src/application/reverifierLigne';
import { verifierPrestation } from '@/src/application/verifierPrestation';
import { PropositionsSupabase, VerificationsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { trouverEnregistrement } from '@/src/infrastructure/db/enregistrementsAgent';
import { modeAgent } from '@/src/infrastructure/llm';
import { ModeleRejeu } from '@/src/infrastructure/llm/modele-rejeu';
import type { ModeleAgent } from '@/src/ports/modele-agent';
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
    let modele: ModeleAgent;
    if (modeAgent(process.env) === 'rejeu') {
      // E11.3 : démonstration sans OpenRouter. Seul le modèle est rejoué, le simulateur répond en direct.
      const lecture = new PropositionsSupabase();
      const ligne = (await lecture.proposition(propositionId))?.lignes.find((l) => l.id === ligneId);
      const enregistrement = ligne && (await trouverEnregistrement({ prestation_id: ligne.prestation.id, date: ligne.date, participants: ligne.participants }));
      if (!enregistrement) {
        return { erreur: 'Mode rejeu : aucune réponse du modèle n’a été enregistrée pour cette prestation, à cette date et pour ce nombre de voyageurs. Vérifiez le prix par téléphone, ou repassez l’agent en mode réel.' };
      }
      modele = new ModeleRejeu(enregistrement);
    } else {
      modele = new OpenRouterLlmClient(lireConfigOpenRouter(process.env));
    }
    deps = {
      modele,
      prestataires: creerPrestataires(process.env),
      // masquées dans la trace avant tout enregistrement
      secrets: [process.env.LLM_API_KEY, process.env.SIMULATEUR_TEAM_KEY],
    };
  } catch (e) {
    // le détail technique va dans les journaux du serveur, pas à l'écran
    console.error('agent de vérification non configuré :', e instanceof Error ? e.message : e);
    return { erreur: 'L’agent de vérification n’est pas configuré sur ce serveur (modèle ou clé d’équipe manquants). Vérifiez le prix par téléphone en attendant.' };
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

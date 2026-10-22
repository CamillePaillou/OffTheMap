import { describe, expect, it } from 'vitest';
import { LlmError } from '../../ports/llm-client';
import type { ModeleAgent, RequeteChat } from '../../ports/modele-agent';
import { ModeleHybride } from './modele-hybride';

const requete = (question: string): RequeteChat => ({
  messages: [{ role: 'system', content: 'Consignes.\n\nAujourd’hui : 2026-10-22.' }, { role: 'user', content: question }],
  tools: [],
});
const espion = (nom: string, echec?: Error) => {
  const appels: string[] = [];
  const m: ModeleAgent & { appels: string[] } = {
    appels,
    async appeler() {
      appels.push(nom);
      if (echec) throw echec;
      return { modele: nom, message: { content: nom } };
    },
  };
  return m;
};

describe('modèle hybride du chatbot (OpenRouter)', () => {
  it('une question comprise par les règles ne part pas au modèle : réponse immédiate', async () => {
    const regles = espion('regles');
    const modele = espion('modele');
    const h = new ModeleHybride(regles, modele);
    for (const q of ['Que faire à Lyon ?', 'Une activité quand il pleut ?', 'Combien ça coûte ?', 'Bonjour']) {
      await new ModeleHybride(regles, modele).appeler(requete(q));
    }
    await h.appeler(requete('Et le 14 novembre ?'));
    expect(modele.appels).toEqual([]);
  });

  it('une question ouverte va au modèle, et toute la boucle d’outils reste au modèle', async () => {
    const regles = espion('regles');
    const modele = espion('modele');
    const h = new ModeleHybride(regles, modele);
    await h.appeler(requete('C’est adapté à un enfant de cinq ans ?'));
    await h.appeler(requete('C’est adapté à un enfant de cinq ans ?'));
    expect(modele.appels).toEqual(['modele', 'modele']);
    expect(regles.appels).toEqual([]);
  });

  it('modèle en panne ou trop lent : les règles répondent, sans nouvel essai du modèle', async () => {
    const regles = espion('regles');
    const modele = espion('modele', new LlmError('delai', 'trop long'));
    const h = new ModeleHybride(regles, modele);
    expect((await h.appeler(requete('C’est adapté à un enfant ?'))).message.content).toBe('regles');
    await h.appeler(requete('C’est adapté à un enfant ?'));
    expect(modele.appels).toEqual(['modele']);
  });

  it('budget du message dépassé : les règles terminent', async () => {
    let t = 0;
    const regles = espion('regles');
    const modele = espion('modele');
    const h = new ModeleHybride(regles, modele, 15_000, () => t);
    await h.appeler(requete('C’est adapté à un enfant ?'));
    t = 16_000;
    await h.appeler(requete('C’est adapté à un enfant ?'));
    expect(modele.appels).toEqual(['modele']);
    expect(regles.appels).toEqual(['regles']);
  });
});

/**
 * Essai réel du chatbot (E1.3) : OpenRouter (modèles gratuits) + simulateur du formateur. Ignoré par `npm test` et la CI.
 * Lancement : `make essai-chatbot` (simulateur démarré, LLM_API_KEY et LLM_MODEL dans .env).
 * `make essai-chatbot PANNE=delai` (ou `erreur_serveur`) : la réponse doit être « non vérifié ».
 * Contrôles : aucun prix dans la réponse, aucune clé, aucune donnée personnelle envoyée.
 */
import { describe, expect, it } from 'vitest';
import { contientPrix } from '../domain/chatbot/sansPrix';
import { lireConfigOpenRouter, OpenRouterLlmClient } from '../infrastructure/llm/openrouter-llm-client';
import { creerPrestataires } from '../infrastructure/prestataires/simulateur';
import type { RequeteChat } from '../ports/modele-agent';
import { ConversationChatbot, MESSAGES_FIXES, repondreChatbot } from './repondreChatbot';

const actif = process.env.LLM_ESSAI_REEL === '1';
const config = actif ? lireConfigOpenRouter(process.env) : null;
const panne = process.env.SIMULATEUR_PANNE?.trim() || 'aucune';

/** Un samedi dans trois semaines, en toutes lettres (« 14 novembre »). */
function samediProchain(): string {
  const d = new Date(Date.now() + 21 * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

describe.skipIf(!actif)('chatbot, appel réel', () => {
  for (const modele of config?.modeles ?? []) {
    it(`${modele} : disponibilité d'un atelier à Nantes (panne : ${panne})`, async () => {
      const client = new OpenRouterLlmClient({ ...config!, modeles: [modele] });
      const envoye: RequeteChat[] = [];
      const espion = { appeler: (r: RequeteChat) => (envoye.push(structuredClone(r)), client.appeler(r)) };
      const question = `Bonjour, je suis allergique aux noix (lea@example.org). Un atelier à Nantes le ${samediProchain()} pour deux, c'est possible ? Et combien ça coûte ?`;

      const r = await repondreChatbot(ConversationChatbot.parse({ messages: [{ role: 'user', content: question }] }), {
        modele: espion,
        prestataires: creerPrestataires(process.env),
      });
      console.log(`\n[${modele}] ${r.verification ?? 'sans vérification'} : ${r.texte}\nsuggestion : ${JSON.stringify(r.suggestion)}`);

      expect(contientPrix(r.texte)).toBe(false);
      const parti = JSON.stringify(envoye);
      for (const secret of [process.env.LLM_API_KEY, process.env.SIMULATEUR_TEAM_KEY]) if (secret) expect(parti).not.toContain(secret);
      expect(parti).not.toMatch(/lea@example\.org|noix/);
      if (panne !== 'aucune') expect(r.texte).toBe(MESSAGES_FIXES.nonVerifie);
    }, 120_000);
  }
});

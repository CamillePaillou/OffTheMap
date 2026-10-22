import { describe, expect, it } from 'vitest';
import { ConversationChatbot, repondreChatbot } from '../../application/repondreChatbot';
import { contientPrix } from '../../domain/chatbot/sansPrix';
import type { PrestationCatalogue, Prestataires } from '../../ports/prestataires';
import { FauxModeleChat, lireDate, lireDestination, lireVoyageurs } from './faux-modele-chat';

const CATALOGUE: PrestationCatalogue[] = [
  { id: 'activite-nantes-01', type: 'activite', nom: 'Atelier de machines imaginaires', destination: 'Nantes', prix_unitaire_cents: 3500, capacite: 10, tags: [] },
];
const simulateur: Pick<Prestataires, 'catalogue' | 'disponibilite'> = {
  catalogue: async () => ({ ok: true, valeur: CATALOGUE }),
  disponibilite: async (l) => ({ ok: true, valeur: { ...l, disponible: true, places_restantes: 6, prix_unitaire_cents: 4000, prix_total_cents: 8000 } }),
};
const deps = { modele: new FauxModeleChat(), prestataires: simulateur, maintenant: () => new Date('2026-10-22T10:00:00Z') };
const demander = (...messages: string[]) =>
  repondreChatbot(ConversationChatbot.parse({ messages: messages.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content })) }), deps);

describe('faux modèle du chatbot (LLM_PROVIDER=fake)', () => {
  it('lit la destination, la date et le nombre de voyageurs', () => {
    expect(lireDestination('un week-end à LYON ?')).toBe('Lyon');
    expect(lireDate('le 7 novembre', '2026-10-22')).toBe('2026-11-07');
    expect(lireDate('le 03/02', '2026-10-22')).toBe('2027-02-03');
    expect(lireDate('2026-12-05', '2026-10-22')).toBe('2026-12-05');
    expect(lireVoyageurs('pour deux')).toBe(2);
    expect(lireVoyageurs('nous serons 3 personnes')).toBe(3);
    expect(lireVoyageurs('à Nantes')).toBeNull();
  });

  it('va jusqu’à la disponibilité avec les vrais outils, sans prix', async () => {
    const r = await demander('Un atelier à Nantes le 7 novembre pour deux ?');
    expect(r.verification).toBe('disponible');
    expect(r.texte).toMatch(/Atelier de machines imaginaires est disponible le 7 novembre pour 2 personnes/);
    expect(contientPrix(r.texte)).toBe(false);
    expect(r.suggestion).toEqual({ destination: 'Nantes', date_debut: '2026-11-07', voyageurs: 2 });
  });

  it('demande la date quand elle manque, puis reprend la conversation', async () => {
    const premiere = await demander('Que faire à Nantes ?');
    expect(premiere.texte).toMatch(/Donnez-moi une date/);
    const suite = await demander('Que faire à Nantes ?', premiere.texte, 'Le 7 novembre, pour deux');
    expect(suite.verification).toBe('disponible');
  });

  it('refuse de réserver et de donner un prix', async () => {
    expect((await demander('Réservez-moi l’hôtel')).texte).toMatch(/conseiller/);
    expect((await demander('Combien coûte Lille ?')).texte).toMatch(/Je ne donne pas de prix/);
  });
});

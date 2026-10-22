import { describe, expect, it } from 'vitest';
import { ConversationChatbot, repondreChatbot } from '../../application/repondreChatbot';
import { contientPrix } from '../../domain/chatbot/sansPrix';
import type { PrestationCatalogue, Prestataires } from '../../ports/prestataires';
import { FauxModeleChat, lireDate, lireDestination, lireVoyageurs } from './faux-modele-chat';

// le catalogue de démonstration (supabase/seed.sql), tel que le simulateur le renvoie
const p = (id: string, type: PrestationCatalogue['type'], nom: string, destination: string, description: string, tags: string[]): PrestationCatalogue =>
  ({ id, type, nom, destination, prix_unitaire_cents: 3500, capacite: 10, description, tags });
const CATALOGUE: PrestationCatalogue[] = [
  p('train-nantes-01', 'transport', 'Train vers Nantes', 'Nantes', 'Trajet aller-retour depuis Paris', ['train', 'sans voiture']),
  p('hotel-nantes-01', 'hebergement', 'Hôtel des Machines', 'Nantes', 'Une nuit, tarif par personne', ['centre-ville']),
  p('activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 'Nantes', 'Atelier accessible sans effort sportif', ['créatif', 'intérieur']),
  p('hotel-lyon-01', 'hebergement', 'Hôtel des Lumières', 'Lyon', 'Une nuit fictive, tarif par personne', ['centre-ville']), // texte exact du simulateur
  p('activite-lyon-01', 'activite', 'Enquête des traboules', 'Lyon', 'Jeu de piste en ville', ['jeu', 'extérieur']),
  p('activite-lille-01', 'activite', 'Fabrique de gaufres', 'Lille', 'Atelier culinaire', ['cuisine', 'intérieur']),
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
    expect(r.texte).toMatch(/C’est libre : Atelier de machines imaginaires, le samedi 7 novembre, pour 2 personnes/);
    expect(contientPrix(r.texte)).toBe(false);
    expect(r.suggestion).toEqual({ destination: 'Nantes', date_debut: '2026-11-07', voyageurs: 2 });
  });

  it('demande la date quand elle manque, puis reprend la conversation', async () => {
    const premiere = await demander('Que faire à Nantes ?');
    expect(premiere.texte).toMatch(/Donnez-moi une date/);
    const suite = await demander('Que faire à Nantes ?', premiere.texte, 'Le 7 novembre, pour deux');
    expect(suite.verification).toBe('disponible');
  });

  it('répond aux questions sur l’offre avec le catalogue, sans renvoyer vers un conseiller', async () => {
    const hotels = await demander('Vous avez quoi comme hôtels à Lyon ?');
    expect(hotels.texte).toMatch(/Hôtel des Lumières/);
    expect(hotels.texte).not.toMatch(/Enquête des traboules|conseiller/);
    expect(hotels.texte).toMatch(/: une nuit, tarif par personne\./); // « fictive » retiré proprement

    const pluie = await demander('Une activité quand il pleut ?');
    expect(pluie.texte).toMatch(/intérieur/);
    expect(pluie.texte).toMatch(/Atelier de machines imaginaires/);
    expect(pluie.texte).toMatch(/Fabrique de gaufres/);
    expect(pluie.texte).not.toMatch(/Enquête des traboules/); // en extérieur

    const offre = await demander('Qu’est-ce que vous proposez ?');
    for (const ville of ['Nantes', 'Lyon', 'Lille']) expect(offre.texte).toMatch(new RegExp(`^${ville} :`, 'm'));
    for (const r of [hotels, pluie, offre]) {
      expect(r.verification).toBeNull();
      expect(contientPrix(r.texte)).toBe(false);
    }
  });

  it('sans résultat pour un mot-clé, montre ce qui existe dans la ville', async () => {
    const r = await demander('Une activité en cuisine à Nantes ?');
    expect(r.texte).toMatch(/Rien ne correspond exactement à « cuisine » à Nantes/);
    expect(r.texte).toMatch(/Atelier de machines imaginaires/);
  });

  it('vérifie l’hôtel quand c’est l’hôtel qui est demandé', async () => {
    const r = await demander('Un hôtel à Nantes le 7 novembre pour deux ?');
    expect(r.texte).toMatch(/C’est libre : Hôtel des Machines/);
  });

  it('refuse de réserver et de donner un prix', async () => {
    expect((await demander('Réservez-moi l’hôtel')).texte).toMatch(/Je ne réserve rien moi-même/);
    expect((await demander('Combien coûte Lille ?')).texte).toMatch(/Je ne donne pas de prix/);
  });
});

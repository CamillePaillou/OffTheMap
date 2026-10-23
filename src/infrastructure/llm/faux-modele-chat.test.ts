import { describe, expect, it } from 'vitest';
import { ConversationChatbot, repondreChatbot } from '../../application/repondreChatbot';
import { contientPrix } from '../../domain/chatbot/sansPrix';
import type { PrestationCatalogue, Prestataires } from '../../ports/prestataires';
import { comprendQuestion, FauxModeleChat, lireDate, lireDateImpossible, lireDestination, lireVoyageurs, oublieLesDates } from './faux-modele-chat';

// le catalogue de démonstration (supabase/seed.sql), tel que le simulateur le renvoie
const p = (id: string, type: PrestationCatalogue['type'], nom: string, destination: string, description: string, tags: string[]): PrestationCatalogue =>
  ({ id, type, nom, destination, prix_unitaire_cents: 3500, capacite: 10, description, tags });
const CATALOGUE: PrestationCatalogue[] = [
  p('train-nantes-01', 'transport', 'Train vers Nantes', 'Nantes', 'Trajet aller-retour depuis Paris', ['train', 'sans voiture']),
  p('hotel-nantes-01', 'hebergement', 'Hôtel des Machines', 'Nantes', 'Une nuit, tarif par personne', ['centre-ville']),
  p('activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 'Nantes', 'Atelier accessible sans effort sportif', ['créatif', 'intérieur']),
  p('hotel-lyon-01', 'hebergement', 'Hôtel des Lumières', 'Lyon', 'Une nuit fictive, tarif par personne', ['centre-ville']), // texte exact du simulateur
  p('activite-lyon-01', 'activite', 'Enquête des traboules', 'Lyon', 'Jeu de piste en ville', ['jeu', 'extérieur']),
  p('train-lyon-01', 'transport', 'Train vers Lyon', 'Lyon', 'Trajet fictif aller-retour depuis Paris', ['train', 'sans voiture']),
  p('train-lille-01', 'transport', 'Train vers Lille', 'Lille', 'Trajet fictif aller-retour depuis Paris', ['train', 'sans voiture']),
  p('hotel-lille-01', 'hebergement', 'Hôtel du Beffroi', 'Lille', 'Une nuit fictive, tarif par personne', ['centre-ville']),
  p('activite-lille-01', 'activite', 'Fabrique de gaufres', 'Lille', 'Atelier culinaire', ['cuisine', 'intérieur']), // les 9 prestations du simulateur
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
    const noms = (r: { prestations: { nom: string }[] }) => r.prestations.map((c) => c.nom);
    const hotels = await demander('Vous avez quoi comme hôtels à Lyon ?');
    expect(hotels.texte).toBe('Une adresse à Lyon, chez nos partenaires.\nDonnez-moi une date et le nombre de voyageurs : je vérifie si c’est libre.');
    expect(noms(hotels)).toEqual(['Hôtel des Lumières']);
    expect(hotels.prestations[0]!.description).toBe('Une nuit, tarif par personne'); // « fictive » retiré proprement

    const pluie = await demander('Une activité quand il pleut ?');
    expect(pluie.texte).toMatch(/^2 adresses en intérieur à Nantes et Lille/);
    expect(noms(pluie)).toEqual(['Atelier de machines imaginaires', 'Fabrique de gaufres']); // pas les traboules, en extérieur

    const offre = await demander('Qu’est-ce que vous proposez ?');
    expect(offre.texte.length).toBeLessThan(200); // court : le détail est dans les cartes
    // les activités d'abord, une par ville, puis un hébergement : jamais le train en tête
    expect(offre.prestations.map((c) => `${c.type} ${c.destination}`)).toEqual(['activite Nantes', 'activite Lyon', 'activite Lille', 'hebergement Nantes']);
    for (const r of [hotels, pluie, offre]) {
      expect(r.verification).toBeNull();
      expect(r.texte).not.toMatch(/conseiller/);
      expect(contientPrix(r.texte)).toBe(false);
    }
  });

  it('sans résultat pour un mot-clé, montre ce qui existe dans la ville', async () => {
    const r = await demander('Une activité en cuisine à Nantes ?');
    expect(r.texte).toMatch(/^Rien de tel à Nantes pour l’instant\. 3 adresses à Nantes/);
    expect(r.prestations.map((c) => c.nom)).toContain('Atelier de machines imaginaires');
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

describe('une date qui n’existe pas (32 octobre, 31 février)', () => {
  it('ne la prend pas pour une date, et dit laquelle n’existe pas', () => {
    for (const t of ['le 32 octobre', 'le 0 novembre', 'le 31 avril', 'le 30 février', 'le 31/02', 'le 12/13', '2026-13-01', '2026-02-30']) {
      expect(lireDate(t, '2026-10-22'), t).toBeNull();
    }
    expect(lireDateImpossible('Et le 32 octobre', '2026-10-22')).toBe('32 octobre');
    expect(lireDateImpossible('le 31/02', '2026-10-22')).toBe('31/02');
    expect(lireDateImpossible('le 29 février', '2026-10-22')).toBe('29 février 2027'); // 2027 n'est pas bissextile
    expect(lireDate('le 29 février', '2027-10-22')).toBe('2028-02-29');
    expect(lireDate('le 31 octobre', '2026-10-22')).toBe('2026-10-31');
    expect(lireDateImpossible('le 31 octobre', '2026-10-22')).toBeNull();
    expect(comprendQuestion('Et le 32 octobre', '2026-10-22')).toBe(true); // le modèle de règles répond, pas le vrai modèle
  });

  it('« Et le 32 octobre » : le chatbot le dit au lieu de répondre à côté, puis repart avec la date suivante', async () => {
    const appels: string[] = [];
    const espion = { ...deps, prestataires: { ...simulateur, disponibilite: async (l: { prestation_id: string; date: string; participants: number }) => (appels.push(l.date), simulateur.disponibilite(l)) } };
    const histo: string[] = [];
    const tour = async (question: string) => {
      histo.push(question);
      const r = await repondreChatbot(ConversationChatbot.parse({ messages: histo.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content })) }), espion);
      histo.push(r.texte);
      return r;
    };
    await tour('Où dormir à Lyon ?');
    await tour('Libre le 31 octobre pour 2 ?');
    const r = await tour('Et le 32 octobre');
    expect(r.texte).toMatch(/^Le 32 octobre n’existe pas au calendrier\. Quelle date voulez-vous \?/);
    expect(r.verification).toBeNull();
    expect(r.prestations).toEqual([]);
    expect(appels).toEqual(['2026-10-31']); // pas de vérification au 32 octobre
    expect((await tour('Et le 1er novembre ?')).verification).toBe('disponible');
    expect(appels.at(-1)).toBe('2026-11-01');
  });
});

describe('la date ne reste pas collée à la conversation (correctif E1.3)', () => {
  // comme en local sans clé d'équipe : le catalogue répond, la disponibilité est en panne
  const enPanne = { ...deps, prestataires: { ...simulateur, disponibilite: async () => ({ ok: false as const, panne: 'erreur_serveur' as const }) } };
  const converser = (...messages: string[]) =>
    repondreChatbot(ConversationChatbot.parse({ messages: messages.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content })) }), enPanne);

  it('après une vérification impossible, les questions suivantes repartent sur le catalogue (conversation rejouée)', async () => {
    const histo: string[] = [];
    const tour = async (question: string) => {
      histo.push(question);
      const r = await converser(...histo);
      histo.push(r.texte);
      return r;
    };
    expect((await tour('Où dormir à Lyon ?')).prestations.map((c) => c.nom)).toEqual(['Hôtel des Lumières']);
    expect((await tour('Libre le 31 octobre pour 2 ?')).verification).toBe('non_verifie'); // le simulateur est en panne
    for (const [question, nom] of [
      ['Où dormir à Lyon ?', 'Hôtel des Lumières'],
      ['Ou dormir a Nantes', 'Hôtel des Machines'],
      ['que faire a lyon', 'Enquête des traboules'],
    ] as const) {
      const r = await tour(question);
      expect(r.verification, question).toBeNull(); // pas de nouvelle vérification au 31 octobre
      expect(r.texte, question).not.toMatch(/rien de vérifié/);
      expect(r.prestations.map((c) => c.nom), question).toContain(nom);
    }
  });

  it('« Et le 25 novembre ? » après un échec : la ville la plus récente (Nantes, pas Lyon) et les voyageurs d’avant', async () => {
    const appels: { prestation_id: string; date: string; participants: number }[] = [];
    const espion = { ...enPanne, prestataires: { ...enPanne.prestataires, disponibilite: async (l: { prestation_id: string; date: string; participants: number }) => (appels.push(l), { ok: false as const, panne: 'erreur_serveur' as const }) } };
    const histo: string[] = [];
    for (const question of ['Que faire à Nantes ?', 'Libre le 31 octobre pour 2 ?', 'Et à Lyon ?', 'Libre le 31 octobre pour 2 ?', 'Que faire a Nantes ?', 'Libre le 31 octobre pour 2 ?', 'Et le 25 novembre ?']) {
      histo.push(question);
      const r = await repondreChatbot(ConversationChatbot.parse({ messages: histo.map((content, i) => ({ role: i % 2 ? 'assistant' : 'user', content })) }), espion);
      histo.push(r.texte);
    }
    // la dernière question vérifie l'atelier de Nantes le 25 novembre, pour 2 (ici le simulateur est en panne)
    expect(appels.at(-1)).toEqual({ prestation_id: 'activite-nantes-01', date: '2026-11-25', participants: 2 });
    expect(histo.at(-1)).toMatch(/rien de vérifié/);
  });

  it('« oublie les dates » : plus de vérification avec la date d’avant', async () => {
    const premiere = await demander('Un atelier à Nantes le 7 novembre pour deux ?');
    expect(premiere.verification).toBe('disponible');
    const suite = await demander('Un atelier à Nantes le 7 novembre pour deux ?', premiere.texte, 'oublie les dates dis moi que faire à Nantes');
    expect(suite.verification).toBeNull();
    expect(suite.prestations.map((c) => c.nom)).toContain('Atelier de machines imaginaires');
    const ensuite = await demander('Un atelier à Nantes le 7 novembre pour deux ?', premiere.texte, 'oublie les dates', suite.texte, 'Où dormir à Nantes ?');
    expect(ensuite.verification).toBeNull();
  });

  it('une vérification réussie garde la date : « Où dormir ? » vérifie l’hôtel le même jour', async () => {
    const premiere = await demander('Un atelier à Nantes le 7 novembre pour deux ?');
    const suite = await demander('Un atelier à Nantes le 7 novembre pour deux ?', premiere.texte, 'Où dormir à Nantes ?');
    expect(suite.verification).toBe('disponible');
    expect(suite.texte).toMatch(/C’est libre : Hôtel des Machines, le samedi 7 novembre, pour 2 personnes/);
  });

  it('reconnaît les façons de dire « oublie les dates »', () => {
    for (const t of ['oublie les dates', 'Oubliez la date', 'sans date', 'peu importe la date', 'pas de date précise', 'laisse les dates']) expect(oublieLesDates(t), t).toBe(true);
    for (const t of ['Libre le 31 octobre pour 2 ?', 'Où dormir à Lyon ?', 'quelles dates sont libres ?']) expect(oublieLesDates(t), t).toBe(false);
  });
});

describe('réponses rapides : le modèle de règles les comprend', () => {
  it('« Et le 14 novembre ? » reprend la ville et le nombre de voyageurs de la conversation', async () => {
    const premiere = await demander('Un atelier à Nantes le 7 novembre pour deux ?');
    const suite = await demander('Un atelier à Nantes le 7 novembre pour deux ?', premiere.texte, 'Et le 14 novembre ?');
    expect(suite.verification).toBe('disponible');
    expect(suite.suggestion).toEqual({ destination: 'Nantes', date_debut: '2026-11-14', voyageurs: 2 });
  });

  it('chaque réponse rapide proposée est une question que les règles traitent seules', async () => {
    const r = await demander('Que faire à Nantes ?');
    for (const relance of r.relances) expect(comprendQuestion(relance, '2026-10-22'), relance).toBe(true);
  });
});

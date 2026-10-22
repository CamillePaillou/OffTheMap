import { describe, expect, it } from 'vitest';
import type { PrestationCatalogue } from '../../ports/prestataires';
import { minimiser, RETIRE } from './minimiser';
import { argsVerifier, filtrerCatalogue } from './outils';
import { contientPrix, PRIX_RETIRE, sansPrix } from './sansPrix';

describe('minimisation des messages du visiteur', () => {
  it.each([
    ['écrivez-moi à lea.martin@example.org merci', RETIRE.email],
    ['mon numéro : 06 12 34 56 78', RETIRE.telephone],
    ['appelez le +33 6 12 34 56 78', RETIRE.telephone],
    ['ma carte 4970 1012 3456 7890', RETIRE.numero],
  ])('retire les coordonnées : « %s »', (texte, marque) => {
    expect(minimiser(texte)).toContain(marque);
    expect(minimiser(texte)).not.toMatch(/\d{2}[\s.]?\d{2}[\s.]?\d{2}[\s.]?\d{2}|@/);
  });

  it.each([
    ['je suis allergique aux noix', 'noix'],
    ['une allergie aux arachides', 'arachides'],
    ['intolérant au gluten', 'gluten'],
    ['ma femme est enceinte', 'enceinte'],
    ['mon fils est diabétique', 'diabétique'],
    ['je suis cœliaque', 'cœliaque'],
  ])('retire les informations de santé : « %s »', (texte, mot) => {
    expect(minimiser(texte)).toContain(RETIRE.sante);
    expect(minimiser(texte)).not.toContain(mot);
  });

  it('retire le nom donné spontanément, garde le reste', () => {
    expect(minimiser('Bonjour, je m’appelle Léa Martin et je veux aller à Nantes')).toBe(`Bonjour, je m’appelle ${RETIRE.nom} et je veux aller à Nantes`);
  });

  it('laisse intacte une question ordinaire (dates, voyageurs, destination)', () => {
    const q = 'Un atelier à Nantes le 7 novembre pour deux ? Ou le 2026-11-14 à 3 personnes, végétariens.';
    expect(minimiser(q)).toBe(q);
  });
});

describe('aucun prix dans les réponses', () => {
  it.each([
    'Le séjour coûte 179 € par personne.',
    'À partir de 148 € / pers., base 2 personnes.',
    'Comptez environ 35,50 euros.',
    'Le train est à € 48.',
    'Total : 358 EUR.',
  ])('retire le montant : « %s »', (texte) => {
    const r = sansPrix(texte);
    expect(r).toContain(PRIX_RETIRE);
    expect(contientPrix(r)).toBe(false);
  });

  it('ne touche ni aux dates, ni aux nombres de voyageurs, ni aux ordinaux', () => {
    const t = 'Disponible le 7 novembre pour 2 personnes ; le 2e jour, balade. Téléphone 02 40 00 00 00.';
    expect(sansPrix(t)).toBe(t);
  });
});

describe('outils du chatbot', () => {
  const CATALOGUE: PrestationCatalogue[] = [
    { id: 'activite-nantes-01', type: 'activite', nom: 'Atelier de machines imaginaires', destination: 'Nantes', prix_unitaire_cents: 3500, capacite: 10, tags: [] },
    { id: 'hotel-nantes-01', type: 'hebergement', nom: 'Hôtel de la gare', destination: 'Nantes', prix_unitaire_cents: 9600, capacite: 8, tags: [] },
    { id: 'activite-lyon-01', type: 'activite', nom: 'Enquête des traboules', destination: 'Lyon', prix_unitaire_cents: 3000, capacite: 12, tags: [] },
  ];

  it('le catalogue vu par le modèle n’a jamais de prix ni de capacité', () => {
    const vu = filtrerCatalogue(CATALOGUE, { destination: 'nantes' });
    expect(vu.map((p) => p.id)).toEqual(['activite-nantes-01', 'hotel-nantes-01']);
    expect(JSON.stringify(vu)).not.toMatch(/prix|cents|capacite|3500|9600/);
  });

  it('filtre par type', () => {
    expect(filtrerCatalogue(CATALOGUE, { type: 'activite' }).map((p) => p.id)).toEqual(['activite-nantes-01', 'activite-lyon-01']);
  });

  const valider = argsVerifier(new Date('2026-10-22T10:00:00Z'));
  it('accepte une vérification bien formée', () => {
    expect(valider.safeParse({ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2 }).success).toBe(true);
  });
  it.each([
    [{ prestation_id: 'activite-nantes-01', date: '2026-10-01', participants: 2 }, 'date passée'],
    [{ prestation_id: 'activite-nantes-01', date: '2026-02-30', participants: 2 }, 'date inexistante'],
    [{ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 21 }, 'plus de 20 participants'],
    [{ prestation_id: 'Activité Nantes', date: '2026-11-07', participants: 2 }, 'identifiant hors format'],
    [{ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2, prix: 1 }, 'champ en trop'],
  ] as [unknown, string][])('refuse %j (%s)', (args, raison) => {
    expect(valider.safeParse(args).success, raison).toBe(false);
  });
});

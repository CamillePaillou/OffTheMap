import { describe, expect, it } from 'vitest';
import { ConclusionVerification } from '../../../types';
import type { TourTrace } from '../../../types';
import { comparerFaits, decrireEcarts } from './comparerFaits';
import type { FaitsServeur } from './comparerFaits';
import { EXPURGE, contientSecret, expurgerTrace } from './expurger';

const serveur: FaitsServeur = { disponible: true, places_restantes: 2, prix_unitaire_cents: 4500 };

const conclusion = (c: Record<string, unknown>) =>
  ConclusionVerification.parse({ statut: 'ok', prix_unitaire_cents: 4500, places_restantes: 2, resume: 'Atelier disponible ce samedi.', ...c });

describe('comparerFaits : les faits de l’agent face au JSON du serveur', () => {
  it('fait faux détecté : 4 places annoncées, le serveur en annonce 2 (scénario de l’issue)', () => {
    const r = comparerFaits(conclusion({ places_restantes: 4 }), serveur);
    expect(r.valide).toBe(false);
    expect(r.ecarts).toEqual([{ champ: 'places_restantes', annonce: 4, serveur: 2 }]);
  });

  it('fait exact validé', () => {
    expect(comparerFaits(conclusion({}), serveur)).toEqual({ valide: true, ecarts: [] });
  });

  it('prix faux détecté, même d’un centime', () => {
    const r = comparerFaits(conclusion({ prix_unitaire_cents: 4501 }), serveur);
    expect(r.ecarts).toEqual([{ champ: 'prix_unitaire_cents', annonce: 4501, serveur: 4500 }]);
  });

  it('statut contraire au serveur détecté dans les deux sens', () => {
    expect(comparerFaits(conclusion({ statut: 'indisponible' }), serveur).ecarts)
      .toEqual([{ champ: 'statut', annonce: 'indisponible', serveur: 'ok' }]);
    expect(comparerFaits(conclusion({}), { ...serveur, disponible: false }).ecarts)
      .toEqual([{ champ: 'statut', annonce: 'ok', serveur: 'indisponible' }]);
  });

  it('indisponible exact validé', () => {
    const r = comparerFaits(conclusion({ statut: 'indisponible', places_restantes: 0 }), { ...serveur, disponible: false, places_restantes: 0 });
    expect(r.valide).toBe(true);
  });

  it('plusieurs écarts signalés ensemble', () => {
    const r = comparerFaits(conclusion({ places_restantes: 4, prix_unitaire_cents: 3900 }), serveur);
    expect(r.ecarts.map((e) => e.champ)).toEqual(['places_restantes', 'prix_unitaire_cents']);
  });

  it('des faits sans aucune réponse du serveur sont rejetés', () => {
    const r = comparerFaits(conclusion({}), null);
    expect(r).toEqual({ valide: false, ecarts: [{ champ: 'reponse_serveur', annonce: 'ok', serveur: null }] });
  });

  it('un échec n’annonce rien : rien à contredire', () => {
    const echec = ConclusionVerification.parse({
      statut: 'echec', prix_unitaire_cents: null, places_restantes: null, raison: 'delai', resume: 'Serveur trop lent, non vérifié.',
    });
    expect(comparerFaits(echec, null).valide).toBe(true);
    expect(comparerFaits(echec, serveur).valide).toBe(true);
  });

  it('decrireEcarts donne une raison lisible pour la trace', () => {
    expect(decrireEcarts([{ champ: 'places_restantes', annonce: 4, serveur: 2 }]))
      .toBe('conclusion rejetée : places_restantes annoncé 4, serveur 2');
    expect(decrireEcarts([{ champ: 'reponse_serveur', annonce: 'ok', serveur: null }]))
      .toBe('conclusion rejetée : reponse_serveur annoncé ok, serveur aucune réponse');
  });
});

// ------------------------------------------------------------------ trace

const CLE_EQUIPE = 'equipe-7f3a9c2e41';
const CLE_OPENROUTER = 'sk-or-v1-0123456789abcdef0123456789abcdef';
const CLE_APPROBATION = 'appro-55d1e0b7c9';

const reponseSimulateur = {
  prestation_id: 'atelier-serigraphie-nantes', date: '2026-11-07', participants: 2, disponible: true,
  places_restantes: 2, prix_unitaire_eur: 45, prix_total_eur: 90, devise: 'EUR', simulation: true,
};

const tourAppel = (surcharge: Partial<TourTrace> = {}): TourTrace => ({
  numero: 1,
  horodatage: '2026-11-02T09:15:00.000+01:00',
  appel: { nom: 'verifier_disponibilite', arguments: { prestation_id: 'atelier-serigraphie-nantes', date: '2026-11-07', participants: 2 } },
  conclusion: null,
  decision: { statut: 'accepte', raison: null, ecarts: [] },
  http_statut: 200,
  reponse_simulateur: reponseSimulateur,
  duree_ms: 312,
  ...surcharge,
});

/** Tour de conclusion construit comme le fera la boucle (E8.3) : comparaison, puis décision. */
const tourConclusion = (annonce: Record<string, unknown>): TourTrace => {
  const brute = { statut: 'ok', prix_unitaire_cents: 4500, places_restantes: 2, resume: 'Atelier disponible ce samedi.', ...annonce };
  const r = comparerFaits(ConclusionVerification.parse(brute), serveur);
  return {
    numero: 2,
    horodatage: '2026-11-02T09:15:01.000+01:00',
    appel: null,
    conclusion: brute,
    decision: r.valide
      ? { statut: 'accepte', raison: null, ecarts: [] }
      : { statut: 'refuse', raison: decrireEcarts(r.ecarts), ecarts: r.ecarts },
    http_statut: null,
    reponse_simulateur: null,
    duree_ms: 840,
  };
};

const secrets = [CLE_EQUIPE, CLE_OPENROUTER, CLE_APPROBATION];

describe('expurgerTrace : une trace relisible, sans clé ni donnée sensible', () => {
  it('une trace propre est conservée telle quelle (relisible)', () => {
    const trace = [tourAppel(), tourConclusion({})];
    expect(expurgerTrace(trace, secrets)).toEqual(trace);
    expect(contientSecret(trace, secrets)).toBe(false);
  });

  it('une conclusion rejetée garde ses faits faux et ses écarts structurés dans la trace', () => {
    const [, tour] = expurgerTrace([tourAppel(), tourConclusion({ places_restantes: 4 })], secrets);
    expect(tour.conclusion).toMatchObject({ places_restantes: 4 });
    expect(tour.decision).toEqual({
      statut: 'refuse',
      raison: 'conclusion rejetée : places_restantes annoncé 4, serveur 2',
      ecarts: [{ champ: 'places_restantes', annonce: 4, serveur: 2 }],
    });
  });

  it('un écart hors contrat est refusé', () => {
    const t = tourConclusion({ places_restantes: 4 });
    const faux = { ...t, decision: { ...t.decision, ecarts: [{ champ: 'budget', annonce: 1, serveur: 2 }] } };
    expect(() => expurgerTrace([faux])).toThrow();
  });

  it('les valeurs exactes des clés du programme sont masquées, où qu’elles soient', () => {
    const trace = [tourAppel({
      decision: { statut: 'refuse', raison: `en-tête envoyé avec ${CLE_EQUIPE}`, ecarts: [] },
      reponse_simulateur: { erreur: { code: 'internal_error', message: `approbation ${CLE_APPROBATION} invalide` } },
    })];
    expect(contientSecret(trace, secrets)).toBe(true);
    const propre = expurgerTrace(trace, secrets);
    expect(contientSecret(propre, secrets)).toBe(false);
    expect(propre[0].decision.raison).toBe(`en-tête envoyé avec ${EXPURGE}`);
  });

  it('une clé glissée par le modèle dans les arguments est masquée par son nom de champ', () => {
    const trace = [tourAppel({
      appel: { nom: 'poser_option', arguments: { prestation_id: 'atelier-serigraphie-nantes', 'X-Approval-Key': 'nimporte', approvalKey: 'quoi' } },
      decision: { statut: 'refuse', raison: 'outil non autorisé', ecarts: [] },
      http_statut: null,
      reponse_simulateur: null,
    })];
    const args = expurgerTrace(trace)[0].appel!.arguments;
    expect(args['X-Approval-Key']).toBe(EXPURGE);
    expect(args.approvalKey).toBe(EXPURGE);
    expect(args.prestation_id).toBe('atelier-serigraphie-nantes');
  });

  it('un texte qui imite une clé est masqué même s’il n’est pas connu (X01)', () => {
    const trace = [tourAppel({
      decision: { statut: 'refuse', raison: 'le modèle a écrit sk-or-v1-fausseclefabriquee42 et Bearer abcdefgh12345', ecarts: [] },
    })];
    const propre = expurgerTrace(trace);
    expect(propre[0].decision.raison).toBe(`le modèle a écrit ${EXPURGE} et ${EXPURGE}`);
    expect(contientSecret(propre)).toBe(false);
  });

  it('une conclusion qui recopie une clé est masquée, le reste de la preuve est intact', () => {
    const tour = { ...tourConclusion({}), conclusion: { statut: 'ok', resume: `clé ${CLE_OPENROUTER}`, contact: 'atelier@example.org' } };
    const [propre] = expurgerTrace([tour], secrets);
    expect(propre.conclusion).toEqual({ statut: 'ok', resume: `clé ${EXPURGE}`, contact: 'atelier@example.org' });
  });

  it('les dates, identifiants et montants de la réponse du serveur ne sont pas abîmés', () => {
    expect(expurgerTrace([tourAppel()], secrets)[0].reponse_simulateur).toEqual(reponseSimulateur);
  });

  it('un champ hors contrat est refusé, pas recopié', () => {
    expect(() => expurgerTrace([{ ...tourAppel(), en_tetes: { 'x-team-key': CLE_EQUIPE } }])).toThrow();
  });

  it('plus de 3 tours est refusé', () => {
    const t = tourAppel();
    expect(() => expurgerTrace([t, { ...t, numero: 2 }, { ...t, numero: 3 }, { ...t, numero: 3 }])).toThrow();
  });

  it('un secret trop court ou absent de l’environnement est ignoré sans tout masquer', () => {
    const trace = [tourAppel()];
    expect(expurgerTrace(trace, [undefined, '', '2'])).toEqual(trace);
  });
});

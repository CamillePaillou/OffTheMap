import { describe, expect, it } from 'vitest';
import enregistrements from '../../../fixtures/rejeu/agent.json';
import { TraceVerification } from '../../../types/trace';
import { verifierPrestation, type LigneAVerifier } from '../../application/verifierPrestation';
import { choisirEnregistrement, estRejeu, messagesDuModele, type EnregistrementAgent } from '../../domain/verification/rejeu';
import type { Disponibilite, LigneDemandee } from '../../ports/prestataires';
import { modeAgent } from './index';
import { ModeleRejeu } from './modele-rejeu';

// E11.3 : rejouer une vérification enregistrée avec un vrai modèle (campagne E11.2 v3, cas N01), sans appel réseau.
const BRUT = enregistrements[0]!;
const ENREGISTREMENT: EnregistrementAgent = { ...BRUT, trace: TraceVerification.parse(BRUT.trace) };
const LIGNE: LigneAVerifier = { ...ENREGISTREMENT.ligne, nom: 'Atelier de machines imaginaires' };
const DISPO: Disponibilite = { ...ENREGISTREMENT.ligne, disponible: true, places_restantes: 10, prix_unitaire_cents: 3500, prix_total_cents: 7000 };

function simulateur(dispo: Disponibilite) {
  const appels: LigneDemandee[] = [];
  return { appels, disponibilite: async (l: LigneDemandee) => (appels.push(l), { ok: true as const, valeur: dispo }) };
}
const verifier = (modele: ModeleRejeu, prestataires: ReturnType<typeof simulateur>) =>
  verifierPrestation(LIGNE, { modele, prestataires, secrets: [] });

describe('mode rejeu de l’agent (E11.3)', () => {
  it('l’enregistrement vient d’un vrai modèle gratuit : un appel d’outil, puis la conclusion', () => {
    expect(ENREGISTREMENT.modele).toMatch(/:free$/);
    const messages = messagesDuModele(ENREGISTREMENT.trace);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.tool_calls?.[0]?.function.name).toBe('verifier_disponibilite');
    expect(JSON.parse(messages[1]!.content!)).toMatchObject({ statut: 'ok', prix_unitaire_cents: 3500 });
  });

  it('rejoue la boucle sans OpenRouter : le simulateur est appelé en direct, l’écran sait que c’est un rejeu', async () => {
    const prestataires = simulateur(DISPO);
    const r = await verifier(new ModeleRejeu(ENREGISTREMENT), prestataires);
    expect(r).toMatchObject({ statut: 'ok', arret: 'conclusion', nb_tours: 2, prix_unitaire_cents: 3500, places_restantes: 10 });
    expect(r.modele).toBe(`rejeu de ${ENREGISTREMENT.modele}`);
    expect(estRejeu(r.modele)).toBe(true);
    expect(prestataires.appels).toEqual([ENREGISTREMENT.ligne]);
  });

  it('les contrôles du programme restent actifs : un prix qui a changé chez le prestataire fait refuser la conclusion rejouée', async () => {
    const r = await verifier(new ModeleRejeu(ENREGISTREMENT), simulateur({ ...DISPO, prix_unitaire_cents: 4000, prix_total_cents: 8000 }));
    expect(r).toMatchObject({ statut: 'echec', arret: 'reponse_invalide', prix_unitaire_cents: null });
    expect(r.trace.at(-1)!.decision.ecarts.map((e) => e.champ)).toContain('prix_unitaire_cents');
  });

  it('enregistrement épuisé : arrêt « non vérifié », sans prix', async () => {
    const court: EnregistrementAgent = { ...ENREGISTREMENT, trace: ENREGISTREMENT.trace.slice(0, 1) };
    const r = await verifier(new ModeleRejeu(court), simulateur(DISPO));
    expect(r).toMatchObject({ statut: 'echec', arret: 'echec_serveur', prix_unitaire_cents: null });
  });

  it('ne rejoue que la même ligne, un vrai modèle, le plus récent ; jamais un rejeu ni les données du seed', () => {
    const autre = (modifs: Partial<EnregistrementAgent>): EnregistrementAgent => ({ ...ENREGISTREMENT, ...modifs });
    const cible = ENREGISTREMENT.ligne;
    expect(choisirEnregistrement({ ...cible, date: '2026-11-14' }, [ENREGISTREMENT])).toBeNull();
    expect(choisirEnregistrement({ ...cible, participants: 4 }, [ENREGISTREMENT])).toBeNull();
    expect(choisirEnregistrement(cible, [autre({ modele: 'modele-de-demo' })])).toBeNull();
    expect(choisirEnregistrement(cible, [autre({ modele: `rejeu de ${ENREGISTREMENT.modele}` })])).toBeNull();
    const recent = autre({ enregistre_le: '2026-10-23T08:00:00.000Z', source: 'base' });
    expect(choisirEnregistrement(cible, [ENREGISTREMENT, recent])?.source).toBe('base');
  });

  it('AGENT_MODE : réel par défaut, rejeu seulement s’il est demandé, toute autre valeur refusée', () => {
    expect(modeAgent({})).toBe('reel');
    expect(modeAgent({ AGENT_MODE: 'rejeu' })).toBe('rejeu');
    expect(() => modeAgent({ AGENT_MODE: 'replay' })).toThrow(/inconnu/);
  });
});

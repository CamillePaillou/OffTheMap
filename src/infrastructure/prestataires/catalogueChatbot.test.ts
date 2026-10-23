import { describe, expect, it } from 'vitest';
import type { PrestationCatalogue } from '../../ports/prestataires';
import { catalogueAvecSecours } from './catalogueChatbot';

const SIMULATEUR: PrestationCatalogue[] = [
  { id: 'activite-lyon-01', type: 'activite', nom: 'Enquête des traboules', destination: 'Lyon', prix_unitaire_cents: 2900, capacite: 12, tags: ['jeu'] },
];
const AGENCE = [{ id: 'activite-lille-01', type: 'activite' as const, nom: 'Fabrique de gaufres', destination: 'Lille', tags: ['cuisine'] }];
const secours = async () => ({ ok: true as const, valeur: AGENCE });

describe('catalogue du chatbot (E1.3)', () => {
  it('lit le simulateur et retire prix et capacité avant de les passer au chatbot', async () => {
    const r = await catalogueAvecSecours(async () => ({ ok: true, valeur: SIMULATEUR }), secours)();
    expect(r).toEqual({ ok: true, valeur: [{ id: 'activite-lyon-01', type: 'activite', nom: 'Enquête des traboules', destination: 'Lyon', tags: ['jeu'] }] });
    expect(JSON.stringify(r)).not.toMatch(/prix|capacite|2900/);
  });

  it('sans clé d’équipe ou si le simulateur est en panne : le catalogue importé par l’agence', async () => {
    expect(await catalogueAvecSecours(null, secours)()).toEqual({ ok: true, valeur: AGENCE });
    expect(await catalogueAvecSecours(async () => ({ ok: false, panne: 'delai' }), secours)()).toEqual({ ok: true, valeur: AGENCE });
    expect(await catalogueAvecSecours(async () => ({ ok: true, valeur: [] }), secours)()).toEqual({ ok: true, valeur: AGENCE });
  });

  it('si les deux sources manquent, la panne remonte (le chatbot dit qu’il n’a rien pu vérifier)', async () => {
    const r = await catalogueAvecSecours(null, async () => ({ ok: false, panne: 'erreur_serveur' }))();
    expect(r.ok).toBe(false);
  });
});

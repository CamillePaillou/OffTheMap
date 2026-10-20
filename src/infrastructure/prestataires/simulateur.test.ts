import { describe, expect, it, vi } from 'vitest';
import { creerPrestataires, PrestatairesSimulateur } from './simulateur';

const json = (corps: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));

const dispoJson = {
  prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2, disponible: true,
  places_restantes: 8, prix_unitaire_eur: 45, prix_total_eur: 90, devise: 'EUR', simulation: true,
};
const ligne = { prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2 };

const adaptateur = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof PrestatairesSimulateur>[0]> = {}) =>
  new PrestatairesSimulateur({ baseUrl: 'http://simulateur:8765', cleEquipe: 'cle-test', delaiMs: 50, fetchImpl, ...extra });

describe('adaptateur du simulateur', () => {
  it('envoie la clé d’équipe et convertit les euros en centimes', async () => {
    const f = vi.fn(() => json(dispoJson));
    const r = await adaptateur(f as unknown as typeof fetch).disponibilite(ligne);
    expect(r).toEqual({ ok: true, valeur: expect.objectContaining({ prix_unitaire_cents: 4500, prix_total_cents: 9000, places_restantes: 8 }) });
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain('/api/v1/disponibilites?prestation_id=train-nantes-01&date=2026-11-07&participants=2');
    expect((init.headers as Record<string, string>)['X-Team-Key']).toBe('cle-test');
  });

  it('rend le refus du simulateur avec son code', async () => {
    const f = vi.fn(() => json({ erreur: { code: 'prestation_not_found', message: 'inconnue' } }, 404));
    const r = await adaptateur(f as unknown as typeof fetch).disponibilite(ligne);
    expect(r).toEqual({ ok: false, panne: 'refus', code: 'prestation_not_found', message: 'inconnue', http: 404 });
  });

  it('erreur 500 du simulateur : panne erreur_serveur, aucun prix', async () => {
    const f = vi.fn(() => json({ erreur: { code: 'internal_error', message: 'boom' } }, 500));
    expect(await adaptateur(f as unknown as typeof fetch).disponibilite(ligne)).toEqual({ ok: false, panne: 'erreur_serveur' });
  });

  it('réponse non conforme : panne reponse_invalide', async () => {
    const f = vi.fn(() => json({ ...dispoJson, prix_unitaire_eur: 'gratuit' }));
    expect(await adaptateur(f as unknown as typeof fetch).disponibilite(ligne)).toEqual({ ok: false, panne: 'reponse_invalide' });
  });

  it('délai dépassé réel : panne delai', async () => {
    const f = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_ok, ko) => {
      init?.signal?.addEventListener('abort', () => ko(Object.assign(new Error('abort'), { name: 'AbortError' })));
    }));
    expect(await adaptateur(f as unknown as typeof fetch).disponibilite(ligne)).toEqual({ ok: false, panne: 'delai' });
  });

  it('coupure réseau : panne erreur_serveur', async () => {
    const f = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    expect(await adaptateur(f as unknown as typeof fetch).disponibilite(ligne)).toEqual({ ok: false, panne: 'erreur_serveur' });
  });
});

describe('pannes injectées (le simulateur ne les produit pas)', () => {
  it('réglage « delai » : erreur explicite, aucun prix, aucune requête', async () => {
    const f = vi.fn();
    const r = await adaptateur(f as unknown as typeof fetch, { panne: 'delai' }).disponibilite(ligne);
    expect(r).toEqual({ ok: false, panne: 'delai' });
    expect(f).not.toHaveBeenCalled();
  });

  it('réglage « erreur_serveur », puis retour à la normale', async () => {
    const f = vi.fn(() => json(dispoJson));
    const a = adaptateur(f as unknown as typeof fetch, { panne: 'erreur_serveur' });
    expect(await a.disponibilite(ligne)).toEqual({ ok: false, panne: 'erreur_serveur' });
    a.panne = 'aucune';
    expect((await a.disponibilite(ligne)).ok).toBe(true);
  });
});

describe('écritures', () => {
  it('pose une option et la rend en centimes', async () => {
    const f = vi.fn(() => json({ option: {
      id: 'opt_1', prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2, prix_total_eur: 90,
      statut: 'active', expire_le: '2026-11-07T10:30:00+00:00', simulation: true,
    } }, 201));
    const r = await adaptateur(f as unknown as typeof fetch).poserOption(ligne);
    expect(r).toEqual({ ok: true, valeur: expect.objectContaining({ option_id: 'opt_1', prix_total_cents: 9000 }) });
  });

  it('confirme avec X-Approval-Key et le nom du conseiller', async () => {
    const f = vi.fn(() => json({ reservation: {
      id: 'res_1', option_id: 'opt_1', prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2,
      prix_total_eur: 90, statut: 'confirmee', approuve_par: 'Camille', confirmee_le: '2026-11-07T10:00:00+00:00', simulation: true,
    } }, 201));
    const r = await adaptateur(f as unknown as typeof fetch).confirmerReservation({ option_id: 'opt_1', cle_approbation: 'cle-humaine', approuve_par: 'Camille' });
    expect(r.ok).toBe(true);
    const [, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>)['X-Approval-Key']).toBe('cle-humaine');
    expect(JSON.parse(String(init.body))).toEqual({ option_id: 'opt_1', approuve_par: 'Camille' });
  });
});

describe('annulation et refus d’approbation', () => {
  it('annule sans corps, avec la clé d’approbation', async () => {
    const f = vi.fn(() => json({ reservation: {
      id: 'res_1', option_id: 'opt_1', prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2,
      prix_total_eur: 90, statut: 'annulee', approuve_par: 'Camille', confirmee_le: '2026-11-07T10:00:00+00:00',
      annulee_le: '2026-11-07T11:00:00+00:00', simulation: true,
    } }));
    const r = await adaptateur(f as unknown as typeof fetch).annulerReservation({ reservation_id: 'res_1', cle_approbation: 'cle-humaine', approuve_par: 'Camille' });
    expect(r).toEqual({ ok: true, valeur: expect.objectContaining({ statut: 'annulee' }) });
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain('/api/v1/reservations/res_1/annuler');
    expect(init.body).toBeUndefined();
  });

  it('mauvaise clé d’approbation : refus human_approval_required', async () => {
    const f = vi.fn(() => json({ erreur: { code: 'human_approval_required', message: 'clé refusée' } }, 403));
    const r = await adaptateur(f as unknown as typeof fetch).confirmerReservation({ option_id: 'opt_1', cle_approbation: 'mauvaise', approuve_par: 'Camille' });
    expect(r).toMatchObject({ ok: false, panne: 'refus', code: 'human_approval_required', http: 403 });
  });
});

describe('creerPrestataires', () => {
  it('refuse de démarrer sans clé d’équipe', () => {
    expect(() => creerPrestataires({})).toThrowError(/SIMULATEUR_TEAM_KEY/);
  });
  it('refuse une panne inconnue', () => {
    expect(() => creerPrestataires({ SIMULATEUR_TEAM_KEY: 'k', SIMULATEUR_PANNE: 'foudre' })).toThrowError(/invalide/);
  });
  it('se construit avec une clé', () => {
    expect(creerPrestataires({ SIMULATEUR_TEAM_KEY: 'k' })).toBeInstanceOf(PrestatairesSimulateur);
  });
});

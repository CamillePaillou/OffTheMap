import { describe, expect, it } from 'vitest';
import type { PrestationDuCatalogue } from '../domain/brouillon/prestationsAutorisees';
import type { ResultatBrouillon } from '../ports/generationBrouillon';
import { VersionModifieeErreur, type VersionEnvoyee, type VersionsRepository } from '../ports/versions';
import { demanderChangement } from './changementClient';

const prestation = (id: string, type: PrestationDuCatalogue['type'], prix: number, surcharge: Partial<PrestationDuCatalogue> = {}): PrestationDuCatalogue =>
  ({ id, type, nom: id, destination: 'Nantes', prix_unitaire_cents: prix, capacite: 10, actif: true, ...surcharge });

const envoyee = (surcharge: Partial<VersionEnvoyee> = {}): VersionEnvoyee => ({
  statut: 'envoyee',
  programme: [{ date: '2026-11-07', titre: 'Arrivée', texte: 'Train, atelier, hôtel.' }],
  lignes: [
    { prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2, statut: 'confirme', prestation: prestation('train-nantes-01', 'transport', 4800) },
    // le catalogue a changé depuis l'envoi : 96 € → 99 €
    { prestation_id: 'hotel-nantes-01', date: '2026-11-07', participants: 2, statut: 'confirme', prestation: prestation('hotel-nantes-01', 'hebergement', 9900) },
    { prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2, statut: 'indisponible', prestation: prestation('activite-nantes-01', 'activite', 3500) },
  ],
  reference: { voyageurs: 2, date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_reference_cents: 40000 },
  ...surcharge,
});

class VersionsEnMemoire implements VersionsRepository {
  creee: { motif: string; resultat: Exclude<ResultatBrouillon, { erreur: string }> } | null = null;
  constructor(private readonly v: VersionEnvoyee | null = envoyee(), private readonly concurrente = false) {}
  async lireVersionEnvoyee() {
    return this.v;
  }
  async creerVersionSuivante(_id: string, _c: string, motif: string, resultat: Exclude<ResultatBrouillon, { erreur: string }>) {
    if (this.concurrente) throw new VersionModifieeErreur('déjà remplacée');
    this.creee = { motif, resultat };
    return 'v2';
  }
}

const demande = { propositionId: 'v1', conseillerId: 'c1', motif: '  Deux nuits au lieu d’une  ' };

describe('changement demandé par le client (E6.1)', () => {
  it('version suivante : lignes retenues reprises au prix actuel du catalogue, sans prix confirmé ; total recalculé', async () => {
    const repo = new VersionsEnMemoire();
    expect(await demanderChangement(repo, demande)).toEqual({ ok: true, versionSuivanteId: 'v2' });

    const r = repo.creee!.resultat;
    expect(repo.creee!.motif).toBe('Deux nuits au lieu d’une');
    expect(r.lignes.map((l) => [l.prestation_id, l.prix_unitaire_catalogue_cents])).toEqual([['train-nantes-01', 4800], ['hotel-nantes-01', 9900]]);
    expect(r.total_cents).toBe((4800 + 9900) * 2);
    expect(r.programme).toEqual(envoyee().programme);
    expect(new Set(r.lignes.map((l) => l.id)).size).toBe(2); // nouvelles lignes : la version envoyée garde les siennes
  });

  it('la version envoyée n’est pas modifiée par le cas d’usage', async () => {
    const v1 = envoyee();
    const avant = structuredClone(v1);
    await demanderChangement(new VersionsEnMemoire(v1), demande);
    expect(v1).toEqual(avant);
  });

  it('alertes recalculées sur la nouvelle version', async () => {
    const repo = new VersionsEnMemoire(envoyee({ reference: { voyageurs: 2, date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_reference_cents: 25000 } }));
    await demanderChangement(repo, demande);
    expect(repo.creee!.resultat.alertes.map((a) => a.code)).toEqual(['budget_depasse']);
  });

  it.each([
    ['sans motif', { ...demande, motif: '   ' }, 'motif_invalide'],
    ['motif trop long', { ...demande, motif: 'x'.repeat(1001) }, 'motif_invalide'],
  ])('refuse %s, sans rien créer', async (_cas, d, raison) => {
    const repo = new VersionsEnMemoire();
    expect(await demanderChangement(repo, d)).toMatchObject({ ok: false, raison });
    expect(repo.creee).toBeNull();
  });

  it.each(['prete', 'acceptee', 'remplacee', 'a_verifier'] as const)('refuse depuis le statut %s', async (statut) => {
    const repo = new VersionsEnMemoire(envoyee({ statut }));
    expect(await demanderChangement(repo, demande)).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(repo.creee).toBeNull();
  });

  it('proposition introuvable, ou déjà remplacée par un autre clic', async () => {
    expect(await demanderChangement(new VersionsEnMemoire(null), demande)).toEqual({ ok: false, raison: 'introuvable' });
    expect(await demanderChangement(new VersionsEnMemoire(envoyee(), true), demande)).toEqual({ ok: false, raison: 'statut_modifie' });
  });
});

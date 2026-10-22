import { beforeEach, describe, expect, it } from 'vitest';
import type { VersionDemande } from '../ports/corrections';
import { CorrectionsEnMemoire } from '../infrastructure/db/correctionsEnMemoire';
import { StatutsEnMemoire } from '../infrastructure/db/statutsEnMemoire';
import { TriEnMemoire } from '../infrastructure/db/triEnMemoire';
import { envoyerLienCorrection, trierACorriger, trierDossier } from './trierDossier';

const D = 'd1';
const ALICE = 'alice';
const MAINTENANT = new Date('2026-10-20T10:00:00+02:00');
const NINA: VersionDemande = {
  nom: 'Nina Moreau', email: 'nina@example.org', destination: 'Nantes', date_debut: '2026-11-07', date_fin: '2026-11-08',
  nb_nuits: 1, voyageurs: ['adulte', 'adulte'], budget_annonce_cents: 15000, envies: null, contraintes: null, regimes: [], mobilite: null, prestations_souhaitees: [],
};

let statuts: StatutsEnMemoire;
let tri: TriEnMemoire;
let corrections: CorrectionsEnMemoire;

/** Les corrections en mémoire tiennent leur propre statut : on les aligne sur le tri. */
function aligner() {
  const statut = statuts.dossiers.get(D)!.statut;
  if (!corrections.dossiers.has(D)) corrections.ajouterDossier(D, NINA, statut);
  corrections.dossiers.get(D)!.statut = statut;
}

beforeEach(() => {
  statuts = new StatutsEnMemoire();
  statuts.dossiers.set(D, { statut: 'fiche_prete' });
  tri = new TriEnMemoire(statuts);
  tri.fiches.set(D, { decision: null });
  corrections = new CorrectionsEnMemoire(() => MAINTENANT);
  corrections.ajouterDossier(D, NINA, 'fiche_prete');
});

const entreeCorrection = { dossierId: D, conseillerId: ALICE, champs: ['budget'], motif: 'Budget trop court', commentaires: { budget: 'Comptez 290 € à deux' } };

/** trierACorriger avec des corrections qui voient le nouveau statut au moment de créer le lien. */
async function aCorriger(entree: Record<string, unknown> = entreeCorrection) {
  const avant = tri.trier.bind(tri);
  tri.trier = async (e) => { await avant(e); aligner(); };
  return trierACorriger(tri, corrections, entree as never, MAINTENANT);
}

describe('trier une demande (E3.1)', () => {
  it.each(['validee', 'refusee'] as const)('enregistre « %s » : statut, décision sur la fiche, journal avec la décision et le conseiller', async (decision) => {
    expect(await trierDossier(tri, { dossierId: D, decision, conseillerId: ALICE })).toEqual({ ok: true });
    expect(statuts.dossiers.get(D)!.statut).toBe(decision);
    expect(tri.fiches.get(D)!.decision).toBe(decision);
    expect(statuts.historique).toEqual([expect.objectContaining({
      ancien_statut: 'fiche_prete', nouveau_statut: decision, auteur: 'conseiller', auteur_id: ALICE,
      detail: { type: 'statut', cible: 'dossier', ancien: 'fiche_prete', nouveau: decision, decision },
    })]);
  });

  it('refuse un tri avant que la fiche soit prête, sans rien écrire', async () => {
    statuts.dossiers.set(D, { statut: 'fiche_en_cours' });
    expect(await trierDossier(tri, { dossierId: D, decision: 'validee', conseillerId: ALICE })).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(statuts.historique).toHaveLength(0);
    expect(tri.fiches.get(D)!.decision).toBeNull();
  });

  it('permet la validation ou le refus après une correction, pas un second « à corriger » par le tri', async () => {
    statuts.dossiers.set(D, { statut: 'a_corriger' });
    expect(await trierDossier(tri, { dossierId: D, decision: 'a_corriger', conseillerId: ALICE })).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(await trierDossier(tri, { dossierId: D, decision: 'validee', conseillerId: ALICE })).toEqual({ ok: true });
    expect(statuts.historique[0]!.detail).toMatchObject({ ancien: 'a_corriger', decision: 'validee' });
  });

  it('deux conseillers en même temps : un seul tri passe', async () => {
    const [a, b] = await Promise.all([
      trierDossier(tri, { dossierId: D, decision: 'validee', conseillerId: ALICE }),
      trierDossier(tri, { dossierId: D, decision: 'refusee', conseillerId: 'bob' }),
    ]);
    expect([a, b]).toContainEqual({ ok: true });
    expect([a, b]).toContainEqual({ ok: false, raison: 'statut_modifie' });
    expect(statuts.historique).toHaveLength(1);
  });

  it('refuse un dossier inconnu, un dossier sans fiche, un conseiller non identifié', async () => {
    expect(await trierDossier(tri, { dossierId: 'x', decision: 'validee', conseillerId: ALICE })).toEqual({ ok: false, raison: 'introuvable' });
    expect(await trierDossier(tri, { dossierId: D, decision: 'validee', conseillerId: ' ' })).toEqual({ ok: false, raison: 'auteur_non_identifie' });
    tri.fiches.delete(D);
    expect(await trierDossier(tri, { dossierId: D, decision: 'validee', conseillerId: ALICE })).toEqual({ ok: false, raison: 'sans_fiche' });
    expect(statuts.dossiers.get(D)!.statut).toBe('fiche_prete');
  });
});

describe('trier « à corriger » et envoyer le lien au client', () => {
  it('passe le dossier à corriger et crée le lien avec les points, le motif et les commentaires', async () => {
    const r = await aCorriger();
    expect(r).toMatchObject({ ok: true, boucle: 1, expireLe: '2026-10-27T08:00:00.000Z' });
    expect(statuts.dossiers.get(D)!.statut).toBe('a_corriger');
    expect(tri.fiches.get(D)!.decision).toBe('a_corriger');
    expect(corrections.liens[0]).toMatchObject({ champs: ['budget'], motif: 'Budget trop court', commentaires: { budget: 'Comptez 290 € à deux' }, conseillerId: ALICE });
  });

  it('ne trie pas si les points à revoir sont invalides', async () => {
    const r = await aCorriger({ ...entreeCorrection, champs: [], motif: '' });
    expect(r).toMatchObject({ ok: false, erreurs: { champs: expect.any(String), motif: expect.any(String) } });
    expect(statuts.dossiers.get(D)!.statut).toBe('fiche_prete');
  });

  it('ne trie pas « à corriger » quand les deux boucles sont faites', async () => {
    corrections.dossiers.get(D)!.statut = 'a_corriger';
    await envoyerLienCorrection(corrections, entreeCorrection, MAINTENANT);
    await envoyerLienCorrection(corrections, entreeCorrection, MAINTENANT);
    expect(await aCorriger()).toEqual({ ok: false, raison: 'boucles_epuisees' });
    expect(statuts.dossiers.get(D)!.statut).toBe('fiche_prete');
  });

  it('renvoie un lien depuis un dossier déjà à corriger, et compte les boucles', async () => {
    await aCorriger();
    expect(await corrections.boucles(D)).toEqual({ faites: 1, lienOuvertJusquau: '2026-10-27T08:00:00.000Z' });
    expect(await envoyerLienCorrection(corrections, entreeCorrection, MAINTENANT)).toMatchObject({ ok: true, boucle: 2 });
    expect(await envoyerLienCorrection(corrections, entreeCorrection, MAINTENANT)).toEqual({ ok: false, raison: 'boucles_epuisees' });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireSaisie } from '../../app/demande/lecture';
import {
  CHAMPS_CORRIGEABLES,
  CHAMPS_FORMULAIRE,
  FORMAT_JETON,
  pointsInchanges,
  versValeursFormulaire,
} from '../../types/correction';
import { TRANSITIONS_DOSSIER, trouverTransition } from '../../types/transitions';
import type { VersionDemande } from '../ports/corrections';
import { CorrectionsEnMemoire } from '../infrastructure/db/correctionsEnMemoire';
import { validerSaisie } from './deposerDemande';
import { corrigerDemande, creerJeton, demanderCorrection, empreinteJeton, lireCorrection } from './corrigerDemande';

const AUJOURDHUI = '2026-10-20';
const MAINTENANT = new Date('2026-10-20T10:00:00+02:00');
const DOSSIER = 'd0551e00-0000-4000-8000-000004000000';
const CONSEILLER = '11111111-1111-4111-8111-111111111111';

const NINA: VersionDemande = {
  nom: 'Nina Moreau', email: 'nina@example.org', destination: 'Nantes',
  date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1,
  voyageurs: ['adulte', 'adulte'], budget_annonce_cents: 15000,
  envies: 'Week-end créatif à Nantes, sans voiture', contraintes: 'Pas de voiture',
  regimes: ['vegetarien'], mobilite: null,
};

/** Le formulaire tel que le client le renvoie : prérempli, consentements recochés, quelques champs modifiés. */
function renvoi(modifs: Record<string, string> = {}, sans: string[] = []) {
  const f = new FormData();
  const valeurs = { ...versValeursFormulaire(NINA), consentement_rgpd: 'on', consentement_ia: 'on', ...modifs };
  for (const [k, v] of Object.entries(valeurs)) if (v !== '' && !sans.includes(k)) f.set(k, v);
  return lireSaisie(f);
}

async function preparer(champs: unknown = ['budget'], statut = 'a_corriger', commentaires: unknown = undefined) {
  let horloge = MAINTENANT;
  const repo = new CorrectionsEnMemoire(() => horloge);
  repo.ajouterDossier(DOSSIER, NINA, statut);
  const demande = await demanderCorrection(repo, { dossierId: DOSSIER, conseillerId: CONSEILLER, champs, motif: '  Budget à revoir  ', commentaires }, MAINTENANT);
  return { repo, demande, avancer: (jours: number) => (horloge = new Date(MAINTENANT.getTime() + jours * 86_400_000)) };
}

describe('demander une correction (E1.2)', () => {
  it('crée un jeton aléatoire dont seule l’empreinte est stockée', async () => {
    const { repo, demande } = await preparer();
    expect(demande.ok).toBe(true);
    if (!demande.ok || !('jeton' in demande)) return;
    expect(demande.jeton).toMatch(FORMAT_JETON);
    expect(demande.boucle).toBe(1);
    expect(demande.expireLe).toBe('2026-10-27T08:00:00.000Z');
    expect(repo.liens[0]!.jetonHash).toBe(empreinteJeton(demande.jeton));
    expect(JSON.stringify(repo.liens)).not.toContain(demande.jeton);
    expect(repo.liens[0]!.motif).toBe('Budget à revoir');
    expect(creerJeton()).not.toBe(creerJeton());
  });
  it('refuse un point inconnu ou un motif vide, sans rien écrire', async () => {
    const repo = new CorrectionsEnMemoire();
    repo.ajouterDossier(DOSSIER, NINA);
    const r = await demanderCorrection(repo, { dossierId: DOSSIER, conseillerId: CONSEILLER, champs: ['telephone'], motif: ' ' });
    expect(r).toMatchObject({ ok: false, erreurs: { champs: expect.any(String), motif: expect.any(String) } });
    expect(repo.liens).toHaveLength(0);
  });
  it('garde un petit commentaire par point signalé, sans les vides', async () => {
    const repo = new CorrectionsEnMemoire();
    repo.ajouterDossier(DOSSIER, NINA);
    const r = await demanderCorrection(repo, {
      dossierId: DOSSIER, conseillerId: CONSEILLER, champs: ['budget', 'dates'], motif: 'Budget à revoir',
      commentaires: { budget: '  Comptez au moins 290 € à deux  ', dates: ' ' },
    });
    expect(r.ok).toBe(true);
    expect(repo.liens[0]!.commentaires).toEqual({ budget: 'Comptez au moins 290 € à deux' });
  });
  it('refuse un commentaire sur un point non signalé, ou trop long', async () => {
    const repo = new CorrectionsEnMemoire();
    repo.ajouterDossier(DOSSIER, NINA);
    const entree = { dossierId: DOSSIER, conseillerId: CONSEILLER, champs: ['budget'], motif: 'Budget à revoir' };
    expect(await demanderCorrection(repo, { ...entree, commentaires: { envies: 'Précisez' } })).toMatchObject({ ok: false, erreurs: { commentaires: expect.any(String) } });
    expect(await demanderCorrection(repo, { ...entree, commentaires: { budget: 'x'.repeat(201) } })).toMatchObject({ ok: false, erreurs: { commentaires: expect.any(String) } });
    expect(repo.liens).toHaveLength(0);
  });
  it('refuse un dossier qui n’est pas à corriger', async () => {
    const { demande } = await preparer(['budget'], 'fiche_prete');
    expect(demande).toEqual({ ok: false, refus: 'pas_a_corriger' });
  });
  it('n’autorise que deux boucles par dossier', async () => {
    const { repo } = await preparer();
    const entree = { dossierId: DOSSIER, conseillerId: CONSEILLER, champs: ['envies'], motif: 'Précisez vos envies' };
    expect(await demanderCorrection(repo, entree, MAINTENANT)).toMatchObject({ ok: true, boucle: 2 });
    expect(await demanderCorrection(repo, entree, MAINTENANT)).toEqual({ ok: false, refus: 'boucles_epuisees' });
  });
  it('ferme le lien précédent quand un nouveau est envoyé', async () => {
    const { repo, demande } = await preparer();
    if (!demande.ok || !('jeton' in demande)) throw new Error('demande refusée');
    await demanderCorrection(repo, { dossierId: DOSSIER, conseillerId: CONSEILLER, champs: ['envies'], motif: 'x' }, MAINTENANT);
    expect(await lireCorrection(repo, demande.jeton)).toEqual({ etat: 'expire' });
  });
});

describe('corriger ma demande depuis le lien (E1.2)', () => {
  async function lien(champs: unknown = ['budget'], commentaires?: unknown) {
    const p = await preparer(champs, 'a_corriger', commentaires);
    if (!p.demande.ok || !('jeton' in p.demande)) throw new Error('demande refusée');
    return { ...p, jeton: p.demande.jeton };
  }

  it('ouvre le formulaire prérempli avec les points à revoir', async () => {
    const { repo, jeton } = await lien(['budget', 'dates'], { budget: 'Trop court pour le train et l’hôtel' });
    const l = await lireCorrection(repo, jeton);
    expect(l).toMatchObject({
      etat: 'valide', champs: ['budget', 'dates'], motif: 'Budget à revoir', boucle: 1, demande: NINA,
      commentaires: { budget: 'Trop court pour le train et l’hôtel' },
    });
  });
  it('crée la version suivante et repasse le dossier en fiche_en_cours', async () => {
    const { repo, jeton } = await lien();
    const r = await corrigerDemande(repo, jeton, renvoi({ budget_euros: '450' }), AUJOURDHUI, { confirmeInchanges: false });
    expect(r).toEqual({ ok: true, version: 2, dossierId: DOSSIER });
    const dossier = repo.dossiers.get(DOSSIER)!;
    expect(dossier.statut).toBe('fiche_en_cours');
    expect(dossier.versions.map((v) => [v.version, v.remplacee, v.valeurs.budget_annonce_cents])).toEqual([[1, true, 15000], [2, false, 45000]]);
    expect(repo.journal).toEqual([{ dossierId: DOSSIER, ancien: 'a_corriger', nouveau: 'fiche_en_cours' }]);
  });
  it('emprunte une transition de la matrice (a_corriger → fiche_en_cours, par le système)', () => {
    expect(trouverTransition(TRANSITIONS_DOSSIER, 'a_corriger', 'fiche_en_cours', 'systeme')).not.toBeNull();
    expect(trouverTransition(TRANSITIONS_DOSSIER, 'a_corriger', 'fiche_en_cours', 'conseiller')).toBeNull();
  });
  it('alerte si un point signalé revient inchangé, puis accepte après confirmation', async () => {
    const { repo, jeton } = await lien(['budget', 'dates']);
    const saisie = renvoi({ date_fin: '2026-11-09', nb_nuits: '2' });
    expect(await corrigerDemande(repo, jeton, saisie, AUJOURDHUI, { confirmeInchanges: false })).toEqual({ ok: false, inchanges: ['budget'] });
    expect(repo.dossiers.get(DOSSIER)!.versions).toHaveLength(1);
    expect(await corrigerDemande(repo, jeton, saisie, AUJOURDHUI, { confirmeInchanges: true })).toEqual({ ok: true, version: 2, dossierId: DOSSIER });
  });
  it('ne sert qu’une fois', async () => {
    const { repo, jeton } = await lien();
    await corrigerDemande(repo, jeton, renvoi({ budget_euros: '450' }), AUJOURDHUI, { confirmeInchanges: false });
    expect(await lireCorrection(repo, jeton)).toEqual({ etat: 'utilise' });
    expect(await corrigerDemande(repo, jeton, renvoi({ budget_euros: '500' }), AUJOURDHUI, { confirmeInchanges: false })).toEqual({ ok: false, lien: 'utilise' });
  });
  it('expire au bout de 7 jours', async () => {
    const { repo, jeton, avancer } = await lien();
    avancer(6.9);
    expect((await lireCorrection(repo, jeton)).etat).toBe('valide');
    avancer(7);
    expect(await corrigerDemande(repo, jeton, renvoi({ budget_euros: '450' }), AUJOURDHUI, { confirmeInchanges: false })).toEqual({ ok: false, lien: 'expire' });
  });
  it('est clos si le conseiller a trié le dossier entre-temps', async () => {
    const { repo, jeton } = await lien();
    repo.dossiers.get(DOSSIER)!.statut = 'refusee';
    expect(await lireCorrection(repo, jeton)).toEqual({ etat: 'clos' });
  });
  it('rejette un jeton mal formé sans interroger la base', async () => {
    const { repo } = await lien();
    expect(await lireCorrection(repo, '../../etc/passwd')).toEqual({ etat: 'inconnu' });
    expect(await lireCorrection(repo, creerJeton())).toEqual({ etat: 'inconnu' });
  });
  it('valide la saisie comme au dépôt et redemande les consentements', async () => {
    const { repo, jeton } = await lien();
    const r = await corrigerDemande(repo, jeton, renvoi({ budget_euros: '450' }, ['consentement_ia']), AUJOURDHUI, { confirmeInchanges: false });
    expect(r).toMatchObject({ ok: false, erreurs: { consentement_ia: expect.any(String) } });
    expect(repo.dossiers.get(DOSSIER)!.versions).toHaveLength(1);
  });
});

describe('préremplissage du formulaire', () => {
  it('redonne exactement la version lue : renvoyée telle quelle, tous les points sont inchangés', () => {
    const v = validerSaisie(renvoi(), AUJOURDHUI);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(pointsInchanges(NINA, v.demande, CHAMPS_CORRIGEABLES)).toEqual([...CHAMPS_CORRIGEABLES]);
  });
  it('affiche le commentaire de chaque point dans le formulaire', () => {
    const formulaire = readFileSync(join(__dirname, '../../app/demande/formulaire.tsx'), 'utf8');
    for (const point of CHAMPS_CORRIGEABLES) expect(formulaire, point).toContain(`{note('${point}')}`);
  });
  it('surligne des champs qui existent dans le formulaire', () => {
    const formulaire = readFileSync(join(__dirname, '../../app/demande/formulaire.tsx'), 'utf8');
    for (const noms of Object.values(CHAMPS_FORMULAIRE))
      for (const nom of noms) if (!nom.startsWith('regime_')) expect(formulaire, nom).toContain(`name="${nom}"`);
    expect(formulaire).toContain('name={`regime_${r.id}`}');
  });
});

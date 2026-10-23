import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { schemaSaisieDemande } from '../../types/demande';
import { lireSaisie } from '../../app/demande/lecture';
import { DemandesEnMemoire } from '../infrastructure/db/demandesEnMemoire';
import { deposerDemande } from './deposerDemande';

const AUJOURDHUI = '2026-10-20';

function formulaire(champs: Record<string, string> = {}) {
  const f = new FormData();
  const base: Record<string, string> = {
    nom: 'Inès Martin', email: 'ines@example.org', destination: 'Nantes',
    date_debut: '2026-11-07', date_fin: '2026-11-08',
    adultes: '2', enfants: '0',
    budget_euros: '400', envies: 'Week-end créatif, sans voiture',
    consentement_rgpd: 'on', consentement_ia: 'on',
  };
  for (const [k, v] of Object.entries({ ...base, ...champs })) if (v !== '') f.set(k, v);
  return f;
}

async function deposer(champs?: Record<string, string>) {
  const repo = new DemandesEnMemoire();
  const resultat = await deposerDemande(repo, lireSaisie(formulaire(champs)), AUJOURDHUI);
  return { repo, resultat };
}

describe('déposer une demande (E1.1)', () => {
  it('enregistre une demande valide : dossier nouvelle, version 1, journal', async () => {
    const { repo, resultat } = await deposer();
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(repo.dossiers.get(resultat.depot.dossierId)?.statut).toBe('nouvelle');
    const demande = repo.demandes.get(resultat.depot.demandeId)!;
    expect(demande.version).toBe(1);
    expect(demande.voyageurs).toEqual(['adulte', 'adulte']);
    expect(demande.budget_annonce_cents).toBe(40000);
    expect(repo.historique).toEqual([{ dossier_id: resultat.depot.dossierId, ancien_statut: null, nouveau_statut: 'nouvelle', auteur: 'systeme' }]);
  });

  // Scénario du plan : consentement obligatoire
  it('refuse une demande sans consentement RGPD et n’enregistre rien', async () => {
    const { repo, resultat } = await deposer({ consentement_rgpd: '' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.consentement_rgpd).toBeDefined();
    expect(repo.dossiers.size).toBe(0);
    expect(repo.demandes.size).toBe(0);
  });

  it('refuse une demande sans accord sur l’usage de l’IA', async () => {
    const { repo, resultat } = await deposer({ consentement_ia: '' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs.consentement_ia).toBeDefined();
    expect(repo.demandes.size).toBe(0);
  });

  it.each([
    ['e-mail invalide', { email: 'pas-un-email' }, 'email'],
    ['nom vide', { nom: '' }, 'nom'],
    ['départ passé', { date_debut: '2026-10-01' }, 'date_debut'],
    ['retour avant le départ', { date_fin: '2026-11-06' }, 'date_fin'],
    ['plus de 14 nuits', { date_fin: '2026-11-22' }, 'date_fin'],
    ['aucun adulte', { adultes: '0', enfants: '2' }, 'adultes'],
    ['plus de 20 voyageurs', { adultes: '15', enfants: '6' }, 'enfants'],
    ['nombre d’enfants négatif', { enfants: '-1' }, 'enfants'],
    ['budget négatif', { budget_euros: '-5' }, 'budget_euros'],
  ])('refuse une saisie invalide (%s) avec un message sur le bon champ', async (_cas, champs, attendu) => {
    const { repo, resultat } = await deposer(champs);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.erreurs[attendu]).toBeDefined();
    expect(repo.demandes.size).toBe(0);
  });

  it('calcule les nuits depuis les dates, sans croire une valeur envoyée par le client', async () => {
    const { repo, resultat } = await deposer({ date_debut: '2026-12-20', date_fin: '2026-12-30', nb_nuits: '9' });
    expect(resultat.ok).toBe(true);
    const [demande] = [...repo.demandes.values()];
    expect(demande?.nb_nuits).toBe(10);
  });

  it('accepte une demande sans destination ni budget', async () => {
    const { repo, resultat } = await deposer({ destination: '', budget_euros: '' });
    expect(resultat.ok).toBe(true);
    const [demande] = [...repo.demandes.values()];
    expect(demande?.destination).toBeNull();
    expect(demande?.budget_annonce_cents).toBeNull();
  });

  it('enregistre adultes et enfants, les catégories de régime et la mobilité', async () => {
    const { repo } = await deposer({ enfants: '1', regime_vegetarien: 'on', mobilite_reduite: 'on' });
    const [demande] = [...repo.demandes.values()];
    expect(demande?.voyageurs).toEqual(['adulte', 'adulte', 'enfant']);
    expect(demande?.regimes).toEqual(['vegetarien']);
    expect(demande?.mobilite).toBe('reduite');
  });
});

describe('chaque champ du formulaire a un usage (docs/specs/formulaire-demande.md)', () => {
  const spec = readFileSync(join(__dirname, '../../docs/specs/formulaire-demande.md'), 'utf8');
  const partie = spec.slice(0, spec.indexOf('## Retirés'));
  const documentes = [...partie.matchAll(/^\| ((?:`[a-z_]+`(?:, )?)+) \|/gm)].flatMap((m) => [...m[1]!.matchAll(/`([a-z_]+)`/g)].map((x) => x[1]!));
  it('le schéma et le document listent les mêmes champs', () => {
    const schema = Object.keys(schemaSaisieDemande('2026-01-01').shape);
    expect([...documentes].sort()).toEqual([...schema].sort());
  });
});

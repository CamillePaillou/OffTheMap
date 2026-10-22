import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Passe sécurité (E7.5) : aucune clé dans le dépôt ni dans le code envoyé au navigateur.
// Complète gitleaks (job « secrets » de la CI), qui ne reconnaît que des formats de clés connus.
const racine = resolve(__dirname, '..');
const lire = (fichier: string) => readFileSync(fichier, 'utf8');
const NOM_SECRET = /KEY|SECRET|TOKEN|PASSWORD|SERVICE_ROLE/;

const sources = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
const toutesLesSources = () => ['app', 'lib', 'src', 'types'].flatMap((d) => sources(join(racine, d)));

const directive = (code: string, nom: string) => new RegExp(`^\\s*(?://.*\\n\\s*)*['"]${nom}['"]`).test(code);

const resoudre = (depuis: string, specifiant: string): string | undefined => {
  if (!/^(\.|@\/)/.test(specifiant)) return undefined; // paquet npm : hors périmètre
  const base = specifiant.startsWith('@/') ? join(racine, specifiant.slice(2)) : resolve(depuis, '..', specifiant);
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((s) => base + s).find((f) => existsSync(f) && statSync(f).isFile());
};

/**
 * Fichiers embarqués dans le bundle navigateur à partir d'un composant client : on suit les imports de valeurs.
 * Les imports de types disparaissent à la compilation ; un fichier 'use server' n'envoie au navigateur
 * qu'une référence d'action, on ne le parcourt donc pas.
 */
const grapheClient = (point: string, vus = new Set<string>()): Set<string> => {
  const code = lire(point);
  if (vus.has(point) || directive(code, 'use server')) return vus;
  vus.add(point);
  for (const [, type, specifiant] of code.matchAll(/(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g)) {
    const cible = !type && resoudre(point, specifiant!);
    if (cible) grapheClient(cible, vus);
  }
  return vus;
};
const lectureServeur = (fichier: string) => /process\.env(?!\.NEXT_PUBLIC_)/.test(lire(fichier)) || /['"]server-only['"]/.test(lire(fichier));

describe('aucune clé dans le dépôt', () => {
  it('seul .env.example est versionné parmi les fichiers d’environnement', () => {
    const suivis = execSync('git ls-files', { cwd: racine, encoding: 'utf8' }).split('\n');
    expect(suivis.filter((f) => /(^|\/)\.env/.test(f))).toEqual(['.env.example']);
  });

  it('.env.example ne contient aucune valeur de clé (sauf la clé publique de démonstration du simulateur)', () => {
    const cles = lire(join(racine, '.env.example'))
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m && NOM_SECRET.test(m[1]!));
    expect(cles.length).toBeGreaterThan(0);
    for (const [, nom, valeur] of cles) expect({ nom, valeur }).toEqual({ nom, valeur: nom === 'SIMULATEUR_TEAM_KEY' ? 'demo-key' : '' });
  });
});

describe('aucune clé dans le bundle navigateur', () => {
  it('aucune variable NEXT_PUBLIC_ (inlinée dans le bundle) ne porte une clé secrète', () => {
    const publiques = new Set(toutesLesSources().flatMap((f) => lire(f).match(/NEXT_PUBLIC_[A-Z_]+/g) ?? []));
    // la clé anon de Supabase est publique par conception : la RLS protège les données
    expect([...publiques].filter((n) => NOM_SECRET.test(n) && n !== 'NEXT_PUBLIC_SUPABASE_ANON_KEY')).toEqual([]);
  });

  it('les modules qui lisent une clé serveur sont repérés (contrôle du test suivant)', () => {
    for (const f of ['src/infrastructure/llm/index.ts', 'lib/supabase/service.ts'])
      expect([...grapheClient(join(racine, f))].some(lectureServeur)).toBe(true);
  });

  it('aucun composant client n’importe, même indirectement, un module qui lit une variable serveur', () => {
    const clients = toutesLesSources().filter((f) => directive(lire(f), 'use client'));
    expect(clients.length).toBeGreaterThan(0);
    const fuites = clients.flatMap((c) =>
      [...grapheClient(c)].filter(lectureServeur).map((f) => `${relative(racine, c)} → ${relative(racine, f)}`),
    );
    expect(fuites).toEqual([]);
  });
});

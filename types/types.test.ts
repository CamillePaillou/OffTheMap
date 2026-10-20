import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as E from './enums';
import { ConclusionVerification, FicheIA, schemaBrouillon } from './ia';
import { versDemandePourLLM, type DemandeLue, type DemandePourLLM } from './llm';
import { DisponibiliteSimulateur } from './simulateur';

const dossierMigrations = join(__dirname, '../supabase/migrations');
const migration = readdirSync(dossierMigrations).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(dossierMigrations, f), 'utf8')).join('\n');
const enumSql = (nom: string) => {
  const m = migration.match(new RegExp(`create type ${nom} as enum \\(([^)]*)\\)`));
  if (!m) throw new Error(`enum ${nom} absent des migrations`);
  const ajouts = [...migration.matchAll(new RegExp(`alter type ${nom} add value (?:if not exists )?'([^']+)'`, 'g'))].map((x) => x[1]!);
  const valeurs = [...[...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]!), ...ajouts];
  // renommages (alter type … rename value 'a' to 'b'), dans l'ordre des migrations
  for (const r of migration.matchAll(new RegExp(`alter type ${nom} rename value '([^']+)' to '([^']+)'`, 'g'))) {
    const i = valeurs.indexOf(r[1]!);
    if (i >= 0) valeurs[i] = r[2]!;
  }
  return valeurs;
};

describe('énumérations identiques à la migration', () => {
  const paires: [string, readonly string[]][] = [
    ['statut_dossier', E.STATUTS_DOSSIER], ['decision_tri', E.DECISIONS_TRI],
    ['statut_proposition', E.STATUTS_PROPOSITION], ['statut_ligne', E.STATUTS_LIGNE],
    ['source_prix', E.SOURCES_PRIX], ['type_prestation', E.TYPES_PRESTATION],
    ['statut_verification', E.STATUTS_VERIFICATION], ['arret_agent', E.ARRETS_AGENT],
    ['statut_option', E.STATUTS_OPTION], ['type_evenement', E.TYPES_EVENEMENT],
    ['auteur_evenement', E.AUTEURS_EVENEMENT], ['niveau_physique', E.NIVEAUX_PHYSIQUES],
    ['tranche_age', E.TRANCHES_AGE], ['regime', E.REGIMES], ['mobilite', E.MOBILITES],
  ];
  it.each(paires)('%s', (nom, valeurs) => expect([...valeurs]).toEqual(enumSql(nom)));
});

describe('contrats IA', () => {
  it('refuse un montant dans le texte de la fiche', () => {
    const r = FicheIA.safeParse({ envies: ['atelier à 35 €'], contraintes: [], regimes: [], mobilite: null, niveau_physique: null, points_flous: [] });
    expect(r.success).toBe(false);
  });
  it('refuse que l’IA recopie le budget', () => {
    const r = FicheIA.safeParse({ envies: [], contraintes: [], regimes: [], mobilite: null, niveau_physique: null, points_flous: [], budget_annonce_cents: 40000 });
    expect(r.success).toBe(false);
  });
  const brouillon = schemaBrouillon(['train-nantes-01', 'activite-nantes-01'], 2);
  const base = { programme: [{ date: '2026-11-07', titre: 'Arrivée', texte: 'Train le matin, atelier l’après-midi.' }] };
  it('accepte un brouillon conforme', () => {
    expect(brouillon.safeParse({ ...base, lignes: [{ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2 }] }).success).toBe(true);
  });
  it('refuse une prestation hors de la liste fournie', () => {
    expect(brouillon.safeParse({ ...base, lignes: [{ prestation_id: 'chateau-invente-01', date: '2026-11-07', participants: 2 }] }).success).toBe(false);
  });
  it('refuse un prix dans une ligne', () => {
    expect(brouillon.safeParse({ ...base, lignes: [{ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2, prix: 35 }] }).success).toBe(false);
  });
  it('interdit prix et places quand le simulateur a échoué', () => {
    expect(ConclusionVerification.safeParse({ statut: 'echec', prix_unitaire_cents: 4000, places_restantes: 10, raison: 'delai', resume: 'Délai dépassé.' }).success).toBe(false);
    expect(ConclusionVerification.safeParse({ statut: 'echec', prix_unitaire_cents: null, places_restantes: null, raison: 'delai', resume: 'Délai dépassé.' }).success).toBe(true);
  });
});

describe('minimisation vers le LLM', () => {
  const demande: DemandeLue = {
    nom: 'Inès', email: 'ines@example.org', destination: 'Nantes', date_debut: '2026-11-07', date_fin: '2026-11-08',
    nb_nuits: 1, voyageurs: ['adulte', 'adulte', 'enfant'], budget_annonce_cents: 40000,
    envies: 'créatif, sans voiture', contraintes: null, regimes: ['vegetarien'], mobilite: null,
  };
  it('ne transmet pas l’identité, mais les catégories et la présence d’un enfant', () => {
    const texte = JSON.stringify(versDemandePourLLM(demande));
    for (const interdit of ['Inès', 'ines@example.org']) expect(texte).not.toContain(interdit);
    expect(texte).toContain('vegetarien');
    expect(texte).toContain('enfant');
  });
  it('refuse à la compilation une demande brute vers le LLM', () => {
    const envoyer = (d: DemandePourLLM) => d !== undefined;
    // @ts-expect-error une demande non minimisée ne peut pas partir vers le LLM
    expect(envoyer(demande)).toBe(true);
    expect(envoyer(versDemandePourLLM(demande))).toBe(true);
  });
});

describe('réponse du simulateur', () => {
  it('lit la disponibilité telle que le simulateur la renvoie', () => {
    const r = DisponibiliteSimulateur.safeParse({ prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2, disponible: true,
      places_restantes: 8, prix_unitaire_eur: 48, prix_total_eur: 96, devise: 'EUR', simulation: true });
    expect(r.success).toBe(true);
  });
});

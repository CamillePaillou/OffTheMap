import { describe, expect, it } from 'vitest';
import { PROPOSITION } from '../../fixtures/dashboard';
import { EcartsIA } from '../../types/ia';
import type { Proposition } from '../../types/dashboard';
import { comparerVersions } from '../domain/proposition/ecartsVersions';
import { versEntreeEcarts } from '../domain/proposition/entreeEcarts';
import { FauxLlmClient } from '../infrastructure/llm/fake-llm-client';
import { LlmError } from '../ports/llm-client';
import type { PropositionsLecture, ResumeEcartsEcriture } from '../ports/propositions';
import { empreinteEcarts, resumerEcarts } from './resumeEcarts';

// Exemple connu d'E6.2 (docs/specs/ecarts-versions.md) : v1 à 368 €, v2 avec une nuit d'hôtel en plus et l'atelier au prix catalogue.
const [train, hotel, atelier] = PROPOSITION.lignes;
const v1: Proposition = { ...PROPOSITION, id: '5a1e0000-0000-4000-8000-0000000000f1', version: 1, statut: 'remplacee' };
const v2: Proposition = {
  ...PROPOSITION,
  id: '5a1e0000-0000-4000-8000-0000000000f2',
  version: 2,
  statut: 'a_verifier',
  // toutes les lignes repartent à vérifier, au prix catalogue (E6.1)
  lignes: ([
    [train!, 'c1', train!.date],
    [hotel!, 'c2', hotel!.date],
    [hotel!, 'c3', '2026-11-08'],
    [atelier!, 'c4', atelier!.date],
  ] as const).map(([l, suffixe, date]) => ({
    ...l,
    id: `5a1e0000-0000-4000-8000-0000000000${suffixe}`,
    date,
    prix_confirme: null,
    statut: 'a_verifier' as const,
    total_ligne_cents: l.prix_unitaire_catalogue_cents * l.participants,
  })),
};

const lecture = (versions: Proposition[]): PropositionsLecture => ({
  proposition: async (id) => versions.find((v) => v.id === id) ?? null,
  versionDuDossier: async (_d, n) => versions.find((v) => v.version === n) ?? null,
  verificationDeLigne: async () => null,
});

class Ecriture implements ResumeEcartsEcriture {
  ecrit: { resume: string; empreinte: string } | null = null;
  async enregistrerResumeEcarts(_id: string, e: { resume: string; empreinte: string }) {
    this.ecrit = e;
  }
}

describe('écarts traduits pour le modèle (E6.3)', () => {
  const entree = versEntreeEcarts(comparerVersions(v1, v2));

  it('l’exemple connu : une nuit d’hôtel en plus, l’atelier moins cher, le total en hausse, prix à confirmer', () => {
    expect(entree).toEqual({
      // dans l'ordre d'E6.2 : première date, puis nom
      prestations: [
        { nom: atelier!.prestation.nom, type: 'activite', nature: 'modifiee', jours: null, participants: null, prix: 'baisse' },
        { nom: hotel!.prestation.nom, type: 'hebergement', nature: 'modifiee', jours: 'plus', participants: null, prix: 'hausse' },
      ],
      prestations_inchangees: true,
      total: 'hausse',
      prix_a_confirmer: true,
    });
  });

  it('aucun chiffre ne part vers le modèle : ni montant, ni date, ni nombre', () => {
    expect(JSON.stringify(entree)).not.toMatch(/\d/);
  });

  it('empreinte stable, différente si les écarts changent', () => {
    expect(empreinteEcarts(entree)).toBe(empreinteEcarts(versEntreeEcarts(comparerVersions(v1, v2))));
    expect(empreinteEcarts({ ...entree, total: 'baisse' })).not.toBe(empreinteEcarts(entree));
  });
});

describe('le texte ne contient aucun montant (DoD E6.3)', () => {
  it.each([
    'Le total passe à 550 €.',
    'Comptez 182 de plus.',
    'Il faut ajouter cent quatre-vingt-deux euros.',
    'Le séjour coûte davantage, environ deux cents EUR de plus.',
    'Arrivée le 8 novembre.',
  ])('refusé : « %s »', (resume) => {
    expect(EcartsIA.safeParse({ resume }).success).toBe(false);
  });

  it.each([
    'Nous avons ajouté une nuit à l’hôtel ; le coût total augmente.',
    'Le départ se fera en fin d’après-midi, à l’heure qui vous convient.',
    'Un séjour en Europe, plus long d’une nuit.',
  ])('accepté : « %s »', (resume) => {
    expect(EcartsIA.safeParse({ resume }).success).toBe(true);
  });

  it('la phrase du faux client passe le contrôle, quels que soient les écarts', async () => {
    const r = await new FauxLlmClient().resumerEcarts(versEntreeEcarts(comparerVersions(v1, v2)));
    expect(r.resume).not.toMatch(/\d|€|\beuros?\b/i);
    expect(r.resume).toMatch(/nuits? en plus/);
  });
});

describe('résumer les écarts (E6.3)', () => {
  it('écrit le résumé et l’empreinte des écarts pour lesquels il a été écrit', async () => {
    const ecriture = new Ecriture();
    const r = await resumerEcarts({ lecture: lecture([v1, v2]), ecriture, llm: new FauxLlmClient() }, v2.id);
    expect(r).toMatchObject({ ok: true, essais: 1 });
    expect(ecriture.ecrit).toEqual({ resume: (r as { resume: string }).resume, empreinte: empreinteEcarts(versEntreeEcarts(comparerVersions(v1, v2))) });
  });

  it('un résumé avec un montant est refusé : nouvel essai, puis erreur, rien n’est écrit', async () => {
    const ecriture = new Ecriture();
    const llm = new FauxLlmClient({ resumeRepondu: { resume: 'Le total passe à 550 €.' } });
    const r = await resumerEcarts({ lecture: lecture([v1, v2]), ecriture, llm }, v2.id);
    expect(r).toMatchObject({ ok: false, raison: 'modele', essais: 2 });
    expect(llm.appels).toHaveLength(2);
    expect(ecriture.ecrit).toBeNull();
  });

  it('modèle non configuré : pas de nouvel essai', async () => {
    const r = await resumerEcarts(
      { lecture: lecture([v1, v2]), ecriture: new Ecriture(), llm: new FauxLlmClient({ echec: new LlmError('configuration', 'clé absente') }) },
      v2.id,
    );
    expect(r).toMatchObject({ ok: false, raison: 'modele', essais: 1, message: 'Le modèle n’est pas configuré sur le serveur.' });
  });

  it.each([
    ['proposition inconnue', [v1, v2], '5a1e0000-0000-4000-8000-0000000000ff', 'introuvable'],
    ['version 1, rien à comparer', [v1], v1.id, 'premiere_version'],
    ['versions identiques', [v1, { ...v1, id: v2.id, version: 2 }], v2.id, 'aucun_ecart'],
  ] as const)('%s : le modèle n’est pas appelé', async (_cas, versions, id, raison) => {
    const llm = new FauxLlmClient();
    expect(await resumerEcarts({ lecture: lecture([...versions]), ecriture: new Ecriture(), llm }, id)).toEqual({ ok: false, raison });
    expect(llm.appels).toHaveLength(0);
  });
});

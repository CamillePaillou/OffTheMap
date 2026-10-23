import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION } from '../../fixtures/dashboard';
import type { PropositionsLecture, VerificationsEcriture } from '../ports/propositions';
import { reverifierLigne } from './reverifierLigne';
import type { ResultatVerification } from './verifierPrestation';

const resultat: ResultatVerification = {
  statut: 'ok', prix_unitaire_cents: 4000, prix_total_cents: 8000, places_restantes: 6, reponse_serveur: null,
  trace: [], modele: 'modele-test', nb_tours: 0, arret: 'conclusion', resume: 'Disponible.',
};

const lecture: PropositionsLecture = {
  proposition: async (id) => (id === PROPOSITION.id ? PROPOSITION : null),
  versionDuDossier: async () => null,
  verificationDeLigne: async () => null,
};

function ecriture() {
  const enregistrees: unknown[][] = [];
  const e: VerificationsEcriture = { enregistrer: async (...args) => (enregistrees.push(args), 'v1') };
  return { e, enregistrees };
}

describe('revérifier une ligne (E8.4)', () => {
  const ligne = PROPOSITION.lignes[0]!;

  it('l’agent ne reçoit que prestation, nom, date et participants ; le résultat est enregistré tel quel', async () => {
    const verifier = vi.fn(async () => resultat);
    const { e, enregistrees } = ecriture();
    const r = await reverifierLigne({ lecture, ecriture: e, verifier }, { propositionId: PROPOSITION.id, ligneId: ligne.id, conseillerId: 'c1' });

    expect(r).toEqual({ ok: true, verificationId: 'v1', resultat });
    expect(verifier).toHaveBeenCalledWith({ prestation_id: ligne.prestation.id, nom: ligne.prestation.nom, date: ligne.date, participants: ligne.participants });
    expect(enregistrees).toEqual([[ligne.id, 'c1', resultat]]);
  });

  it('aucun prix, budget ni total ne part vers l’agent', async () => {
    const verifier = vi.fn(async () => resultat);
    await reverifierLigne({ lecture, ecriture: ecriture().e, verifier }, { propositionId: PROPOSITION.id, ligneId: ligne.id, conseillerId: 'c1' });
    expect(JSON.stringify(verifier.mock.calls[0])).not.toMatch(/cents|budget|total/);
  });

  it.each([
    ['proposition inconnue', '00000000-0000-4000-8000-000000000000', ligne.id],
    ['ligne d’une autre proposition', PROPOSITION.id, '00000000-0000-4000-8000-000000000000'],
  ])('%s : rien n’est vérifié ni écrit', async (_cas, propositionId, ligneId) => {
    const verifier = vi.fn(async () => resultat);
    const { e, enregistrees } = ecriture();
    expect(await reverifierLigne({ lecture, ecriture: e, verifier }, { propositionId, ligneId, conseillerId: 'c1' })).toEqual({ ok: false, raison: 'introuvable' });
    expect(verifier).not.toHaveBeenCalled();
    expect(enregistrees).toHaveLength(0);
  });
});

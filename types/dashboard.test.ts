import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DETAIL_DOSSIER, LISTE_DOSSIERS, PROPOSITION, VERIFICATIONS } from '../fixtures/dashboard';
import { ALERTES_BLOQUANTES, REGLES_CHIFFRAGE } from './chiffrage';
import { LigneProposition, Proposition, VerificationLigne } from './dashboard';
import { DisponibiliteSimulateur } from './simulateur';
import { TRANSITIONS_DOSSIER, TRANSITIONS_PROPOSITION, trouverTransition } from './transitions';

const brut = (nom: string) => JSON.parse(readFileSync(join(__dirname, '../fixtures/dashboard', nom), 'utf8'));
const exemples = JSON.parse(readFileSync(join(__dirname, '../docs/specs/chiffrage-exemples.json'), 'utf8'));

describe('fixtures du dashboard conformes aux types', () => {
  it('liste : pagination cohérente, statuts variés', () => {
    expect(LISTE_DOSSIERS.total).toBe(LISTE_DOSSIERS.items.length);
    expect(new Set(LISTE_DOSSIERS.items.map((d) => d.statut)).size).toBe(LISTE_DOSSIERS.items.length);
    expect(LISTE_DOSSIERS.items.some((d) => d.fiche?.etat === 'erreur')).toBe(true); // bouton « relancer » (E2.1)
  });

  it('liste, détail et proposition décrivent le même dossier', () => {
    const resume = LISTE_DOSSIERS.items.find((d) => d.dossier_id === DETAIL_DOSSIER.dossier_id);
    expect(resume?.statut).toBe(DETAIL_DOSSIER.statut);
    expect(resume?.demande.voyageurs).toBe(DETAIL_DOSSIER.demande.voyageurs.length);
    expect(resume?.proposition).toMatchObject({
      id: PROPOSITION.id,
      statut: PROPOSITION.statut,
      total_cents: PROPOSITION.total_cents,
      lignes_a_verifier: PROPOSITION.lignes.filter((l) => l.statut === 'a_verifier').length,
    });
    expect(PROPOSITION.dossier_id).toBe(DETAIL_DOSSIER.dossier_id);
    expect(DETAIL_DOSSIER.propositions.map((p) => p.id)).toContain(PROPOSITION.id);
  });

  it('historique : uniquement des transitions autorisées, dans l’ordre', () => {
    const dates = DETAIL_DOSSIER.historique.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
    for (const e of DETAIL_DOSSIER.historique.filter((x) => x.type === 'statut')) {
      const transitions = e.cible === 'dossier' ? TRANSITIONS_DOSSIER : TRANSITIONS_PROPOSITION;
      // les deux machines ont des statuts en commun (erreur) : on vérifie avec la machine annoncée
      expect(trouverTransition(transitions as never[], e.ancien_statut as never, e.nouveau_statut as never, e.auteur), JSON.stringify(e)).not.toBeNull();
    }
    const dernier = DETAIL_DOSSIER.historique.filter((e) => e.cible === 'dossier').at(-1);
    expect(dernier?.nouveau_statut).toBe(DETAIL_DOSSIER.statut);
  });

  it('dossier en proposition : fiche validée avec budget réel et dates fixes', () => {
    const f = DETAIL_DOSSIER.fiche;
    expect(f?.etat).toBe('validee');
    expect(f?.budget_reel_cents).not.toBeNull();
    expect(f?.dates_fixes.debut).not.toBeNull();
  });

  it('proposition : mêmes totaux que l’exemple B des règles de chiffrage', () => {
    const b = exemples.cas.find((c: { id: string }) => c.id === 'B');
    expect(PROPOSITION.lignes.map((l) => l.total_ligne_cents)).toEqual(b.attendu.totaux_lignes_cents);
    expect(PROPOSITION.total_cents).toBe(b.attendu.total_cents);
    expect(PROPOSITION.alertes.map((a) => a.code)).toEqual(b.attendu.alertes);
    expect(PROPOSITION.marge_cents).toBe(REGLES_CHIFFRAGE.margeCents);
  });

  it('proposition : le total exclut les lignes remplacées ou indisponibles', () => {
    const horsTotal: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal;
    const somme = PROPOSITION.lignes.filter((l) => !horsTotal.includes(l.statut)).reduce((s, l) => s + l.total_ligne_cents, 0);
    expect(PROPOSITION.total_cents).toBe(somme);
    expect(PROPOSITION.alertes.filter((a) => ALERTES_BLOQUANTES.includes(a.code))).toEqual([]);
  });
});

describe('les schémas refusent une fixture incohérente', () => {
  const ligne = brut('proposition.json').lignes[2];

  it('refuse un total de ligne faux', () => {
    expect(LigneProposition.safeParse({ ...ligne, total_ligne_cents: 7000 }).success).toBe(false);
  });
  it('refuse une ligne confirmée sans prix confirmé', () => {
    expect(LigneProposition.safeParse({ ...ligne, prix_confirme: null, total_ligne_cents: 7000 }).success).toBe(false);
  });
  it('refuse un prix ou des places quand la vérification a échoué', () => {
    const v = { statut: 'echec', prix_unitaire_cents: 4000, places_restantes: 6, le: '2026-10-21T14:40:00Z' };
    expect(LigneProposition.safeParse({ ...ligne, derniere_verification: v }).success).toBe(false);
  });
  it('refuse un champ inconnu et un montant à 0 au lieu de null', () => {
    expect(Proposition.safeParse({ ...brut('proposition.json'), tarif_confirme_cents: null }).success).toBe(false);
    expect(Proposition.safeParse({ ...brut('proposition.json'), budget_reference_cents: 0 }).success).toBe(false);
  });
});

describe('fixtures des vérifications (E8.4)', () => {
  it('chaque vérification correspond à une ligne de la proposition et à son résumé', () => {
    for (const v of VERIFICATIONS) {
      const ligne = PROPOSITION.lignes.find((l) => l.id === v.ligne_id);
      expect(ligne, v.id).toBeDefined();
      expect(ligne?.derniere_verification).toMatchObject({
        statut: v.statut, prix_unitaire_cents: v.prix_unitaire_cents, places_restantes: v.places_restantes, le: v.le,
      });
    }
  });

  it('la réponse brute est celle du simulateur, et ses faits sont ceux de la vérification', () => {
    for (const v of VERIFICATIONS.filter((x) => x.statut !== 'echec')) {
      const brut = DisponibiliteSimulateur.parse(v.reponse_serveur);
      expect(brut.prix_unitaire_eur * 100).toBe(v.prix_unitaire_cents);
      expect(brut.prix_total_eur * 100).toBe(v.prix_total_cents);
      expect(brut.places_restantes).toBe(v.places_restantes);
    }
  });

  it('refuse un prix après un échec, et une trace qui ne compte pas les tours', () => {
    const [ok, echec] = brut('verifications.json');
    expect(VerificationLigne.safeParse({ ...echec, prix_unitaire_cents: 4000 }).success).toBe(false);
    expect(VerificationLigne.safeParse({ ...ok, nb_tours: ok.nb_tours + 1 }).success).toBe(false);
  });
});

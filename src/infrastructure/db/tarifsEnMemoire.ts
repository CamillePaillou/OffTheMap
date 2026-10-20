/** Tarifs, envoi et remplacement en mémoire, pour les tests. Mêmes règles que changer_ligne, envoyer_proposition (E5.1) et remplacer_ligne (E5.2). */
import { ALERTES_BLOQUANTES, type Alerte, type SourcePrix, type StatutProposition, type StatutVerification } from '../../../types';
import type { EntreeChiffrage, LigneAChiffrer } from '../../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../../ports/statuts';
import {
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  MemePrestationErreur,
  PrestationRefuseeErreur,
  PropositionFigeeErreur,
  type ChangementLigne,
  type PrestationRemplacante,
  type RemplacementLigne,
  type TarifsRepository,
} from '../../ports/tarifs';
import { ordonnerRemplacantes } from './ordonnerRemplacantes';

export interface LigneEnMemoire extends LigneAChiffrer {
  id: string;
  source: SourcePrix | null;
  confirme_par: string | null;
  verification: { statut: StatutVerification; prix_unitaire_cents: number | null } | null;
}

export interface PropositionEnMemoire extends Omit<EntreeChiffrage, 'lignes'> {
  id: string;
  statut: StatutProposition;
  lignes: LigneEnMemoire[];
  total_cents: number;
  alertes: Alerte[];
  envoyee_par: string | null;
}

export interface PrestationEnMemoire extends PrestationRemplacante {
  destination: string;
  actif: boolean;
}

export class TarifsEnMemoire implements TarifsRepository {
  readonly propositions = new Map<string, PropositionEnMemoire>();
  /** Catalogue (table prestations), pour le remplacement (E5.2). */
  readonly catalogue = new Map<string, PrestationEnMemoire>();
  readonly journal: string[] = [];
  private lignesCreees = 0;

  private trouver(ligneId: string) {
    for (const p of this.propositions.values()) {
      const l = p.lignes.find((x) => x.id === ligneId);
      if (l) return { p, l };
    }
    return null;
  }

  async lireLigne(ligneId: string) {
    const t = this.trouver(ligneId);
    return t ? { statut: t.l.statut, propositionId: t.p.id, verification: t.l.verification } : null;
  }

  async changerLigne(c: ChangementLigne) {
    const { p, l } = this.trouver(c.ligneId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    if (l.statut !== c.ancien) throw new LigneModifieeErreur(l.statut);
    l.statut = c.nouveau;
    l.prix_confirme_cents = c.nouveau === 'confirme' ? c.prixCents : null;
    l.source = c.nouveau === 'confirme' ? c.source : null;
    l.confirme_par = c.nouveau === 'confirme' ? c.conseillerId : null;
    return this.recalculer(p);
  }

  async remplacerLigne(r: RemplacementLigne) {
    const { p, l } = this.trouver(r.ligneId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    if (l.statut !== 'indisponible') throw new LigneModifieeErreur(l.statut);
    if (r.prestationId === l.prestation_id && (r.date ?? l.date) === l.date) throw new MemePrestationErreur(r.prestationId);
    const presta = this.catalogue.get(r.prestationId);
    if (!presta?.actif) throw new PrestationRefuseeErreur(r.prestationId);
    l.statut = 'remplacee';
    const nouvelle: LigneEnMemoire = {
      id: `${r.ligneId}-remplacement-${++this.lignesCreees}`,
      prestation_id: presta.id, type: presta.type, capacite: presta.capacite, actif: true,
      date: r.date ?? l.date, participants: r.participants ?? l.participants,
      prix_unitaire_catalogue_cents: presta.prix_unitaire_cents, prix_confirme_cents: null,
      statut: 'a_verifier', source: null, confirme_par: null, verification: null,
    };
    p.lignes.push(nouvelle);
    return { ligneId: nouvelle.id, statutProposition: this.recalculer(p) };
  }

  async prestationsRemplacantes(ligneId: string) {
    const t = this.trouver(ligneId);
    const actuelle = t && this.catalogue.get(t.l.prestation_id);
    if (!actuelle) return [];
    return ordonnerRemplacantes(
      [...this.catalogue.values()].filter((x) => x.actif && x.destination === actuelle.destination),
      actuelle,
    ).map(({ id, nom, type, prix_unitaire_cents, capacite }) => ({ id, nom, type, prix_unitaire_cents, capacite }));
  }

  /** Total hors remplacee et indisponible ; la proposition suit (a_verifier ↔ prete). */
  private recalculer(p: PropositionEnMemoire): StatutProposition {
    p.total_cents = p.lignes
      .filter((x) => x.statut !== 'remplacee' && x.statut !== 'indisponible')
      .reduce((s, x) => s + (x.prix_confirme_cents ?? x.prix_unitaire_catalogue_cents) * x.participants, 0);
    const cible: StatutProposition = p.lignes.some((x) => x.statut === 'a_verifier' || x.statut === 'indisponible') ? 'a_verifier' : 'prete';
    if (cible !== p.statut) {
      this.journal.push(`${p.statut}>${cible}`);
      p.statut = cible;
    }
    return p.statut;
  }

  async lireChiffrage(propositionId: string) {
    const p = this.propositions.get(propositionId);
    if (!p) return null;
    return { ...p, lignes: p.lignes.map((l) => ({ ...l })) };
  }

  async enregistrerAlertes(propositionId: string, alertes: Alerte[]) {
    this.propositions.get(propositionId)!.alertes = alertes;
  }

  async envoyer(propositionId: string, conseillerId: string) {
    const p = this.propositions.get(propositionId)!;
    const bloque = p.lignes.some((l) => l.statut === 'a_verifier' || l.statut === 'indisponible')
      || p.alertes.some((a) => ALERTES_BLOQUANTES.includes(a.code));
    if (bloque) throw new EnvoiRefuseErreur(propositionId);
    if (p.statut !== 'prete') throw new StatutModifieErreur('prete', p.statut);
    this.journal.push('prete>envoyee');
    p.statut = 'envoyee';
    p.envoyee_par = conseillerId;
  }
}

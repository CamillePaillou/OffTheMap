/**
 * Tarifs, envoi, remplacement et ajustement des lignes en mémoire, pour les tests. Mêmes règles que changer_ligne,
 * envoyer_proposition (E5.1), remplacer_ligne (E5.2), ajouter_ligne et modifier_ligne (E6.6), retirer_ligne et
 * changements après le dépôt (E7.4).
 */
import { ALERTES_BLOQUANTES, type Alerte, type SourcePrix, type StatutProposition, type StatutVerification } from '../../../types';
import type { EntreeChiffrage, LigneAChiffrer } from '../../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../../ports/statuts';
import {
  AccordClientRequisErreur,
  DerniereLigneErreur,
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  MemePrestationErreur,
  NuitsRefuseesErreur,
  PrestationRefuseeErreur,
  PropositionFigeeErreur,
  SejourImpossibleErreur,
  type AjoutLigne,
  type ChangementLigne,
  type ModificationLigne,
  type PrestationRemplacante,
  type RemplacementLigne,
  type RetraitLigne,
  type TarifsRepository,
} from '../../ports/tarifs';
import { ordonnerAjoutables, ordonnerRemplacantes } from './ordonnerRemplacantes';

/** E7.4 : seuls changements de ligne permis après le dépôt (comme changer_ligne). */
const APRES_DEPOT = ['confirme>indisponible', 'a_verifier>indisponible', 'a_verifier>confirme'];

export interface LigneEnMemoire extends LigneAChiffrer {
  id: string;
  source: SourcePrix | null;
  confirme_par: string | null;
  verification: { statut: StatutVerification; prix_unitaire_cents: number | null } | null;
}

export interface PropositionEnMemoire extends Omit<EntreeChiffrage, 'lignes'> {
  id: string;
  /** Destination du dossier (fixée, sinon demandée) : sans elle, envoi refusé. */
  destination: string | null;
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
    const apresDepot = p.statut === 'depot_recu' && APRES_DEPOT.includes(`${c.ancien}>${c.nouveau}`);
    if (!['a_verifier', 'prete'].includes(p.statut) && !apresDepot) throw new PropositionFigeeErreur(p.statut);
    if (l.statut !== c.ancien) throw new LigneModifieeErreur(l.statut);
    l.statut = c.nouveau;
    l.prix_confirme_cents = c.nouveau === 'confirme' ? c.prixCents : null;
    l.source = c.nouveau === 'confirme' ? c.source : null;
    l.confirme_par = c.nouveau === 'confirme' ? c.conseillerId : null;
    return this.recalculer(p);
  }

  async remplacerLigne(r: RemplacementLigne) {
    const { p, l } = this.trouver(r.ligneId)!;
    if (!['a_verifier', 'prete', 'depot_recu'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    if (p.statut === 'depot_recu' && !r.accordClient) throw new AccordClientRequisErreur(r.ligneId);
    if (l.statut !== 'indisponible') throw new LigneModifieeErreur(l.statut);
    if (r.prestationId === l.prestation_id && (r.date ?? l.date) === l.date) throw new MemePrestationErreur(r.prestationId);
    const presta = this.catalogue.get(r.prestationId);
    if (!presta?.actif) throw new PrestationRefuseeErreur(r.prestationId);
    l.statut = 'remplacee';
    const nouvelle: LigneEnMemoire = {
      id: `${r.ligneId}-remplacement-${++this.lignesCreees}`,
      prestation_id: presta.id, type: presta.type, capacite: presta.capacite, actif: true,
      date: r.date ?? l.date, participants: r.participants ?? l.participants, nb_nuits: presta.type === 'hebergement' ? l.nb_nuits : 1,
      prix_unitaire_catalogue_cents: presta.prix_unitaire_cents, prix_confirme_cents: null,
      statut: 'a_verifier', source: null, confirme_par: null, verification: null,
    };
    p.lignes.push(nouvelle);
    return { ligneId: nouvelle.id, statutProposition: this.recalculer(p) };
  }

  async retirerLigne(r: RetraitLigne) {
    const { p, l } = this.trouver(r.ligneId)!;
    if (p.statut !== 'depot_recu') throw new PropositionFigeeErreur(p.statut);
    if (!r.accordClient) throw new AccordClientRequisErreur(r.ligneId);
    if (l.statut !== 'indisponible') throw new LigneModifieeErreur(l.statut);
    if (!p.lignes.some((x) => x.id !== l.id && !['remplacee', 'retiree', 'indisponible'].includes(x.statut))) throw new DerniereLigneErreur(r.ligneId);
    l.statut = 'retiree';
    this.journal.push(`retrait:${l.id}`);
    return this.recalculer(p);
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

  async ajouterLigne(a: AjoutLigne) {
    const p = this.propositions.get(a.propositionId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    const presta = this.catalogue.get(a.prestationId);
    if (!presta?.actif) throw new PrestationRefuseeErreur(a.prestationId);
    if (this.dejaPrevue(p, a.prestationId, a.date)) throw new MemePrestationErreur(a.prestationId);
    if ((a.nbNuits ?? 1) > 1 && presta.type !== 'hebergement') throw new NuitsRefuseesErreur(a.prestationId);
    const nouvelle: LigneEnMemoire = {
      id: `${a.propositionId}-ajout-${++this.lignesCreees}`,
      prestation_id: presta.id, type: presta.type, capacite: presta.capacite, actif: true,
      date: a.date, participants: a.participants, nb_nuits: a.nbNuits ?? 1,
      prix_unitaire_catalogue_cents: presta.prix_unitaire_cents, prix_confirme_cents: null,
      statut: 'a_verifier', source: null, confirme_par: null, verification: null,
    };
    p.lignes.push(nouvelle);
    return { ligneId: nouvelle.id, statutProposition: this.recalculer(p) };
  }

  async modifierLigne(m: ModificationLigne) {
    const { p, l } = this.trouver(m.ligneId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    if (!['a_verifier', 'confirme', 'indisponible'].includes(l.statut)) throw new LigneModifieeErreur(l.statut);
    const date = m.date ?? l.date;
    const participants = m.participants ?? l.participants;
    const nb_nuits = m.nbNuits ?? l.nb_nuits;
    if (date === l.date && participants === l.participants && nb_nuits === l.nb_nuits) throw new MemePrestationErreur('rien ne change');
    if (date !== l.date && this.dejaPrevue(p, l.prestation_id, date, l.id)) throw new MemePrestationErreur(l.prestation_id);
    if (nb_nuits > 1 && l.type !== 'hebergement') throw new NuitsRefuseesErreur(l.prestation_id);
    Object.assign(l, { date, participants, nb_nuits, statut: 'a_verifier', prix_confirme_cents: null, source: null, confirme_par: null });
    return this.recalculer(p);
  }

  async prestationsAjoutables(propositionId: string) {
    const p = this.propositions.get(propositionId);
    const destinations = new Set(p?.lignes.map((l) => this.catalogue.get(l.prestation_id)?.destination).filter(Boolean));
    return ordonnerAjoutables(
      [...this.catalogue.values()].filter((x) => x.actif && (destinations.size === 0 || destinations.has(x.destination))),
    ).map(({ id, nom, type, prix_unitaire_cents, capacite }) => ({ id, nom, type, prix_unitaire_cents, capacite }));
  }

  async ajusterNuitsSejour(propositionId: string, delta: -1 | 1) {
    const p = this.propositions.get(propositionId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    const fin = new Date(Date.parse(`${p.date_fin}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
    const nuits = p.nb_nuits + delta;
    const jours = (Date.parse(fin) - Date.parse(p.date_debut)) / 86_400_000;
    if (nuits < 0 || nuits > 14 || jours < 0 || nuits > jours) throw new SejourImpossibleErreur(`${nuits} nuit(s)`);
    p.date_fin = fin;
    p.nb_nuits = nuits;
    return { date_debut: p.date_debut, date_fin: fin, nb_nuits: nuits };
  }

  async modifierBudgetReel(propositionId: string, budgetCents: number) {
    const p = this.propositions.get(propositionId)!;
    if (!['a_verifier', 'prete'].includes(p.statut)) throw new PropositionFigeeErreur(p.statut);
    p.budget_reference_cents = budgetCents; // le budget réel l'emporte sur l'annoncé (valeursDeReference)
  }

  /** Une ligne retenue (ni remplacée ni indisponible) prévoit déjà cette prestation à cette date. */
  private dejaPrevue(p: PropositionEnMemoire, prestationId: string, date: string, sauf?: string) {
    return p.lignes.some((x) => x.id !== sauf && x.prestation_id === prestationId && x.date === date && x.statut !== 'remplacee' && x.statut !== 'retiree' && x.statut !== 'indisponible');
  }

  /** Total hors remplacee, retiree et indisponible ; la proposition suit (a_verifier ↔ prete). */
  private recalculer(p: PropositionEnMemoire): StatutProposition {
    p.total_cents = p.lignes
      .filter((x) => x.statut !== 'remplacee' && x.statut !== 'retiree' && x.statut !== 'indisponible')
      .reduce((s, x) => s + (x.prix_confirme_cents ?? x.prix_unitaire_catalogue_cents) * x.participants * x.nb_nuits, 0);
    // après le dépôt, la proposition ne repasse jamais à vérifier (la réservation, elle, n'est pas simulée ici)
    if (p.statut === 'depot_recu') return p.statut;
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
    const bloque = !p.destination || p.lignes.some((l) => l.statut === 'a_verifier' || l.statut === 'indisponible')
      || p.alertes.some((a) => ALERTES_BLOQUANTES.includes(a.code));
    if (bloque) throw new EnvoiRefuseErreur(propositionId);
    if (p.statut !== 'prete') throw new StatutModifieErreur('prete', p.statut);
    this.journal.push('prete>envoyee');
    p.statut = 'envoyee';
    p.envoyee_par = conseillerId;
  }
}

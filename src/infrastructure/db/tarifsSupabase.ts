import 'server-only';
import type { Alerte, StatutProposition } from '../../../types';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import { valeursDeReference } from '../../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../../ports/statuts';
import {
  AccordClientRequisErreur,
  DemarcheEnCoursLigneErreur,
  DerniereLigneErreur,
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  MemePrestationErreur,
  PrestationRefuseeErreur,
  PropositionFigeeErreur,
  SejourImpossibleErreur,
  type AjoutLigne,
  type ChangementLigne,
  type ModificationLigne,
  type RemplacementLigne,
  type RetraitLigne,
  type Sejour,
  type TarifsRepository,
} from '../../ports/tarifs';
import { ordonnerAjoutables, ordonnerRemplacantes } from './ordonnerRemplacantes';

/** Tarifs et envoi avec la clé service_role, après exigerConseiller() dans l'action serveur. */
export class TarifsSupabase implements TarifsRepository {
  async lireLigne(ligneId: string) {
    const { data, error } = await clientService()
      .from('proposition_lignes')
      .select('statut, proposition_id, verifications (statut, prix_unitaire_cents, cree_le)')
      .eq('id', ligneId)
      .maybeSingle();
    if (error) throw new Error(`ligne : ${error.message}`);
    if (!data) return null;
    const derniere = [...(data.verifications ?? [])].sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
    return {
      statut: data.statut,
      propositionId: data.proposition_id,
      verification: derniere ? { statut: derniere.statut, prix_unitaire_cents: derniere.prix_unitaire_cents } : null,
    };
  }

  async changerLigne(c: ChangementLigne) {
    const { data, error } = await clientService().rpc('changer_ligne', {
      p_ligne: c.ligneId,
      p_ancien: c.ancien,
      p_nouveau: c.nouveau,
      p_prix_cents: c.prixCents as number,
      p_source: c.source as NonNullable<typeof c.source>,
      p_conseiller: c.conseillerId,
    });
    if (error?.code === 'OT002') throw new LigneModifieeErreur(error.message);
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT012') throw new DemarcheEnCoursLigneErreur(error.message);
    if (error) throw new Error(`changer_ligne : ${error.message}`);
    return data as StatutProposition;
  }

  async lireChiffrage(propositionId: string) {
    const { data, error } = await clientService()
      .from('propositions')
      .select(`statut,
        proposition_lignes (id, prestation_id, date, participants, prix_unitaire_catalogue_cents, prix_confirme_cents, statut,
          prestations (type, capacite, actif)),
        dossiers (demandes (version, remplacee_le, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents,
          fiches (date_debut_fixe, date_fin_fixe, nb_nuits_fixe, budget_reel_cents)))`)
      .eq('id', propositionId)
      .maybeSingle();
    if (error) throw new Error(`chiffrage : ${error.message}`);
    if (!data) return null;
    const demande = (data.dossiers?.demandes ?? []).filter((d) => d.remplacee_le === null).sort((a, b) => b.version - a.version)[0];
    if (!demande) throw new Error('chiffrage : aucune demande courante');
    return {
      statut: data.statut,
      voyageurs: demande.voyageurs.length,
      ...valeursDeReference(demande, demande.fiches ?? null),
      lignes: data.proposition_lignes.map((l) => ({
        id: l.id,
        prestation_id: l.prestation_id,
        type: l.prestations!.type,
        capacite: l.prestations!.capacite,
        actif: l.prestations!.actif,
        date: l.date,
        participants: l.participants,
        prix_unitaire_catalogue_cents: l.prix_unitaire_catalogue_cents,
        prix_confirme_cents: l.prix_confirme_cents,
        statut: l.statut,
      })),
    };
  }

  async enregistrerAlertes(propositionId: string, alertes: Alerte[]) {
    const { error } = await clientService().rpc('enregistrer_alertes', { p_proposition: propositionId, p_alertes: alertes as unknown as Json });
    if (error) throw new Error(`enregistrer_alertes : ${error.message}`);
  }

  async envoyer(propositionId: string, conseillerId: string) {
    const { error } = await clientService().rpc('envoyer_proposition', { p_proposition: propositionId, p_conseiller: conseillerId });
    if (error?.code === 'OT009') throw new EnvoiRefuseErreur(error.message);
    if (error?.code === 'OT002') throw new StatutModifieErreur('prete', null);
    if (error) throw new Error(`envoyer_proposition : ${error.message}`);
  }

  async remplacerLigne(r: RemplacementLigne) {
    const { data, error } = await clientService().rpc('remplacer_ligne', {
      p_ligne: r.ligneId,
      p_prestation: r.prestationId,
      p_conseiller: r.conseillerId,
      ...(r.date ? { p_date: r.date } : {}),
      ...(r.participants ? { p_participants: r.participants } : {}),
      p_accord_client: r.accordClient ?? false,
    });
    if (error?.code === 'OT002') throw new LigneModifieeErreur(error.message);
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT010') throw new PrestationRefuseeErreur(error.message);
    if (error?.code === 'OT011') throw new MemePrestationErreur(error.message);
    if (error?.code === 'OT013') throw new AccordClientRequisErreur(error.message);
    if (error) throw new Error(`remplacer_ligne : ${error.message}`);
    const ligneId = data as string;
    const { data: p, error: e2 } = await clientService()
      .from('proposition_lignes').select('propositions (statut)').eq('id', ligneId).single();
    if (e2) throw new Error(`remplacer_ligne : ${e2.message}`);
    return { ligneId, statutProposition: p.propositions!.statut as StatutProposition };
  }

  async retirerLigne(r: RetraitLigne) {
    const { data, error } = await clientService().rpc('retirer_ligne', {
      p_ligne: r.ligneId, p_conseiller: r.conseillerId, p_accord_client: r.accordClient,
    });
    if (error?.code === 'OT002') throw new LigneModifieeErreur(error.message);
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT013') throw new AccordClientRequisErreur(error.message);
    if (error?.code === 'OT014') throw new DerniereLigneErreur(error.message);
    if (error) throw new Error(`retirer_ligne : ${error.message}`);
    return data as StatutProposition;
  }

  async prestationsRemplacantes(ligneId: string) {
    const { data: ligne, error } = await clientService()
      .from('proposition_lignes').select('prestations (id, type, destination)').eq('id', ligneId).maybeSingle();
    if (error) throw new Error(`prestations de remplacement : ${error.message}`);
    const actuelle = ligne?.prestations;
    if (!actuelle) return [];
    const { data, error: e2 } = await clientService()
      .from('prestations')
      .select('id, nom, type, prix_unitaire_cents, capacite')
      .eq('destination', actuelle.destination).eq('actif', true);
    if (e2) throw new Error(`prestations de remplacement : ${e2.message}`);
    return ordonnerRemplacantes(data, actuelle);
  }

  async ajouterLigne(a: AjoutLigne) {
    const { data, error } = await clientService().rpc('ajouter_ligne', {
      p_proposition: a.propositionId,
      p_prestation: a.prestationId,
      p_date: a.date,
      p_participants: a.participants,
      p_conseiller: a.conseillerId,
    });
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT010') throw new PrestationRefuseeErreur(error.message);
    if (error?.code === 'OT011') throw new MemePrestationErreur(error.message);
    if (error) throw new Error(`ajouter_ligne : ${error.message}`);
    const { data: p, error: e2 } = await clientService().from('propositions').select('statut').eq('id', a.propositionId).single();
    if (e2) throw new Error(`ajouter_ligne : ${e2.message}`);
    return { ligneId: data, statutProposition: p.statut };
  }

  async modifierLigne(m: ModificationLigne) {
    const { data, error } = await clientService().rpc('modifier_ligne', {
      p_ligne: m.ligneId,
      p_conseiller: m.conseillerId,
      ...(m.date ? { p_date: m.date } : {}),
      ...(m.participants ? { p_participants: m.participants } : {}),
    });
    if (error?.code === 'OT002') throw new LigneModifieeErreur(error.message);
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT011') throw new MemePrestationErreur(error.message);
    if (error) throw new Error(`modifier_ligne : ${error.message}`);
    return data;
  }

  async ajusterNuitsSejour(propositionId: string, delta: -1 | 1, conseillerId: string) {
    const { data, error } = await clientService().rpc('ajuster_nuits_sejour', { p_proposition: propositionId, p_delta: delta, p_conseiller: conseillerId });
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error?.code === 'OT012') throw new SejourImpossibleErreur(error.message);
    if (error) throw new Error(`ajuster_nuits_sejour : ${error.message}`);
    return data as unknown as Sejour; // jsonb construit par la fonction : date_debut, date_fin, nb_nuits
  }

  async modifierBudgetReel(propositionId: string, budgetCents: number, conseillerId: string) {
    const { error } = await clientService().rpc('modifier_budget_reel', { p_proposition: propositionId, p_budget_cents: budgetCents, p_conseiller: conseillerId });
    if (error?.code === 'OT008') throw new PropositionFigeeErreur(error.message);
    if (error) throw new Error(`modifier_budget_reel : ${error.message}`);
  }

  async prestationsAjoutables(propositionId: string) {
    // destination(s) des prestations déjà prévues ; à défaut, tout le catalogue actif
    const { data: lignes, error } = await clientService()
      .from('proposition_lignes').select('prestations (destination)').eq('proposition_id', propositionId);
    if (error) throw new Error(`prestations ajoutables : ${error.message}`);
    const destinations = [...new Set((lignes ?? []).map((l) => l.prestations?.destination).filter((d): d is string => !!d))];
    let requete = clientService().from('prestations').select('id, nom, type, prix_unitaire_cents, capacite').eq('actif', true);
    if (destinations.length > 0) requete = requete.in('destination', destinations);
    const { data, error: e2 } = await requete;
    if (e2) throw new Error(`prestations ajoutables : ${e2.message}`);
    return ordonnerAjoutables(data);
  }
}

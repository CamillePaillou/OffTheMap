import 'server-only';
import type { Alerte, StatutProposition } from '../../../types';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import { valeursDeReference } from '../../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../../ports/statuts';
import {
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  PropositionFigeeErreur,
  type ChangementLigne,
  type TarifsRepository,
} from '../../ports/tarifs';

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
}

import 'server-only';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import {
  DemarrageRefuse, type ContexteBrouillon, type GenerationBrouillonRepository, type RefusDemarrage, type ResultatBrouillon,
} from '../../ports/generationBrouillon';
import { StatutModifieErreur } from '../../ports/statuts';

const COLONNES_DEMANDE = 'nom, email, destination, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, regimes, mobilite, prestations_souhaitees';
const COLONNES_FICHE = 'envies, contraintes, points_flous, regimes, mobilite, niveau_physique, budget_reel_cents, destination_fixe, date_debut_fixe, date_fin_fixe, nb_nuits_fixe';

const REFUS: Record<string, RefusDemarrage> = { OT001: 'introuvable', OT002: 'statut_modifie', OT004: 'deja_une_proposition', OT005: 'fiche_incomplete', OT015: 'destination_manquante' };

/** Brouillon de proposition avec la clé service_role (jamais côté navigateur). */
export class GenerationBrouillonSupabase implements GenerationBrouillonRepository {
  async demarrer(dossierId: string, conseillerId: string) {
    const { data, error } = await clientService().rpc('demarrer_brouillon', { p_dossier: dossierId, p_conseiller: conseillerId });
    const refus = error?.code ? REFUS[error.code] : undefined;
    if (refus) throw new DemarrageRefuse(refus);
    if (error) throw new Error(`demarrer_brouillon : ${error.message}`);
    return data;
  }

  async lireContexte(propositionId: string): Promise<ContexteBrouillon | null> {
    const supabase = clientService();
    const { data: proposition, error: e1 } = await supabase.from('propositions').select('dossier_id').eq('id', propositionId).maybeSingle();
    if (e1) throw new Error(`proposition : ${e1.message}`);
    if (!proposition) return null;

    const [demande, catalogue] = await Promise.all([
      supabase
        .from('demandes')
        .select(`${COLONNES_DEMANDE}, fiches (${COLONNES_FICHE})`)
        .eq('dossier_id', proposition.dossier_id)
        .is('remplacee_le', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('prestations').select('id, type, nom, destination, prix_unitaire_cents, capacite, actif').eq('actif', true),
    ]);
    if (demande.error) throw new Error(`demande courante : ${demande.error.message}`);
    if (catalogue.error) throw new Error(`catalogue : ${catalogue.error.message}`);
    if (!demande.data?.fiches) return null; // demarrer_brouillon exige une fiche : ne devrait pas arriver

    const { fiches: fiche, ...lue } = demande.data;
    return { demande: lue, fiche, catalogue: catalogue.data };
  }

  async terminer(propositionId: string, resultat: ResultatBrouillon) {
    const { data, error } = await clientService().rpc('terminer_brouillon', { p_proposition: propositionId, p_resultat: resultat as unknown as Json });
    if (error?.code === 'OT002') throw new StatutModifieErreur('brouillon_en_cours', null);
    if (error) throw new Error(`terminer_brouillon : ${error.message}`);
    return data as 'a_verifier' | 'erreur';
  }
}

import 'server-only';
import type { StatutDossier, StatutProposition } from '../../../types';
import { clientService } from '../../../lib/supabase/service';
import type { AbandonRepository } from '../../ports/abandon';
import { StatutModifieErreur } from '../../ports/statuts';

/** Abandon d'un dossier sans réponse (E6.5) par la fonction SQL abandonner_dossier, avec la clé service_role, après exigerConseiller(). */
export class AbandonSupabase implements AbandonRepository {
  async lire(propositionId: string) {
    const { data, error } = await clientService()
      .from('propositions')
      .select('statut, envoyee_le, dossiers!inner (statut)')
      .eq('id', propositionId)
      .maybeSingle();
    if (error) throw new Error(`proposition à abandonner : ${error.message}`);
    if (!data) return null;
    return {
      statut: data.statut as StatutProposition,
      envoyee_le: data.envoyee_le && new Date(data.envoyee_le).toISOString(),
      dossier_statut: data.dossiers.statut as StatutDossier,
    };
  }

  async abandonner(propositionId: string, conseillerId: string) {
    const { error } = await clientService().rpc('abandonner_dossier', { p_proposition: propositionId, p_conseiller: conseillerId });
    // OT002 : réponse, changement ou abandon enregistré entre-temps ; OT012 : avant J+14 (horloge de la base)
    if (error?.code === 'OT002' || error?.code === 'OT012') throw new StatutModifieErreur('sans_reponse', null);
    if (error) throw new Error(`abandonner_dossier : ${error.message}`);
  }
}

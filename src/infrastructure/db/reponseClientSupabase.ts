import 'server-only';
import type { StatutProposition } from '../../../types';
import { clientService } from '../../../lib/supabase/service';
import { DejaAccepteeErreur, type ReponseClientRepository } from '../../ports/reponseClient';
import { StatutModifieErreur } from '../../ports/statuts';

/** Réponse du client par la fonction SQL enregistrer_reponse_client, avec la clé service_role, après exigerConseiller(). */
export class ReponseClientSupabase implements ReponseClientRepository {
  async lireStatut(propositionId: string) {
    const { data, error } = await clientService().from('propositions').select('statut').eq('id', propositionId).maybeSingle();
    if (error) throw new Error(`statut de la proposition : ${error.message}`);
    return (data?.statut ?? null) as StatutProposition | null;
  }

  async enregistrer(propositionId: string, nouveau: 'acceptee' | 'depot_recu', conseillerId: string) {
    const { error } = await clientService().rpc('enregistrer_reponse_client', {
      p_proposition: propositionId,
      p_nouveau: nouveau,
      p_conseiller: conseillerId,
    });
    if (error?.code === 'OT002') throw new StatutModifieErreur(nouveau, null);
    if (error?.code === 'OT011') throw new DejaAccepteeErreur(error.message);
    if (error) throw new Error(`enregistrer_reponse_client : ${error.message}`);
  }
}

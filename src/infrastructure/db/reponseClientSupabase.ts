import 'server-only';
import type { StatutProposition } from '../../../types';
import { clientService } from '../../../lib/supabase/service';
import { DejaAccepteeErreur, type ReponseClientRepository } from '../../ports/reponseClient';
import { StatutModifieErreur } from '../../ports/statuts';
import type { ReponseEnLigne } from '../../ports/espaceClient';

/** Réponse donnée en ligne par le client dans son espace (table reponses_client), à montrer au conseiller. */
export async function lireReponseEnLigne(propositionId: string): Promise<ReponseEnLigne | null> {
  const { data, error } = await clientService().from('reponses_client').select('type, message, cree_le').eq('proposition_id', propositionId).maybeSingle();
  if (error) throw new Error(`réponse en ligne : ${error.message}`);
  return data;
}

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

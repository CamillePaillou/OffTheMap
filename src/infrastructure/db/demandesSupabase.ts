import 'server-only';
import type { Json } from '../../../types/database';
import type { NouvelleDemande } from '../../../types/demande';
import type { DemandeDeposee, DemandesRepository } from '../../ports/demandes';
import { clientService } from '../../../lib/supabase/service';

/** Dépose une demande par la fonction SQL deposer_demande, avec la clé service_role (jamais côté navigateur). */
export class DemandesSupabase implements DemandesRepository {
  async deposer(demande: NouvelleDemande): Promise<DemandeDeposee> {
    const { data, error } = await clientService().rpc('deposer_demande', { p_demande: demande as unknown as Json });
    if (error) throw new Error(`deposer_demande : ${error.message}`);
    const ligne = data?.[0];
    if (!ligne) throw new Error('deposer_demande : aucune ligne renvoyée');
    // numéro de dossier (espace client) : tiré par la base à la création du dossier ; la demande est déjà enregistrée,
    // un échec de cette lecture ne la fait pas échouer
    const { data: dossier } = await clientService().from('dossiers').select('reference').eq('id', ligne.dossier_id).maybeSingle();
    return { dossierId: ligne.dossier_id, demandeId: ligne.demande_id, reference: dossier?.reference };
  }
}

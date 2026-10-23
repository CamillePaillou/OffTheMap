import 'server-only';
import type { Json } from '../../../types/database';
import type { StatutDossier } from '../../../types/enums';
import { clientService } from '../../../lib/supabase/service';
import { StatutModifieErreur } from '../../ports/statuts';
import { SansFicheErreur, type EcritureTri, type TriRepository } from '../../ports/tri';

/** Tri par la fonction SQL trier_dossier, avec la clé service_role, après exigerConseiller(). */
export class TriSupabase implements TriRepository {
  async lireStatut(dossierId: string) {
    const { data, error } = await clientService().from('dossiers').select('statut').eq('id', dossierId).maybeSingle();
    if (error) throw new Error(`lecture du statut : ${error.message}`);
    return (data?.statut ?? null) as StatutDossier | null;
  }

  async trier(e: EcritureTri) {
    const { error } = await clientService().rpc('trier_dossier', {
      p_dossier: e.dossierId,
      p_ancien: e.ancien,
      p_decision: e.decision,
      p_conseiller: e.conseillerId,
      p_detail: e.detail as unknown as Json,
    });
    if (error?.code === 'OT002') throw new StatutModifieErreur(e.ancien, null);
    if (error?.code === 'OT001') throw new SansFicheErreur(e.dossierId);
    if (error) throw new Error(`trier_dossier : ${error.message}`);
  }
}

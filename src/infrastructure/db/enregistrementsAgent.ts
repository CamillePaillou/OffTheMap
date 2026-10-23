import 'server-only';
import { clientService } from '../../../lib/supabase/service';
import { TraceVerification } from '../../../types/trace';
import { choisirEnregistrement, type CibleRejeu, type EnregistrementAgent } from '../../domain/verification/rejeu';
import enregistrementsCampagne from '../../../fixtures/rejeu/agent.json';

/**
 * Où trouver une vérification à rejouer (E11.3) : d'abord les vérifications faites avec un vrai modèle sur la même
 * prestation, à la même date et pour le même nombre de participants (base, n'importe quel dossier) ; sinon les
 * enregistrements de la campagne E11.2 (`fixtures/rejeu/agent.json`). Lecture avec la clé service_role, après
 * exigerConseiller().
 */
export async function trouverEnregistrement(cible: CibleRejeu): Promise<EnregistrementAgent | null> {
  const candidats: EnregistrementAgent[] = [];
  const supabase = clientService();
  const { data: lignes } = await supabase
    .from('proposition_lignes')
    .select('id')
    .eq('prestation_id', cible.prestation_id)
    .eq('date', cible.date)
    .eq('participants', cible.participants);
  const ids = (lignes ?? []).map((l) => l.id);
  if (ids.length > 0) {
    const { data } = await supabase
      .from('verifications')
      .select('modele, trace, cree_le')
      .in('ligne_id', ids)
      .eq('arret', 'conclusion')
      .like('modele', '%:free')
      .order('cree_le', { ascending: false })
      .limit(5);
    for (const v of data ?? []) {
      const trace = TraceVerification.safeParse(v.trace);
      if (trace.success) candidats.push({ modele: v.modele, enregistre_le: v.cree_le, ligne: cible, trace: trace.data, source: 'base' });
    }
  }
  for (const e of enregistrementsCampagne) {
    const trace = TraceVerification.safeParse(e.trace);
    if (trace.success) candidats.push({ ...e, trace: trace.data });
  }
  return choisirEnregistrement(cible, candidats);
}

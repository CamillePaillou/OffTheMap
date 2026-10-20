import 'server-only';
import { clientService } from '../../../lib/supabase/service';
import { clientSupabase } from '../../../lib/supabase/serveur';
import type { JourRappel } from '../../domain/rappels';
import { RappelConcurrentErreur, type PropositionEnAttente, type RappelsLecture, type RappelsRepository } from '../../ports/rappels';
import { versionEnCours } from './versPayloadsDashboard';

const jourDe = (detail: unknown) => Number((detail as { jour?: unknown } | null)?.jour);

/** Rappels (E6.4) : écriture par enregistrer_rappel avec la clé service_role ; lecture au nom du conseiller (RLS). */
export class RappelsSupabase implements RappelsRepository, RappelsLecture {
  async enAttente(): Promise<PropositionEnAttente[]> {
    const { data, error } = await clientService()
      .from('propositions')
      .select('id, statut, envoyee_le, historique_dossier (type, detail)')
      .in('statut', ['envoyee', 'sans_reponse'])
      .not('envoyee_le', 'is', null)
      .eq('historique_dossier.type', 'rappel');
    if (error) throw new Error(`propositions en attente : ${error.message}`);
    return data.map((p) => ({
      id: p.id,
      statut: p.statut as PropositionEnAttente['statut'],
      envoyee_le: p.envoyee_le!,
      rappels: p.historique_dossier.map((h) => jourDe(h.detail)).filter(Number.isFinite),
    }));
  }

  async enregistrerRappel(propositionId: string, jour: JourRappel) {
    const { error } = await clientService().rpc('enregistrer_rappel', { p_proposition: propositionId, p_jour: jour });
    // OT002 : réponse enregistrée ou rappel déjà fait entre-temps ; 23505 : même rappel posé en parallèle
    if (error?.code === 'OT002' || error?.code === '23505') throw new RappelConcurrentErreur(error.message);
    if (error) throw new Error(`enregistrer_rappel : ${error.message}`);
  }

  async aRelancer() {
    const supabase = await clientSupabase();
    const { data, error } = await supabase
      .from('propositions')
      .select('id, dossier_id, version, envoyee_le, dossiers (demandes (version, remplacee_le, nom)), historique_dossier (type, detail)')
      .eq('statut', 'sans_reponse')
      .eq('historique_dossier.type', 'rappel')
      .order('envoyee_le');
    if (error) throw new Error(`propositions à relancer : ${error.message}`);
    return data.map((p) => ({
      proposition_id: p.id,
      dossier_id: p.dossier_id,
      version: p.version,
      client_nom: versionEnCours(p.dossiers?.demandes ?? [])?.nom ?? '—',
      envoyee_le: new Date(p.envoyee_le!).toISOString(),
      dernier_rappel: Math.max(3, ...p.historique_dossier.map((h) => jourDe(h.detail)).filter(Number.isFinite)) as JourRappel,
    }));
  }
}

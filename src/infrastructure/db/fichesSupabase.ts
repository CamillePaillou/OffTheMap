import 'server-only';
import type { CorrectionFiche } from '../../../types/fiche';
import { clientService } from '../../../lib/supabase/service';
import type { FichesRepository } from '../../ports/dossiers';

/** Corrige la fiche par la fonction SQL corriger_fiche (champs du conseiller seulement), avec la clé service_role. */
export class FichesSupabase implements FichesRepository {
  async corriger(dossierId: string, c: CorrectionFiche): Promise<'ok' | 'sans_fiche'> {
    const supabase = clientService();
    // fiche de la version en cours de la demande
    const { data: demande, error: erreurLecture } = await supabase
      .from('demandes')
      .select('fiches (id)')
      .eq('dossier_id', dossierId)
      .order('remplacee_le', { ascending: false, nullsFirst: true })
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (erreurLecture) throw new Error(`fiche du dossier : ${erreurLecture.message}`);
    const fiche = demande?.fiches ?? null;
    if (!fiche) return 'sans_fiche';

    const { error } = await supabase.rpc('corriger_fiche', {
      p_fiche_id: fiche.id,
      p_budget_reel_cents: c.budget_reel_cents,
      p_date_debut_fixe: c.date_debut_fixe,
      p_date_fin_fixe: c.date_fin_fixe,
      p_nb_nuits_fixe: c.nb_nuits_fixe,
      p_notes_conseiller: c.notes_conseiller,
    });
    if (error) throw new Error(`corriger_fiche : ${error.message}`);
    return 'ok';
  }
}

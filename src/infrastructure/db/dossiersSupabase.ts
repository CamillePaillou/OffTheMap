import 'server-only';
import { z } from 'zod';
import { clientSupabase } from '../../../lib/supabase/serveur';
import type { DossiersLecture } from '../../ports/dossiers';
import { versDetailDossier, versDossierResume, type LigneDossierDetail, type LigneDossierListe, type LigneHistorique, type PrestationNommee } from './versPayloadsDashboard';

const SELECT_LISTE = `id, statut, cree_le,
  demandes (version, remplacee_le, nom, destination, date_debut, date_fin, voyageurs, budget_annonce_cents,
    fiches (erreur_generation, validee_le)),
  propositions (id, version, statut, total_cents, proposition_lignes (statut))`;

const SELECT_DETAIL = `id, statut, cree_le,
  demandes (version, remplacee_le, nom, email, destination, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, prestations_souhaitees,
    fiches (envies, contraintes, points_flous, regimes, mobilite, niveau_physique, budget_reel_cents, date_debut_fixe, date_fin_fixe,
      nb_nuits_fixe, notes_conseiller, decision, validee_le, erreur_generation)),
  propositions (id, version, statut, total_cents)`;

/** Lecture au nom du conseiller connecté : la RLS (lecture_conseiller) s'applique, aucune clé service_role. */
export class DossiersSupabase implements DossiersLecture {
  async liste({ limit, offset }: { limit: number; offset: number }) {
    const supabase = await clientSupabase();
    const { data, error, count } = await supabase
      .from('dossiers')
      .select(SELECT_LISTE, { count: 'exact' })
      .order('cree_le', { ascending: false })
      .order('id')
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`liste des dossiers : ${error.message}`);
    const lignes: LigneDossierListe[] = data ?? [];
    return { items: lignes.map(versDossierResume), total: count ?? lignes.length, limit, offset };
  }

  async detail(dossierId: string) {
    if (!z.uuid().safeParse(dossierId).success) return null;
    const supabase = await clientSupabase();
    const [dossier, historique] = await Promise.all([
      supabase.from('dossiers').select(SELECT_DETAIL).eq('id', dossierId).maybeSingle(),
      supabase
        .from('historique_dossier')
        .select('cree_le, type, proposition_id, ancien_statut, nouveau_statut, auteur, detail, profils (nom_affiche)')
        .eq('dossier_id', dossierId)
        .order('cree_le')
        .order('id'),
    ]);
    if (dossier.error) throw new Error(`détail du dossier : ${dossier.error.message}`);
    if (historique.error) throw new Error(`historique du dossier : ${historique.error.message}`);
    if (!dossier.data) return null;
    // prestations souhaitées (E1.4) : leurs noms, lus au catalogue (colonnes sans prix)
    const ids = [...new Set(dossier.data.demandes.flatMap((d) => d.prestations_souhaitees ?? []))];
    let catalogue: PrestationNommee[] = [];
    if (ids.length > 0) {
      const { data, error } = await supabase.from('prestations').select('id, nom, type, destination').in('id', ids);
      if (error) throw new Error(`prestations souhaitées : ${error.message}`);
      catalogue = data ?? [];
    }
    return versDetailDossier(dossier.data satisfies LigneDossierDetail, historique.data satisfies LigneHistorique[], catalogue);
  }
}

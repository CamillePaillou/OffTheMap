import 'server-only';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import { valeursDeReference } from '../../domain/chiffrage/chiffrer';
import { VersionModifieeErreur, type VersionsRepository } from '../../ports/versions';

/** Nouvelle version d'une proposition avec la clé service_role (jamais côté navigateur). */
export class VersionsSupabase implements VersionsRepository {
  async lireVersionEnvoyee(propositionId: string) {
    const { data, error } = await clientService()
      .from('propositions')
      .select(`statut, programme,
        proposition_lignes (prestation_id, date, participants, nb_nuits, statut, cree_le,
          prestations (id, type, nom, destination, prix_unitaire_cents, capacite, actif)),
        dossiers (demandes (version, remplacee_le, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents,
          fiches (date_debut_fixe, date_fin_fixe, nb_nuits_fixe, budget_reel_cents)))`)
      .eq('id', propositionId)
      .maybeSingle();
    if (error) throw new Error(`version envoyée : ${error.message}`);
    if (!data) return null;
    const demande = (data.dossiers?.demandes ?? []).filter((d) => d.remplacee_le === null).sort((a, b) => b.version - a.version)[0];
    if (!demande) throw new Error('version envoyée : aucune demande courante');
    return {
      statut: data.statut,
      // programme : jsonb écrit par terminer_brouillon après validation par schemaBrouillon (E4.4)
      programme: data.programme as { date: string; titre: string; texte: string }[] | null,
      lignes: [...data.proposition_lignes]
        .sort((a, b) => a.date.localeCompare(b.date) || a.cree_le.localeCompare(b.cree_le))
        .map((l) => ({ prestation_id: l.prestation_id, date: l.date, participants: l.participants, nb_nuits: l.nb_nuits, statut: l.statut, prestation: l.prestations! })),
      reference: { voyageurs: demande.voyageurs.length, ...valeursDeReference(demande, demande.fiches ?? null) },
    };
  }

  async creerVersionSuivante(propositionId: string, conseillerId: string, motif: string, resultat: unknown) {
    const { data, error } = await clientService().rpc('creer_version_suivante', {
      p_proposition: propositionId,
      p_conseiller: conseillerId,
      p_motif: motif,
      p_resultat: resultat as Json,
    });
    if (error?.code === 'OT002') throw new VersionModifieeErreur(error.message);
    if (error) throw new Error(`creer_version_suivante : ${error.message}`);
    return data;
  }
}

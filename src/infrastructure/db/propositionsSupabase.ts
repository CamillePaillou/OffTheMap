import 'server-only';
import { z } from 'zod';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import { clientSupabase } from '../../../lib/supabase/serveur';
import type { ResultatVerification } from '../../application/verifierPrestation';
import type { PropositionsLecture, ResumeEcartsEcriture, VerificationsEcriture } from '../../ports/propositions';
import { versProposition, versVerificationLigne, type PropositionBase, type VerificationBase } from './versPayloadsPropositions';

const SELECT_PROPOSITION = `id, dossier_id, version, statut, programme, total_cents, alertes, ecarts, motif_changement,
  proposition_lignes (id, date, participants, nb_nuits, prix_unitaire_catalogue_cents, prix_confirme_cents, source, confirme_le, statut,
    total_ligne_cents, cree_le,
    prestations (id, nom, type, capacite, actif),
    profils (nom_affiche),
    verifications (statut, prix_unitaire_cents, places_restantes, cree_le)),
  dossiers (demandes (version, remplacee_le, budget_annonce_cents, fiches (budget_reel_cents)))`;

const SELECT_VERIFICATION = `id, ligne_id, statut, prix_unitaire_cents, prix_total_cents, places_restantes, resume, reponse_serveur,
  trace, modele, nb_tours, arret, cree_le, profils (nom_affiche)`;

const estUuid = (id: string) => z.uuid().safeParse(id).success;

/** Lecture au nom du conseiller connecté : la RLS (lecture_conseiller) s'applique, aucune clé service_role. */
export class PropositionsSupabase implements PropositionsLecture {
  async proposition(id: string) {
    if (!estUuid(id)) return null;
    const supabase = await clientSupabase();
    const { data, error } = await supabase.from('propositions').select(SELECT_PROPOSITION).eq('id', id).maybeSingle();
    if (error) throw new Error(`proposition : ${error.message}`);
    // alertes et ecarts sont des jsonb : leur forme est vérifiée par le schéma Proposition dans versProposition
    return data ? versProposition(data satisfies PropositionBase) : null;
  }

  async versionDuDossier(dossierId: string, version: number) {
    if (!estUuid(dossierId)) return null;
    const supabase = await clientSupabase();
    const { data, error } = await supabase
      .from('propositions')
      .select(SELECT_PROPOSITION)
      .eq('dossier_id', dossierId)
      .eq('version', version)
      .maybeSingle();
    if (error) throw new Error(`version ${version} du dossier : ${error.message}`);
    return data ? versProposition(data satisfies PropositionBase) : null;
  }

  async verificationDeLigne(ligneId: string) {
    if (!estUuid(ligneId)) return null;
    const supabase = await clientSupabase();
    const { data, error } = await supabase
      .from('verifications')
      .select(SELECT_VERIFICATION)
      .eq('ligne_id', ligneId)
      .order('cree_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`vérification de la ligne : ${error.message}`);
    return data ? versVerificationLigne(data satisfies VerificationBase) : null;
  }
}

/** Écriture par le serveur seulement (clé service_role) : ni le conseiller ni le modèle n'écrivent dans verifications. */
export class VerificationsSupabase implements VerificationsEcriture {
  async enregistrer(ligneId: string, demandeParId: string, r: ResultatVerification) {
    const { data, error } = await clientService()
      .from('verifications')
      .insert({
        ligne_id: ligneId,
        demande_par: demandeParId,
        statut: r.statut,
        prix_unitaire_cents: r.prix_unitaire_cents,
        prix_total_cents: r.prix_total_cents,
        places_restantes: r.places_restantes,
        reponse_serveur: r.reponse_serveur as unknown as Json,
        trace: r.trace as unknown as Json[], // déjà expurgée par verifierPrestation
        modele: r.modele,
        nb_tours: r.nb_tours,
        arret: r.arret,
        resume: r.resume,
      })
      .select('id')
      .single();
    if (error) throw new Error(`enregistrement de la vérification : ${error.message}`);
    return data.id;
  }
}

/** Résumé des écarts (E6.3), écrit par le serveur seulement (clé service_role), après validation par EcartsIA. */
export class ResumeEcartsSupabase implements ResumeEcartsEcriture {
  async enregistrerResumeEcarts(propositionId: string, ecarts: { resume: string; empreinte: string }) {
    const { error } = await clientService().from('propositions').update({ ecarts }).eq('id', propositionId);
    if (error) throw new Error(`enregistrement du résumé des écarts : ${error.message}`);
  }
}

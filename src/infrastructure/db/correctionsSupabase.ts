import 'server-only';
import type { Json } from '../../../types/database';
import type { NouvelleDemande } from '../../../types/demande';
import {
  BouclesEpuiseesErreur,
  DossierPasACorrigerErreur,
  LienInvalideErreur,
  type CorrectionsRepository,
  type LectureCorrection,
  type NouvelleCorrection,
} from '../../ports/corrections';
import { clientService } from '../../../lib/supabase/service';

/** Erreurs métier levées par les fonctions SQL (codes OT00x), traduites pour le cas d'usage. */
function traduire(fonction: string, error: { code?: string; message: string }): Error {
  if (error.code === 'OT004') return new DossierPasACorrigerErreur(error.message);
  if (error.code === 'OT005') return new BouclesEpuiseesErreur(error.message);
  if (error.code === 'OT006') return new LienInvalideErreur(error.message);
  return new Error(`${fonction} : ${error.message}`);
}

/** Liens de correction par les fonctions SQL, avec la clé service_role (jamais côté navigateur). */
export class CorrectionsSupabase implements CorrectionsRepository {
  async demander(c: NouvelleCorrection) {
    const { data, error } = await clientService().rpc('demander_correction', {
      p_dossier: c.dossierId,
      p_champs: c.champs,
      p_motif: c.motif,
      p_jeton_hash: c.jetonHash,
      p_conseiller: c.conseillerId,
      p_expire_le: c.expireLe,
      p_commentaires: c.commentaires as Json,
    });
    if (error) throw traduire('demander_correction', error);
    const ligne = data?.[0];
    if (!ligne) throw new Error('demander_correction : aucune ligne renvoyée');
    return { correctionId: ligne.correction_id, boucle: ligne.boucle };
  }

  async lire(jetonHash: string): Promise<LectureCorrection> {
    const { data, error } = await clientService().rpc('lire_correction', { p_jeton_hash: jetonHash });
    if (error) throw traduire('lire_correction', error);
    const l = data as unknown as { etat: LectureCorrection['etat']; expire_le?: string } & Record<string, unknown>;
    if (l.etat !== 'valide') return { etat: l.etat };
    return {
      etat: 'valide',
      champs: l.champs as never,
      motif: l.motif as string,
      commentaires: (l.commentaires ?? {}) as never,
      boucle: l.boucle as number,
      expireLe: l.expire_le!,
      demande: l.demande as never,
    };
  }

  async corriger(jetonHash: string, demande: NouvelleDemande) {
    const { data, error } = await clientService().rpc('corriger_demande', {
      p_jeton_hash: jetonHash,
      p_demande: demande as unknown as Json,
    });
    if (error) throw traduire('corriger_demande', error);
    const ligne = data?.[0];
    if (!ligne) throw new Error('corriger_demande : aucune ligne renvoyée');
    // le dossier de la nouvelle version, pour relancer la génération de la fiche (E2.2)
    const { data: version, error: erreurLecture } = await clientService()
      .from('demandes').select('dossier_id').eq('id', ligne.demande_id).single();
    if (erreurLecture) throw new Error(`dossier de la demande corrigée : ${erreurLecture.message}`);
    return { demandeId: ligne.demande_id, version: ligne.version, dossierId: version.dossier_id };
  }

  async boucles(dossierId: string) {
    const { data, error } = await clientService()
      .from('corrections')
      .select('expire_le, utilisee_le')
      .eq('dossier_id', dossierId);
    if (error) throw new Error(`corrections du dossier : ${error.message}`);
    const maintenant = Date.now();
    const ouvert = (data ?? []).find((c) => c.utilisee_le === null && Date.parse(c.expire_le) > maintenant);
    return { faites: data?.length ?? 0, lienOuvertJusquau: ouvert?.expire_le ?? null };
  }
}

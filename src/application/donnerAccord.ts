/**
 * Cas d'usage « donner son accord » (E9.3, ADR-0010). Le conseiller autorise UNE écriture précise :
 * une ligne, au prix revérifié qu'il a sous les yeux. Rien n'est envoyé au simulateur ici : la pose de l'option
 * est E9.4, qui exige cet accord valide, non utilisé et non expiré.
 *
 * La proposition est relue côté serveur par l'appelant : on ne fait jamais confiance à ce que le navigateur envoie,
 * hors le prix affiché, qui sert justement à détecter un changement.
 */
import type { Proposition } from '../../types/dashboard';
import { evaluerAccord, type RefusAccord } from '../domain/accord';
import { DemarcheEnCoursErreur, type AccordsRepository } from '../ports/accords';

export interface DemandeDonnerAccord {
  conseiller: { id: string };
  proposition: Proposition;
  ligneId: string;
  prixAfficheCents: number;
  maintenant?: Date;
}

export type ResultatAccord =
  | { ok: true; option_id: string; prix_accorde_cents: number; accord_expire_le: string }
  | { ok: false; raison: RefusAccord | 'ligne_introuvable' | 'conseiller_non_identifie' };

export async function donnerAccord(repo: AccordsRepository, d: DemandeDonnerAccord): Promise<ResultatAccord> {
  if (!d.conseiller.id.trim()) return { ok: false, raison: 'conseiller_non_identifie' };
  const ligne = d.proposition.lignes.find((l) => l.id === d.ligneId);
  if (!ligne) return { ok: false, raison: 'ligne_introuvable' };

  const maintenant = d.maintenant ?? new Date();
  const verdict = evaluerAccord({
    statutProposition: d.proposition.statut,
    ligne,
    prixAfficheCents: d.prixAfficheCents,
    demarcheEnCours: await repo.demarcheEnCours(ligne.id, maintenant),
    maintenant,
  });
  if (!verdict.ok) return verdict;

  try {
    const { option_id } = await repo.enregistrerAccord({
      dossier_id: d.proposition.dossier_id,
      proposition_id: d.proposition.id,
      ligne_id: ligne.id,
      accord_par: d.conseiller.id,
      accord_le: verdict.accord_le,
      accord_expire_le: verdict.accord_expire_le,
      prix_accorde_cents: verdict.prix_accorde_cents,
    });
    return { ok: true, option_id, prix_accorde_cents: verdict.prix_accorde_cents, accord_expire_le: verdict.accord_expire_le };
  } catch (e) {
    if (e instanceof DemarcheEnCoursErreur) return { ok: false, raison: 'demarche_en_cours' };
    throw e;
  }
}

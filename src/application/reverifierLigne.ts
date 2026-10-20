/**
 * Revérifier une ligne de proposition (E8.4) : le conseiller lance l'agent (E8.3) sur une ligne, le résultat est enregistré
 * dans verifications et s'affiche avec l'écart au prix proposé. L'agent ne reçoit que la prestation, la date et le nombre
 * de participants : ni prix, ni budget, ni donnée du client.
 */
import type { PropositionsLecture, VerificationsEcriture } from '../ports/propositions';
import type { LigneAVerifier, ResultatVerification } from './verifierPrestation';

export type Verificateur = (ligne: LigneAVerifier) => Promise<ResultatVerification>;

export type ResultatReverification =
  | { ok: true; verificationId: string; resultat: ResultatVerification }
  | { ok: false; raison: 'introuvable' };

export async function reverifierLigne(
  deps: { lecture: PropositionsLecture; ecriture: VerificationsEcriture; verifier: Verificateur },
  demande: { propositionId: string; ligneId: string; conseillerId: string },
): Promise<ResultatReverification> {
  const proposition = await deps.lecture.proposition(demande.propositionId);
  const ligne = proposition?.lignes.find((l) => l.id === demande.ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };

  const resultat = await deps.verifier({
    prestation_id: ligne.prestation.id,
    nom: ligne.prestation.nom,
    date: ligne.date,
    participants: ligne.participants,
  });
  const verificationId = await deps.ecriture.enregistrer(ligne.id, demande.conseillerId, resultat);
  return { ok: true, verificationId, resultat };
}

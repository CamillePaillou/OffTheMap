/**
 * Marquer un mail modèle « envoyé » (E5.4) : le conseiller l'a envoyé depuis sa messagerie ; le journal le garde.
 * Pour le rendez-vous, le dossier validé passe en « rendez-vous proposé ». Spécification : docs/specs/mails.md.
 */
import { MODELES_MAIL, type ModeleMail } from '../domain/mails';
import { MailSansObjetErreur, type MailsRepository } from '../ports/mails';

export type ResultatMail = { ok: true } | { ok: false; raison: 'modele_inconnu' | 'sans_objet' };

export async function marquerMailEnvoye(
  repo: MailsRepository,
  e: { dossierId: string; propositionId: string | null; modele: string; conseillerId: string },
): Promise<ResultatMail> {
  if (!(MODELES_MAIL as readonly string[]).includes(e.modele)) return { ok: false, raison: 'modele_inconnu' };
  const modele = e.modele as ModeleMail;
  // proposition et confirmation portent sur une proposition ; rendez-vous et correction sur le dossier
  const propositionId = modele === 'proposition' || modele === 'confirmation' ? e.propositionId : null;
  if ((modele === 'proposition' || modele === 'confirmation') && !propositionId) return { ok: false, raison: 'sans_objet' };
  try {
    await repo.marquerEnvoye({ dossierId: e.dossierId, propositionId, modele, conseillerId: e.conseillerId });
  } catch (err) {
    if (err instanceof MailSansObjetErreur) return { ok: false, raison: 'sans_objet' };
    throw err;
  }
  return { ok: true };
}

/** Port du journal des mails (E5.4). L'adaptateur PostgreSQL appelle la fonction SQL marquer_mail_envoye. */
import type { ModeleMail } from '../domain/mails';

/** Le modèle n'a pas de sens à ce moment du dossier (OT010). */
export class MailSansObjetErreur extends Error {}

export interface MailsRepository {
  marquerEnvoye(e: { dossierId: string; propositionId: string | null; modele: ModeleMail; conseillerId: string }): Promise<void>;
}

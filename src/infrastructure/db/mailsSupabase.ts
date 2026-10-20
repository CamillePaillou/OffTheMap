import 'server-only';
import { clientService } from '../../../lib/supabase/service';
import type { ModeleMail } from '../../domain/mails';
import { MailSansObjetErreur, type MailsRepository } from '../../ports/mails';

/** Journal des mails par la fonction SQL marquer_mail_envoye, avec la clé service_role, après exigerConseiller(). */
export class MailsSupabase implements MailsRepository {
  async marquerEnvoye(e: { dossierId: string; propositionId: string | null; modele: ModeleMail; conseillerId: string }) {
    const { error } = await clientService().rpc('marquer_mail_envoye', {
      p_dossier: e.dossierId,
      p_proposition: e.propositionId,
      p_modele: e.modele,
      p_conseiller: e.conseillerId,
    });
    if (error?.code === 'OT010' || error?.code === 'OT001') throw new MailSansObjetErreur(error.message);
    if (error) throw new Error(`marquer_mail_envoye : ${error.message}`);
  }
}

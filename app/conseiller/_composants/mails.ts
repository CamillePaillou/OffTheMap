'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { marquerMailEnvoye } from '@/src/application/mails';
import { MailsSupabase } from '@/src/infrastructure/db/mailsSupabase';

export interface EtatMail {
  envoye?: boolean;
  erreur?: string;
}

/** « Marquer comme envoyé » : le conseiller a envoyé le mail depuis sa messagerie (E5.4). */
export async function marquerEnvoye(dossierId: string, propositionId: string | null, modele: string): Promise<EtatMail> {
  const { id } = await exigerConseiller(`/conseiller/dossiers/${dossierId}`);
  const r = await marquerMailEnvoye(new MailsSupabase(), { dossierId, propositionId, modele, conseillerId: id });
  if (!r.ok) return { erreur: 'Ce mail ne correspond plus à l’étape du dossier : rechargez la page.' };
  refresh();
  return { envoye: true };
}

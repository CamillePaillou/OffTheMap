import 'server-only';
import type { LigneMail, Sejour } from '@/src/domain/mails';
import type { DetailDossier, Proposition } from '@/types/dashboard';

/** Données des mails modèles (E5.4) tirées des payloads du dashboard : rien d'autre que ce qui s'affiche déjà. */
export function sejourDe(d: DetailDossier, conseiller: string): Sejour {
  return {
    nom: d.demande.client.nom,
    destination: d.demande.destination,
    date_debut: d.demande.dates.debut,
    date_fin: d.demande.dates.fin,
    conseiller,
  };
}

export function lignesPourMail(p: Proposition): LigneMail[] {
  return p.lignes.map((l) => ({
    nom: l.prestation.nom,
    date: l.date,
    participants: l.participants,
    statut: l.statut,
    prix_confirme_cents: l.prix_confirme?.montant_cents ?? null,
  }));
}

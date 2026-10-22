/**
 * Être rappelé quand un client ne répond pas (E6.4). Spécification : docs/specs/rappels.md.
 *
 * Sans tâche planifiée (ADR-0005 : tout tourne dans le conteneur de l'application), les rappels sont posés par le code
 * à l'ouverture de l'espace conseiller : chaque proposition envoyée depuis 3 jours sans réponse passe en sans_reponse
 * avec un rappel J+3 au journal, puis reçoit un rappel J+7, puis un rappel J+14 qui propose l'abandon du dossier
 * (E6.5, confirmé par le conseiller : abandonDossier.ts). Le conseiller relance lui-même le client ; aucun mail
 * ne part de l'application.
 */
import { rappelDu, type JourRappel } from '../domain/rappels';
import { verifierTransition } from '../domain/transition';
import { RappelConcurrentErreur, type RappelsRepository } from '../ports/rappels';

export interface RappelFait {
  propositionId: string;
  jour: JourRappel;
}

export async function rappelerSansReponse(repo: RappelsRepository, maintenant: Date = new Date()): Promise<RappelFait[]> {
  const faits: RappelFait[] = [];
  for (const p of await repo.enAttente()) {
    const jour = rappelDu(p.envoyee_le, p.rappels, maintenant);
    if (jour === null) continue;
    // la matrice fait foi : au premier rappel, envoyee → sans_reponse (système)
    if (p.statut === 'envoyee' && !verifierTransition('proposition', 'envoyee', 'sans_reponse', { type: 'systeme' }).ok) continue;
    try {
      await repo.enregistrerRappel(p.id, jour);
      faits.push({ propositionId: p.id, jour });
    } catch (e) {
      // réponse du client enregistrée, ou rappel posé par un autre écran, entre-temps : rien à faire
      if (!(e instanceof RappelConcurrentErreur)) throw e;
    }
  }
  return faits;
}

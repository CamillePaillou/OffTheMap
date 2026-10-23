/**
 * Dépôt des rappels en mémoire, pour les tests. Même contrat que la fonction SQL enregistrer_rappel :
 * au premier rappel, statut et rappel écrits ensemble ; refus si la proposition n'attend plus de réponse ou si
 * le rappel (ou un plus tardif) existe déjà.
 */
import { joursDepuis, type JourRappel } from '../../domain/rappels';
import { RappelConcurrentErreur, type PropositionEnAttente, type RappelsRepository } from '../../ports/rappels';

export interface PropositionEnMemoire {
  statut: string;
  envoyee_le: string | null;
  rappels: number[];
}

export class RappelsEnMemoire implements RappelsRepository {
  readonly propositions = new Map<string, PropositionEnMemoire>();
  readonly journal: string[] = [];

  constructor(private readonly maintenant: () => Date = () => new Date()) {}

  async enAttente(): Promise<PropositionEnAttente[]> {
    return [...this.propositions]
      .filter(([, p]) => (p.statut === 'envoyee' || p.statut === 'sans_reponse') && p.envoyee_le !== null)
      .map(([id, p]) => ({ id, statut: p.statut as PropositionEnAttente['statut'], envoyee_le: p.envoyee_le!, rappels: [...p.rappels] }));
  }

  async enregistrerRappel(propositionId: string, jour: JourRappel) {
    const p = this.propositions.get(propositionId);
    if (!p) throw new Error(`proposition introuvable : ${propositionId}`);
    if (p.statut !== 'envoyee' && p.statut !== 'sans_reponse') throw new RappelConcurrentErreur(`statut ${p.statut}`);
    if (p.envoyee_le === null || joursDepuis(p.envoyee_le, this.maintenant()) < jour) throw new Error(`rappel J+${jour} avant son jour`);
    if (p.rappels.some((r) => r >= jour)) throw new RappelConcurrentErreur(`rappel J+${jour} déjà fait`);
    if (p.statut === 'envoyee') {
      p.statut = 'sans_reponse';
      this.journal.push(`${propositionId}:envoyee>sans_reponse`);
    }
    p.rappels.push(jour);
    this.journal.push(`${propositionId}:rappel J+${jour}`);
  }
}

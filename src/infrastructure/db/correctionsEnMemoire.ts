/** Liens de correction en mémoire, pour les tests. Mêmes règles que les fonctions SQL (E1.2). */
import { randomUUID } from 'node:crypto';
import type { NouvelleDemande } from '../../../types/demande';
import {
  BouclesEpuiseesErreur,
  DossierPasACorrigerErreur,
  LienInvalideErreur,
  type CorrectionsRepository,
  type LectureCorrection,
  type NouvelleCorrection,
  type VersionDemande,
} from '../../ports/corrections';

interface Version {
  id: string;
  version: number;
  remplacee: boolean;
  valeurs: VersionDemande;
}
interface Lien extends NouvelleCorrection {
  id: string;
  boucle: number;
  demandeId: string;
  utilisee: boolean;
}

export class CorrectionsEnMemoire implements CorrectionsRepository {
  readonly dossiers = new Map<string, { statut: string; versions: Version[] }>();
  readonly liens: Lien[] = [];
  readonly journal: { dossierId: string; ancien: string; nouveau: string }[] = [];

  constructor(private readonly maintenant: () => Date = () => new Date()) {}

  /** Prépare un dossier à corriger avec sa version 1. */
  ajouterDossier(dossierId: string, demande: VersionDemande, statut = 'a_corriger') {
    this.dossiers.set(dossierId, { statut, versions: [{ id: randomUUID(), version: 1, remplacee: false, valeurs: demande }] });
  }

  async demander(c: NouvelleCorrection) {
    const dossier = this.dossiers.get(c.dossierId);
    if (!dossier || dossier.statut !== 'a_corriger') throw new DossierPasACorrigerErreur(c.dossierId);
    const boucle = this.liens.filter((l) => l.dossierId === c.dossierId).length + 1;
    if (boucle > 2) throw new BouclesEpuiseesErreur(c.dossierId);
    const courante = dossier.versions.find((v) => !v.remplacee)!;
    for (const l of this.liens) if (l.dossierId === c.dossierId && !l.utilisee) l.expireLe = this.maintenant().toISOString();
    const lien: Lien = { ...c, id: randomUUID(), boucle, demandeId: courante.id, utilisee: false };
    this.liens.push(lien);
    return { correctionId: lien.id, boucle };
  }

  async lire(jetonHash: string): Promise<LectureCorrection> {
    const lien = this.liens.find((l) => l.jetonHash === jetonHash);
    if (!lien) return { etat: 'inconnu' };
    if (lien.utilisee) return { etat: 'utilise' };
    if (Date.parse(lien.expireLe) <= this.maintenant().getTime()) return { etat: 'expire' };
    const dossier = this.dossiers.get(lien.dossierId)!;
    const version = dossier.versions.find((v) => v.id === lien.demandeId)!;
    if (dossier.statut !== 'a_corriger' || version.remplacee) return { etat: 'clos' };
    return { etat: 'valide', champs: lien.champs, motif: lien.motif, commentaires: lien.commentaires, boucle: lien.boucle, expireLe: lien.expireLe, demande: version.valeurs };
  }

  async corriger(jetonHash: string, demande: NouvelleDemande) {
    if ((await this.lire(jetonHash)).etat !== 'valide') throw new LienInvalideErreur();
    const lien = this.liens.find((l) => l.jetonHash === jetonHash)!;
    const dossier = this.dossiers.get(lien.dossierId)!;
    const precedente = dossier.versions.find((v) => v.id === lien.demandeId)!;
    const nouvelle: Version = { id: randomUUID(), version: precedente.version + 1, remplacee: false, valeurs: demande };
    precedente.remplacee = true;
    dossier.versions.push(nouvelle);
    lien.utilisee = true;
    this.journal.push({ dossierId: lien.dossierId, ancien: dossier.statut, nouveau: 'fiche_en_cours' });
    dossier.statut = 'fiche_en_cours';
    return { demandeId: nouvelle.id, version: nouvelle.version };
  }
}

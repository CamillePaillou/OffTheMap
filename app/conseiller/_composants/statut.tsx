import type { StatutDossier } from '@/types/enums';
import { Ligne } from '../../_composants/ligne';
import { STATUT_DOSSIER } from './libelles';

/**
 * Les dossiers regroupés par ce que le conseiller doit en faire. Sert aux compteurs de la liste et à la couleur des
 * pastilles : la couleur suit le groupe, le libellé exact reste écrit (jamais la couleur seule).
 */
export const GROUPES = [
  { id: 'a_trier', libelle: 'À trier', statuts: ['nouvelle', 'fiche_en_cours', 'fiche_prete', 'erreur'], ton: 'bg-[#fff1e0] text-[#8a3d00] ring-[#f5c38f]' },
  { id: 'attente_client', libelle: 'En attente du client', statuts: ['a_corriger', 'rdv_propose'], ton: 'bg-amber-50 text-amber-900 ring-amber-200' },
  { id: 'en_cours', libelle: 'En cours', statuts: ['validee', 'entretien_fait', 'en_proposition'], ton: 'bg-ciel text-nuit ring-[#bcd8ea]' },
  { id: 'clos', libelle: 'Clos', statuts: ['gagnee', 'refusee', 'abandonnee'], ton: 'bg-[#eef1f3] text-doux ring-filet' },
] as const satisfies readonly { id: string; libelle: string; statuts: readonly StatutDossier[]; ton: string }[];

export const groupeDe = (s: StatutDossier) => GROUPES.find((g) => (g.statuts as readonly string[]).includes(s))!;

export function PastilleStatut({ statut }: { statut: StatutDossier }) {
  const g = groupeDe(statut);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset ${g.ton}`}>
      {statut === 'erreur' && <span aria-hidden className="size-2 rounded-full bg-red-600" />}
      {STATUT_DOSSIER[statut]}
    </span>
  );
}

const STATIONS = [{ libelle: 'Demande reçue' }, { libelle: 'Tri' }, { libelle: 'Entretien' }, { libelle: 'Proposition' }, { libelle: 'Gagné' }];
const POSITION: Partial<Record<StatutDossier, number>> = {
  nouvelle: 1, fiche_en_cours: 1, fiche_prete: 1, erreur: 1, a_corriger: 1,
  validee: 2, rdv_propose: 2,
  entretien_fait: 3, en_proposition: 3,
  gagnee: 4,
};

/** Où en est le dossier, sur la ligne. Un dossier refusé ou abandonné sort de la ligne : on le dit en clair. */
export function LigneDossier({ statut }: { statut: StatutDossier }) {
  const position = POSITION[statut];
  if (position === undefined)
    return <p className="rounded-lg bg-[#eef1f3] px-4 py-3 text-doux">Dossier clos : {STATUT_DOSSIER[statut].toLowerCase()}.</p>;
  return <Ligne titre="Avancement du dossier" stations={STATIONS} actuelle={position} compacte />;
}

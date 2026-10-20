import type { StatutDossier, StatutProposition } from '@/types/enums';
import { STATUT_DOSSIER } from './libelles';

/**
 * Les dossiers regroupés par ce que le conseiller doit en faire. Sert aux compteurs de la liste et à la couleur des
 * pastilles : la couleur suit le groupe, le libellé exact reste écrit (jamais la couleur seule).
 */
export const GROUPES = [
  { id: 'a_trier', libelle: 'À trier', statuts: ['nouvelle', 'fiche_en_cours', 'fiche_prete', 'erreur'], ton: 'bg-pervenche-pale text-pervenche-fonce' },
  { id: 'attente_client', libelle: 'En attente du client', statuts: ['a_corriger', 'rdv_propose'], ton: 'bg-miel-pale text-miel-fonce' },
  { id: 'en_cours', libelle: 'En cours', statuts: ['validee', 'entretien_fait', 'en_proposition'], ton: 'bg-pervenche-pale text-pervenche-fonce' },
  { id: 'clos', libelle: 'Clos', statuts: ['gagnee', 'refusee', 'abandonnee'], ton: 'bg-brume text-ardoise' },
] as const satisfies readonly { id: string; libelle: string; statuts: readonly StatutDossier[]; ton: string }[];

export const groupeDe = (s: StatutDossier) => GROUPES.find((g) => (g.statuts as readonly string[]).includes(s))!;

export function PastilleStatut({ statut }: { statut: StatutDossier }) {
  const g = groupeDe(statut);
  return (
    <span className={`bo-puce ${statut === 'erreur' ? 'bg-grenade-pale text-grenade' : statut === 'gagnee' ? 'bg-sauge-pale text-sauge' : g.ton}`}>
      {STATUT_DOSSIER[statut]}
    </span>
  );
}

const ETAPES_DOSSIER = ['Demande', 'Tri', 'Entretien', 'Proposition', 'Gagné'] as const;
const POSITION: Partial<Record<StatutDossier, number>> = {
  nouvelle: 1, fiche_en_cours: 1, fiche_prete: 1, erreur: 1, a_corriger: 1,
  validee: 2, rdv_propose: 2,
  entretien_fait: 3, en_proposition: 3,
  gagnee: 4,
};

/**
 * Avancement du dossier en cinq étapes : un trait qui se remplit (il glisse quand l'étape change), un point par étape.
 * Un dossier refusé ou abandonné sort du parcours : on le dit en clair.
 */
export function Avancement({ statut }: { statut: StatutDossier }) {
  const position = POSITION[statut];
  if (position === undefined)
    return <p className="rounded-[14px] bg-brume px-4 py-3 text-ardoise">Dossier clos : {STATUT_DOSSIER[statut].toLowerCase()}.</p>;
  // points et libellés placés au même pourcentage : chaque libellé est sous son point (sur téléphone, l'étape actuelle seule)
  const place = (i: number) => (i === 0 ? 'translate-x-0' : i === 4 ? '-translate-x-full' : '-translate-x-1/2');
  return (
    <div>
      <div aria-hidden className="relative h-[18px]">
        <div className="absolute inset-x-0 top-2 h-0.5 bg-trait" />
        <div className="bo-glisse absolute left-0 top-2 h-0.5 bg-pervenche" style={{ width: `${(position / 4) * 100}%` }} />
        {ETAPES_DOSSIER.map((e, i) => (
          <span
            key={e}
            style={{ left: `${(i / 4) * 100}%` }}
            className={`bo-glisse absolute top-1/2 box-border -translate-y-1/2 rounded-full border-[3px] ${place(i)} ${i === position ? 'size-[18px] border-pervenche bg-white' : i < position ? 'size-3 border-pervenche bg-pervenche' : 'size-3 border-trait bg-white'}`}
          />
        ))}
      </div>
      <ol aria-label="Avancement du dossier" className="relative mt-2 h-5 text-[13px]">
        {ETAPES_DOSSIER.map((e, i) => (
          <li
            key={e}
            aria-current={i === position ? 'step' : undefined}
            style={{ left: `${(i / 4) * 100}%` }}
            className={`absolute top-0 whitespace-nowrap ${place(i)} ${i === position ? 'font-semibold text-pervenche-fonce' : 'hidden text-ardoise sm:block'}`}
          >
            {e}
            <span className="sr-only">{i < position ? ' (fait)' : i === position ? ' (étape actuelle)' : ' (à venir)'}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Photo de la destination (celles du site), sinon rien : l'écran affiche alors une vignette neutre. */
export function photoDestination(destination: string | null): string | null {
  const ville = (destination ?? '').trim().toLowerCase();
  return ville === 'nantes' || ville === 'lyon' || ville === 'lille' ? `/detour/${ville}.jpg` : null;
}

/** Qui doit agir pour que le dossier avance. */
export type Acteur = 'conseiller' | 'client' | 'systeme' | null;

export interface Etape {
  texte: string;
  acteur: Acteur;
}

/**
 * Prochaine étape d'un dossier, d'après son statut et celui de sa dernière proposition (types/transitions.ts).
 * C'est ce que la liste et la fiche affichent pour dire « à vous de jouer » ou « on attend le client ».
 */
export function prochaineEtape(
  statut: StatutDossier,
  proposition?: { statut: StatutProposition; lignes_a_verifier?: number } | null,
): Etape {
  switch (statut) {
    case 'nouvelle':
    case 'fiche_en_cours':
      return { texte: 'Fiche en préparation', acteur: 'systeme' };
    case 'erreur':
      return { texte: 'Relancer la fiche', acteur: 'conseiller' };
    case 'fiche_prete':
      return { texte: 'Trier la demande', acteur: 'conseiller' };
    case 'a_corriger':
      return { texte: 'Attendre la correction', acteur: 'client' };
    case 'validee':
      return { texte: 'Proposer un rendez-vous', acteur: 'conseiller' };
    case 'rdv_propose':
      return { texte: 'Faire l’entretien', acteur: 'conseiller' };
    case 'entretien_fait':
      return { texte: 'Générer le brouillon', acteur: 'conseiller' };
    case 'en_proposition':
      return etapeProposition(proposition);
    case 'gagnee':
    case 'refusee':
    case 'abandonnee':
      return { texte: 'Aucune', acteur: null };
  }
}

function etapeProposition(p?: { statut: StatutProposition; lignes_a_verifier?: number } | null): Etape {
  if (!p) return { texte: 'Générer le brouillon', acteur: 'conseiller' };
  switch (p.statut) {
    case 'brouillon_en_cours':
      return { texte: 'Brouillon en préparation', acteur: 'systeme' };
    case 'erreur':
      return { texte: 'Relancer le brouillon', acteur: 'conseiller' };
    case 'brouillon_pret':
    case 'a_verifier': {
      const n = p.lignes_a_verifier ?? 0;
      return { texte: n > 0 ? `Vérifier ${n} prix` : 'Vérifier les prix', acteur: 'conseiller' };
    }
    case 'prete':
      return { texte: 'Envoyer la proposition', acteur: 'conseiller' };
    case 'envoyee':
    case 'sans_reponse':
      return { texte: 'Attendre la réponse', acteur: 'client' };
    case 'changement_demande':
      return { texte: 'Nouvelle version en préparation', acteur: 'systeme' }; // E6.1 : la version suivante est créée aussitôt
    case 'acceptee':
      return { texte: 'Vérifier le dépôt de garantie', acteur: 'conseiller' };
    case 'depot_recu':
      return { texte: 'Poser les options', acteur: 'conseiller' };
    case 'reservee':
      return { texte: 'Envoyer la confirmation', acteur: 'conseiller' };
    case 'remplacee':
      return { texte: 'Ouvrir la dernière version', acteur: 'conseiller' };
  }
}

const ACTEUR: Record<Exclude<Acteur, null>, { libelle: string; ton: string }> = {
  conseiller: { libelle: 'À vous', ton: 'bg-pervenche-pale text-pervenche-fonce' },
  client: { libelle: 'Client', ton: 'bg-miel-pale text-miel-fonce' },
  systeme: { libelle: 'Auto', ton: 'bg-brume text-ardoise' },
};

/** La pastille seule : « À vous », « Client » ou « Auto ». */
export function PastilleActeur({ acteur }: { acteur: Acteur }) {
  if (!acteur) return null;
  const a = ACTEUR[acteur];
  return <span className={`bo-puce ${a.ton}`}>{a.libelle}</span>;
}

/** « À vous · Trier la demande » : qui agit, puis quoi. */
export function ProchaineEtape({ etape }: { etape: Etape }) {
  if (!etape.acteur) return <span className="text-ardoise">—</span>;
  const a = ACTEUR[etape.acteur];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`bo-puce ${a.ton}`}>{a.libelle}</span>
      <span className={etape.acteur === 'conseiller' ? 'font-semibold text-encre' : 'text-ardoise'}>{etape.texte}</span>
    </span>
  );
}

/** Jours avant le départ, à la date de Paris. Négatif si le départ est passé. */
export function joursAvantDepart(dateDebut: string, maintenant = new Date()): number {
  const aujourdhui = maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
  return Math.round((Date.parse(`${dateDebut}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);
}

/** « dans 12 j » ; en miel sous 15 jours pour un dossier encore ouvert : le temps de réserver se réduit. */
export const texteDepart = (jours: number, long = false) =>
  jours < 0 ? 'départ passé' : jours === 0 ? 'aujourd’hui' : long ? `dans ${jours} jour${jours > 1 ? 's' : ''}` : `dans ${jours} j`;

export function Depart({ jours, ouvert, long = false }: { jours: number; ouvert: boolean; long?: boolean }) {
  const proche = ouvert && jours >= 0 && jours < 15;
  return <span className={proche ? 'font-semibold text-miel-fonce' : ''}>{texteDepart(jours, long)}</span>;
}

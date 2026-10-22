'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { StatutDossier } from '@/types/enums';
import { PastilleStatut } from './statut';

export interface ElementListe {
  id: string;
  nom: string;
  destination: string | null;
  photo: string | null;
  etape: string;
  statut: StatutDossier;
  groupe: 'traiter' | 'attente' | 'clos';
  depart: string;
  proche: boolean;
  jours: number;
}

const ONGLETS = [
  { id: 'traiter', libelle: 'À traiter' },
  { id: 'attente', libelle: 'En attente' },
  { id: 'tous', libelle: 'Tous' },
] as const;
type Onglet = (typeof ONGLETS)[number]['id'];

/** Liste des dossiers : onglets, recherche, et le dossier ouvert surligné. */
export function ListeClient({ elements, total }: { elements: ElementListe[]; total: number }) {
  const chemin = usePathname();
  const [onglet, setOnglet] = useState<Onglet>(elements.some((e) => e.groupe === 'traiter') ? 'traiter' : 'tous');
  const [recherche, setRecherche] = useState('');
  const n = (o: Onglet) => elements.filter((e) => o === 'tous' || e.groupe === o).length;
  const cle = recherche.trim().toLocaleLowerCase('fr');
  const visibles = elements
    .filter((e) => (cle ? true : onglet === 'tous' || e.groupe === onglet))
    .filter((e) => !cle || e.nom.toLocaleLowerCase('fr').includes(cle) || (e.destination ?? '').toLocaleLowerCase('fr').includes(cle));
  const aTraiter = n('traiter');

  return (
    <div className="flex flex-col gap-4 px-3.5 py-6">
      <div className="px-2.5">
        <h1 className="text-2xl">Dossiers</h1>
        <p className="mt-1 text-encre-doux">
          {total === 0 ? 'Aucun dossier pour l’instant' : aTraiter === 0 ? 'Rien ne vous attend' : `${aTraiter} ${aTraiter > 1 ? 'attendent' : 'attend'} votre réponse`}
        </p>
      </div>

      <label className="mx-1.5 flex items-center gap-2.5 rounded-xl bg-craie px-3.5 py-2.5 text-encre-doux">
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="sr-only">Rechercher un client ou une destination</span>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Client ou destination"
          className="min-w-0 flex-1 bg-transparent text-encre outline-none placeholder:text-encre-doux"
        />
      </label>

      {!cle && (
        <div role="tablist" aria-label="Filtrer les dossiers" className="mx-1.5 flex gap-1 rounded-xl bg-craie p-1">
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="tab"
                aria-selected={actif}
                onClick={() => setOnglet(o.id)}
                className={`flex-1 rounded-[9px] px-1 py-1.5 transition-[background-color,box-shadow,color] duration-200 ${actif ? 'bg-carte font-semibold text-encre shadow-[0_1px_2px_rgb(22_35_63/0.08)]' : 'text-encre-doux hover:text-encre'}`}
              >
                {o.libelle} <span className="font-normal text-encre-doux">{n(o.id)}</span>
              </button>
            );
          })}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="mx-2.5 rounded-[14px] bg-craie p-4 text-sm text-encre-doux">
          {cle ? `Aucun dossier pour « ${recherche.trim()} ».` : onglet === 'traiter' ? 'Rien à traiter : tout avance.' : 'Aucun dossier ici.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {visibles.map((e) => {
            const courant = chemin === `/conseiller/dossiers/${e.id}`;
            // un dossier clos s'efface, sauf sa pastille : atténuée, elle passerait sous 4,5:1
            const attenue = e.groupe === 'clos' ? 'opacity-70' : '';
            return (
              <li key={e.id}>
                <Link
                  href={`/conseiller/dossiers/${e.id}`}
                  aria-current={courant ? 'page' : undefined}
                  className={`flex gap-3 rounded-[14px] p-3 text-encre! no-underline transition-colors duration-200 ${courant ? 'bg-ciel-pale' : 'hover:bg-craie'}`}
                >
                  {e.photo ? (
                    <Image src={e.photo} alt="" width={88} height={88} className={`size-11 shrink-0 rounded-xl object-cover ${attenue}`} />
                  ) : (
                    <span aria-hidden className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-ciel-pale font-semibold text-encre-doux ${attenue}`}>
                      {e.nom.charAt(0)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`flex justify-between gap-2 ${attenue}`}>
                      <span className="truncate font-semibold">{e.nom}</span>
                      <span className={`shrink-0 text-[13px] ${e.proche ? 'font-semibold text-brique-texte' : 'text-encre-doux'}`}>{e.depart}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-sm text-encre-doux ${attenue}`}>
                        {e.destination ?? 'Destination à proposer'} · {e.etape}
                      </span>
                      <PastilleStatut statut={e.statut} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {total > elements.length && <p className="px-2.5 text-[13px] text-encre-doux">Les {elements.length} dossiers les plus récents sur {total}.</p>}
    </div>
  );
}

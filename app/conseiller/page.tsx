import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { deconnecter } from '../connexion/actions';
import { ETAT_FICHE, euros, jour } from './_composants/libelles';
import { GROUPES, groupeDe, PastilleStatut } from './_composants/statut';

export const metadata: Metadata = { title: 'Dossiers' };

const PAR_PAGE = 50;

// Back-office des conseillers (P2). Sans connexion, le proxy et exigerConseiller() renvoient vers /connexion.
export default function ConseillerPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<p className="text-doux">Chargement des dossiers…</p>}>
        <Contenu />
      </Suspense>
    </main>
  );
}

async function Contenu() {
  const conseiller = await exigerConseiller();
  const dossiers = await new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 });
  const compte = Object.fromEntries(GROUPES.map((g) => [g.id, dossiers.items.filter((d) => groupeDe(d.statut).id === g.id).length]));
  const partiel = dossiers.total > dossiers.items.length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">Dossiers</h1>
          <p className="mt-1 text-doux">
            Bonjour {conseiller.nomAffiche}. {dossiers.total === 0 ? 'Aucun dossier pour l’instant.' : `${dossiers.total} dossier${dossiers.total > 1 ? 's' : ''} au total.`}
          </p>
        </div>
        <form action={deconnecter}>
          <button type="submit" className="rounded-md px-3 py-2 text-sm text-doux underline underline-offset-4 hover:bg-ciel">
            Se déconnecter
          </button>
        </form>
      </div>

      {dossiers.items.length > 0 && (
        <>
          <ul aria-label={partiel ? `Répartition des ${dossiers.items.length} dossiers affichés` : 'Répartition des dossiers'} className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {GROUPES.map((g) => (
              <li key={g.id} className={`panneau flex flex-col px-4 py-3 ${g.id === 'a_trier' && compte[g.id] ? 'border-l-4 border-l-orange' : ''}`}>
                <span className="font-titre text-3xl font-semibold text-nuit">{compte[g.id]}</span>
                <span className="text-sm text-doux">{g.libelle}</span>
              </li>
            ))}
          </ul>

          <div className="panneau mt-6 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">Dossiers, du plus récent au plus ancien</caption>
              <thead className="bg-fond text-doux">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Destination</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Dates</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Voyageurs</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Budget annoncé</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fiche</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-filet">
                {dossiers.items.map((d) => (
                  <tr key={d.dossier_id} className="hover:bg-ciel/60">
                    <td className="px-4 py-3">
                      <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="font-semibold underline-offset-4 hover:underline">
                        {d.client.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{d.demande.destination ?? <span className="italic text-doux">à proposer</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {jour(d.demande.date_debut)} → {jour(d.demande.date_fin)}
                    </td>
                    <td className="px-4 py-3 text-right">{d.demande.voyageurs}</td>
                    <td className="px-4 py-3 text-right">{d.demande.budget_annonce ? euros(d.demande.budget_annonce.montant_cents) : <span className="text-doux">—</span>}</td>
                    <td className="px-4 py-3"><PastilleStatut statut={d.statut} /></td>
                    <td className={`px-4 py-3 ${d.fiche?.etat === 'erreur' ? 'font-semibold text-red-700' : 'text-doux'}`}>
                      {d.fiche ? ETAT_FICHE[d.fiche.etat] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {partiel && (
            <p className="mt-3 text-sm text-doux">
              Les {dossiers.items.length} dossiers les plus récents sur {dossiers.total}, compteurs compris.
            </p>
          )}
        </>
      )}
    </>
  );
}

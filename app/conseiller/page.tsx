import Link from 'next/link';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { rappelerSansReponse } from '@/src/application/rappels';
import { joursDepuis } from '@/src/domain/rappels';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { RappelsSupabase } from '@/src/infrastructure/db/rappelsSupabase';
import { deconnecter } from '../connexion/actions';
import { ETAT_FICHE, STATUT_DOSSIER, euros, instantParis, jour } from './_composants/libelles';

const PAR_PAGE = 50;

// Back-office des conseillers (P2). Sans connexion, le proxy et exigerConseiller() renvoient vers /connexion.
export default function ConseillerPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-24">
      <h1 className="text-2xl font-semibold">Espace conseiller</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-600">Chargement…</p>}>
        <Contenu />
      </Suspense>
    </main>
  );
}

async function Contenu() {
  const conseiller = await exigerConseiller();
  // E6.4 : sans tâche planifiée, les rappels dus (J+3, J+7) sont posés à l'ouverture de l'espace conseiller
  const rappels = new RappelsSupabase();
  const maintenant = new Date();
  await rappelerSansReponse(rappels, maintenant);
  const [dossiers, aRelancer] = await Promise.all([new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 }), rappels.aRelancer()]);
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-zinc-600">Connecté en tant que {conseiller.nomAffiche}.</p>
        <form action={deconnecter}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </div>

      {aRelancer.length > 0 && (
        <section className="mt-10 rounded border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <h2 className="text-lg font-semibold">Clients à relancer ({aRelancer.length})</h2>
          <p className="mt-1 text-sm">Propositions envoyées restées sans réponse : relancez le client, puis enregistrez sa réponse.</p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {aRelancer.map((p) => (
              <li key={p.proposition_id}>
                <Link href={`/conseiller/propositions/${p.proposition_id}`} className="font-medium underline underline-offset-4">
                  {p.client_nom} · proposition v{p.version}
                </Link>{' '}
                · envoyée le {instantParis(p.envoyee_le)}, il y a {joursDepuis(p.envoyee_le, maintenant)} jours · rappel J+{p.dernier_rappel}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-lg font-semibold">Dossiers ({dossiers.total})</h2>
      {dossiers.items.length === 0 ? (
        <p className="mt-2 text-zinc-600">Aucun dossier pour l’instant.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-300 text-zinc-600">
              <tr>
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Destination</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
                <th className="py-2 pr-4 text-right font-medium">Voyageurs</th>
                <th className="py-2 pr-4 text-right font-medium">Budget annoncé</th>
                <th className="py-2 pr-4 font-medium">Statut</th>
                <th className="py-2 font-medium">Fiche</th>
              </tr>
            </thead>
            <tbody>
              {dossiers.items.map((d) => (
                <tr key={d.dossier_id} className="border-b border-zinc-200">
                  <td className="py-3 pr-4">
                    <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="underline underline-offset-4">
                      {d.client.nom}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">{d.demande.destination ?? <span className="text-zinc-500">aucune idée</span>}</td>
                  <td className="py-3 pr-4">
                    {jour(d.demande.date_debut)} → {jour(d.demande.date_fin)}
                  </td>
                  <td className="py-3 pr-4 text-right">{d.demande.voyageurs}</td>
                  <td className="py-3 pr-4 text-right">{d.demande.budget_annonce ? euros(d.demande.budget_annonce.montant_cents) : '—'}</td>
                  <td className="py-3 pr-4">{STATUT_DOSSIER[d.statut]}</td>
                  <td className={`py-3 ${d.fiche?.etat === 'erreur' ? 'font-medium text-red-700' : ''}`}>
                    {d.fiche ? ETAT_FICHE[d.fiche.etat] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {dossiers.total > dossiers.items.length && (
            <p className="mt-2 text-sm text-zinc-600">
              {dossiers.items.length} dossiers les plus récents sur {dossiers.total}.
            </p>
          )}
        </div>
      )}
    </>
  );
}

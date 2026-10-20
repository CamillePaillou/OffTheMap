import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { rappelerSansReponse } from '@/src/application/rappels';
import { joursDepuis } from '@/src/domain/rappels';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { jour } from './_composants/libelles';
import { joursAvantDepart, photoDestination, prochaineEtape, texteDepart } from './_composants/statut';

export const metadata: Metadata = { title: 'Dossiers' };
import { RappelsSupabase } from '@/src/infrastructure/db/rappelsSupabase';
import { deconnecter } from '../connexion/actions';
import { ETAT_FICHE, STATUT_DOSSIER, euros, instantParis, jour } from './_composants/libelles';

const PAR_PAGE = 50;

// Accueil de l'espace conseiller (P2). La liste est dans la colonne de gauche (layout) ; ici, la journée en un coup d'œil.
// Sur téléphone, seule la liste s'affiche.
export default function ConseillerPage() {
  return (
    <main className="hidden flex-1 px-9 pt-7 pb-10 lg:block">
      <Suspense fallback={null}>
        <Apercu />
      </Suspense>
    </main>
  );
}

async function Apercu() {
  const conseiller = await exigerConseiller();
  const { items } = await new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 });
  const avecEtape = items.map((d) => ({ d, etape: prochaineEtape(d.statut, d.proposition), jours: joursAvantDepart(d.demande.date_debut) }));
  const aFaire = avecEtape.filter((x) => x.etape.acteur === 'conseiller').sort((a, b) => a.jours - b.jours);
  const enAttente = avecEtape.filter((x) => x.etape.acteur === 'client' || x.etape.acteur === 'systeme').length;
  const departs = avecEtape.filter((x) => x.etape.acteur !== null && x.jours >= 0 && x.jours <= 30).sort((a, b) => a.jours - b.jours);
  const prenom = conseiller.nomAffiche.split(' ')[0];

  // E6.4 : sans tâche planifiée, les rappels dus (J+3, J+7) sont posés à l'ouverture de l'espace conseiller
  const rappels = new RappelsSupabase();
  const maintenant = new Date();
  await rappelerSansReponse(rappels, maintenant);
  const [dossiers, aRelancer] = await Promise.all([new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 }), rappels.aRelancer()]);
  return (
    <div className="bo-entre flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-[32px] leading-tight">Bonjour {prenom}</h2>
        <p className="mt-1 text-ardoise">
          {aFaire.length === 0 ? 'Rien ne vous attend : tout avance.' : `${aFaire.length} dossier${aFaire.length > 1 ? 's attendent' : ' attend'} votre réponse.`}{' '}
          {enAttente > 0 && `${enAttente} avance${enAttente > 1 ? 'nt' : ''} sans vous.`}
        </p>
      </div>

      {aFaire.length > 0 && (
        <section aria-labelledby="titre-afaire" className="bo-carte p-5">
          <h3 id="titre-afaire" className="text-base">À faire</h3>
          <ul className="mt-3 flex flex-col divide-y divide-trait">
            {aFaire.slice(0, 5).map(({ d, etape, jours }) => (
              <li key={d.dossier_id} className="flex items-center gap-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{etape.texte}</span>
                  <span className="truncate text-sm text-ardoise">
                    {d.client.nom} · {d.demande.destination ?? 'destination à proposer'} · {texteDepart(jours)}
                  </span>
                </span>
                <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="bo-btn-2 shrink-0 text-sm">
                  Ouvrir
                </Link>
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

      <section aria-labelledby="titre-departs">
        <h3 id="titre-departs" className="text-base">Départs des 30 prochains jours</h3>
        {departs.length === 0 ? (
          <p className="bo-carte mt-3 p-5 text-ardoise">Aucun départ prévu d’ici un mois.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-4">
            {departs.slice(0, 6).map(({ d, jours }) => {
              const photo = photoDestination(d.demande.destination);
              return (
                <li key={d.dossier_id}>
                  <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="bo-carte group block overflow-hidden text-encre! no-underline">
                    {photo ? (
                      <Image src={photo} alt="" width={400} height={240} className="h-28 w-full object-cover transition-transform duration-500 ease-bo group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex h-28 items-center justify-center bg-[#f1eee8] text-sm text-[#7a5a2a]">Destination à proposer</span>
                    )}
                    <span className="flex flex-col gap-0.5 p-4">
                      <span className="font-semibold">{d.demande.destination ?? 'À proposer'}</span>
                      <span className="text-sm text-ardoise">
                        {d.client.nom} · {jour(d.demande.date_debut)}
                      </span>
                      <span className={`text-sm ${jours < 15 ? 'font-semibold text-miel-fonce' : 'text-ardoise'}`}>{texteDepart(jours, true)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

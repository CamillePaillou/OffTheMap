import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { rappelerSansReponse } from '@/src/application/rappels';
import { JOUR_ABANDON, joursDepuis } from '@/src/domain/rappels';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { RappelsSupabase } from '@/src/infrastructure/db/rappelsSupabase';
import { instantParis, jour } from './_composants/libelles';
import { joursAvantDepart, PastilleStatut, photoDestination, prochaineEtape, texteDepart } from './_composants/statut';

export const metadata: Metadata = { title: 'Dossiers' };

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
  // E6.4 : sans tâche planifiée, les rappels dus (J+3, J+7, J+14 qui propose l'abandon, E6.5) sont posés à l'ouverture de l'espace conseiller,
  // avant de lire la liste, pour qu'elle montre les propositions passées en sans_reponse
  const rappels = new RappelsSupabase();
  const maintenant = new Date();
  await rappelerSansReponse(rappels, maintenant);
  const [{ items }, aRelancer] = await Promise.all([new DossiersSupabase().liste({ limit: PAR_PAGE, offset: 0 }), rappels.aRelancer()]);
  const avecEtape = items.map((d) => ({ d, etape: prochaineEtape(d.statut, d.proposition), jours: joursAvantDepart(d.demande.date_debut) }));
  const aFaire = avecEtape.filter((x) => x.etape.acteur === 'conseiller').sort((a, b) => a.jours - b.jours);
  const enAttente = avecEtape.filter((x) => x.etape.acteur === 'client' || x.etape.acteur === 'systeme').length;
  const departs = avecEtape.filter((x) => x.etape.acteur !== null && x.jours >= 0 && x.jours <= 30).sort((a, b) => a.jours - b.jours);
  const prenom = conseiller.nomAffiche.split(' ')[0];

  return (
    <div className="bo-entre flex max-w-4xl flex-col gap-6">
      <div>
        <h2 className="text-[32px] leading-tight">Bonjour {prenom}</h2>
        <p className="mt-1 text-encre-doux">
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
                  <span className="truncate text-sm text-encre-doux">
                    {d.client.nom} · {d.demande.destination ?? 'destination à proposer'} · {texteDepart(jours)}
                  </span>
                </span>
                <PastilleStatut statut={d.statut} />
                <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="bo-btn-2 shrink-0 text-sm">
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aRelancer.length > 0 && (
        <section aria-labelledby="titre-relancer" className="rounded-[18px] bg-ciel-pale p-5 text-encre">
          <h3 id="titre-relancer" className="text-base text-encre!">Clients à relancer ({aRelancer.length})</h3>
          <p className="mt-1 text-sm">
            Propositions envoyées restées sans réponse : relancez le client, puis enregistrez sa réponse. À J+{JOUR_ABANDON}, vous pouvez
            abandonner le dossier depuis la proposition.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-trait">
            {aRelancer.map((p) => (
              <li key={p.proposition_id} className="flex items-center gap-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">
                    {p.client_nom} · proposition v{p.version}
                  </span>
                  <span className="text-sm">
                    Envoyée le {instantParis(p.envoyee_le)}, il y a {joursDepuis(p.envoyee_le, maintenant)} jours · rappel J+{p.dernier_rappel}
                    {p.dernier_rappel === JOUR_ABANDON && <span className="font-semibold"> · abandon proposé</span>}
                  </span>
                </span>
                <Link href={`/conseiller/propositions/${p.proposition_id}`} className="bo-btn-2 shrink-0 text-sm">
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="titre-departs">
        <h3 id="titre-departs" className="text-base">Départs des 30 prochains jours</h3>
        {departs.length === 0 ? (
          <p className="bo-carte mt-3 p-5 text-encre-doux">Aucun départ prévu d’ici un mois.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-4">
            {departs.slice(0, 6).map(({ d, jours }) => {
              const photo = photoDestination(d.demande.destination);
              return (
                <li key={d.dossier_id}>
                  <Link href={`/conseiller/dossiers/${d.dossier_id}`} className="bo-carte group block overflow-hidden text-encre! no-underline">
                    {photo ? (
                      <Image src={photo} alt="" width={400} height={240} className="h-28 w-full object-cover transition-transform duration-500 ease-detour group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex h-28 items-center justify-center bg-ciel-pale text-sm text-encre-doux">Destination à proposer</span>
                    )}
                    <span className="flex flex-col gap-0.5 p-4">
                      <span className="font-semibold">{d.demande.destination ?? 'À proposer'}</span>
                      <span className="text-sm text-encre-doux">
                        {d.client.nom} · {jour(d.demande.date_debut)}
                      </span>
                      <span className={`text-sm ${jours < 15 ? 'font-semibold text-brique-texte' : 'text-encre-doux'}`}>{texteDepart(jours, true)}</span>
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

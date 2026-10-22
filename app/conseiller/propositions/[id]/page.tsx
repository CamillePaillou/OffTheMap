import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { etatEnvoi } from '@/src/application/tarifs';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { TarifsSupabase } from '@/src/infrastructure/db/tarifsSupabase';
import { Ecart } from '../../_composants/ecart';
import { Fil } from '../../_composants/fil';
import { STATUT_PROPOSITION } from '../../_composants/libelles';
import { resumerProposition } from '@/src/domain/proposition/resumeProposition';
import { comparerVersions } from '@/src/domain/proposition/ecartsVersions';
import { REGLES_CHIFFRAGE } from '@/types/chiffrage';
import { ActionsLigne, PanneauEnvoi } from './actions-tarifs';
import { PanneauChangement } from './panneau-changement';
import { PanneauReponse } from './panneau-reponse';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailProposition, MailImpossibleErreur } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { BoutonRelancerBrouillon, RafraichirPendantGeneration } from './suivi-brouillon';
import { EcartsVersionsCarte } from './ecarts-versions';

const STATUT_LIGNE = { a_verifier: 'à vérifier', confirme: 'confirmé', indisponible: 'indisponible', remplacee: 'remplacée', reservee: 'réservée' } as const;
const HORS_TOTAL: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal; // lignes indisponibles ou remplacées : hors total
const SOURCE = { agent: 'agent', telephone: 'téléphone', mail: 'mail', lien: 'lien' } as const;
const instant = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });

// Proposition : prix proposé, prix revérifié par l'agent et écart (E8.4) ; tarifs confirmés et envoi (E5.1) ;
// remplacement d'une ligne indisponible (E5.2) ; écarts avec la version précédente (E6.2).
export default function PropositionPage({ params }: PageProps<'/conseiller/propositions/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="mt-6 text-ardoise">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<PageProps<'/conseiller/propositions/[id]'>, 'params'>) {
  const { id } = await params;
  const conseiller = await exigerConseiller(`/conseiller/propositions/${id}`);

  const lecture = new PropositionsSupabase();
  const proposition = await lecture.proposition(id);
  if (!proposition) notFound();
  // E5.1 : ce qui bloque l'envoi, recalculé depuis la base (sans rien écrire)
  const tarifs = new TarifsSupabase();
  const chiffrage = await tarifs.lireChiffrage(id);
  const envoi = chiffrage ? etatEnvoi(chiffrage) : null;
  const modifiable = proposition.statut === 'a_verifier' || proposition.statut === 'prete';
  const alertes = modifiable && envoi ? envoi.chiffrage.alertes : proposition.alertes;
  const total = modifiable && envoi ? envoi.chiffrage.total_cents : proposition.total_cents;
  const resume = resumerProposition({ total_cents: total, budget_reference_cents: proposition.budget_reference_cents, alertes });

  // mail de la proposition (E5.4) : seulement une fois envoyée, donc tous ses prix vérifiés (E5.1)
  const envoyee = ['envoyee', 'sans_reponse', 'changement_demande', 'acceptee', 'depot_recu', 'reservee'].includes(proposition.statut);
  const dossier = await new DossiersSupabase().detail(proposition.dossier_id); // nom du client (fil d'Ariane) et mail
  // E6.2 : ce qui a changé depuis la version précédente, recalculé à chaque lecture
  const precedente = proposition.version > 1 ? await lecture.versionDuDossier(proposition.dossier_id, proposition.version - 1) : null;
  const ecartsVersions = precedente ? comparerVersions(precedente, proposition) : null;
  let mail: { sujet: string; corps: string; mailto: string } | null = null;
  if (dossier && envoyee) {
    try {
      const m = mailProposition(sejourDe(dossier, conseiller.nomAffiche), lignesPourMail(proposition));
      mail = { ...m, mailto: lienMailto(dossier.demande.client.email, m) };
    } catch (e) {
      if (!(e instanceof MailImpossibleErreur)) throw e;
    }
  }
  const lignes = await Promise.all(
    proposition.lignes.map(async (ligne) => {
      const verification = await lecture.verificationDeLigne(ligne.id);
      // E5.2 : les prestations de remplacement ne sont cherchées que pour une ligne indisponible
      const remplacantes = modifiable && ligne.statut === 'indisponible' ? await tarifs.prestationsRemplacantes(ligne.id) : [];
      return { ligne, verification, remplacantes, ecart: verification && ecartPrix(ligne, verification) };
    }),
  );

  const comptees = proposition.lignes.filter((l) => l.statut !== 'remplacee');
  const confirmees = comptees.filter((l) => l.statut === 'confirme' || l.statut === 'reservee').length;
  const jauge = resume.budget ? Math.min(resume.budget.part_pourcent, 100) : 0;
  // colonne de droite seulement s'il y a quelque chose à faire : envoyer, ou enregistrer la réponse du client
  const aCote = (modifiable && envoi !== null) || ['envoyee', 'sans_reponse', 'acceptee', 'depot_recu'].includes(proposition.statut);
  const tonJauge = resume.budget?.depasse ? 'bg-grenade' : (resume.budget?.part_pourcent ?? 0) >= 90 ? 'bg-miel' : 'bg-pervenche';

  return (
    <>
      <Fil
        etapes={[
          { libelle: 'Dossiers', href: '/conseiller' },
          { libelle: dossier?.demande.client.nom ?? 'Dossier', href: `/conseiller/dossiers/${proposition.dossier_id}` },
          { libelle: `Proposition v${proposition.version}` },
        ]}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl sm:text-4xl">Proposition, version {proposition.version}</h1>
        <span className="rounded-full bg-pervenche-pale px-2.5 py-0.5 text-sm font-semibold text-encre ring-1 ring-inset ring-transparent">
          {STATUT_PROPOSITION[proposition.statut]}
        </span>
      </div>

      {proposition.statut === 'remplacee' && (
        <p className="mt-6 rounded-[18px] bg-[#eef1f3] p-4 text-sm text-encre">
          Version remplacée après un changement demandé par le client. Elle reste telle qu’elle a été envoyée ; la version suivante est
          dans la{' '}
          <Link href={`/conseiller/dossiers/${proposition.dossier_id}`} className="font-semibold underline underline-offset-4">
            fiche du dossier
          </Link>
          .
        </p>
      )}
      {proposition.statut === 'sans_reponse' && (
        <p role="status" className="mt-6 rounded-[18px] bg-miel-pale p-4 text-sm text-[#5c3d0c]">
          <span className="font-semibold">Sans réponse du client</span> depuis au moins 3 jours après l’envoi. Relancez-le avec le mail de la
          proposition ci-dessous, puis enregistrez son acceptation ou le changement qu’il demande.
        </p>
      )}
      {proposition.motif_changement && (
        <p className="mt-6 rounded-[18px] bg-miel-pale p-4 text-sm text-[#5c3d0c]">
          <span className="font-semibold">Changement demandé par le client :</span> {proposition.motif_changement}
        </p>
      )}
      {ecartsVersions && <EcartsVersionsCarte e={ecartsVersions} />}

      {proposition.statut === 'brouillon_en_cours' && (
        <p role="status" className="bo-carte mt-6 p-4 text-ardoise">
          Brouillon en cours de génération…
          <RafraichirPendantGeneration />
        </p>
      )}
      {proposition.statut === 'erreur' && (
        <section className="mt-6 rounded-[18px] bg-grenade-pale p-4">
          <p className="font-semibold text-grenade">La génération du brouillon a échoué.</p>
          <div className="mt-3">
            <BoutonRelancerBrouillon propositionId={proposition.id} />
          </div>
        </section>
      )}

      <div className={`mt-6 grid items-start gap-6 ${aCote ? 'lg:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <section aria-labelledby="titre-total" className="bo-carte grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
          <div className="sm:col-span-2">
            <h2 id="titre-total" className="text-base text-ardoise!">Total</h2>
            <p className="mt-1 text-4xl font-semibold text-encre">{total === null ? '—' : euros(total)}</p>
            {resume.budget ? (
              <div className="mt-4">
                <div className="h-2.5 overflow-hidden rounded-full bg-brume" aria-hidden>
                  <div className={`h-full rounded-full ${tonJauge}`} style={{ width: `${jauge}%` }} />
                </div>
                <p className={`mt-2 text-sm ${resume.budget.depasse ? 'font-semibold text-grenade' : resume.budget.part_pourcent >= 90 ? 'text-[#5c3d0c]' : 'text-ardoise'}`}>
                  {resume.budget.part_pourcent} % du budget de {euros(resume.budget.reference_cents)}
                  {resume.budget.depasse ? ' : budget dépassé' : ''}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ardoise">Pas de budget de référence.</p>
            )}
          </div>
          <dl className="flex flex-col gap-3 text-sm sm:border-l sm:border-trait sm:pl-6">
            <div>
              <dt className="text-ardoise">Tarifs confirmés</dt>
              <dd className=" text-2xl font-semibold text-encre">
                {confirmees} / {comptees.length}
              </dd>
            </div>
            <div>
              <dt className="text-ardoise">Alertes bloquantes</dt>
              <dd className={` text-2xl font-semibold ${resume.bloquantes > 0 ? 'text-grenade' : 'text-encre'}`}>{resume.bloquantes}</dd>
            </div>
          </dl>
        </section>

        {aCote && (
          <div className="flex flex-col gap-4">
            {modifiable && envoi && <PanneauEnvoi propositionId={proposition.id} bloquants={envoi.bloquants} />}
            <PanneauReponse propositionId={proposition.id} statut={proposition.statut} />
            {(proposition.statut === 'envoyee' || proposition.statut === 'sans_reponse') && (
              <PanneauChangement propositionId={proposition.id} version={proposition.version} />
            )}
          </div>
        )}
      </div>

      <h2 className="mt-10 text-2xl">Prestations</h2>
      <div className="mt-3">
      <div className="bo-carte overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">Prestations de la proposition et leurs tarifs</caption>
            <thead className="bg-brume text-ardoise">
              <tr>
                <th className="px-3 py-3 font-semibold">Prestation</th>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 text-right font-semibold">Pers.</th>
                <th className="px-3 py-3 text-right font-semibold">Prix proposé</th>
                <th className="px-3 py-3 text-right font-semibold">Total ligne</th>
                <th className="px-3 py-3 text-right font-semibold">Prix revérifié</th>
                <th className="px-3 py-3 text-right font-semibold">Écart (unitaire)</th>
                <th className="px-3 py-3 font-semibold">Tarif</th>
                <th className="px-3 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {lignes.map(({ ligne, verification, remplacantes, ecart }) => (
                <tr key={ligne.id} className={`align-top ${ligne.statut === 'remplacee' ? 'text-ardoise line-through' : ''}`}>
                  <td className="px-3 py-3 font-semibold">
                    {ligne.prestation.nom}
                    {resume.parLigne.get(ligne.id)?.map((a, i) => (
                      <span key={i} className={`block text-xs ${a.bloquante ? 'text-grenade' : 'text-miel-fonce'}`}>
                        {a.libelle}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{ligne.date}</td>
                  <td className="px-3 py-3 text-right">{ligne.participants}</td>
                  <td className="px-3 py-3 text-right">{euros(ligne.prix_unitaire_catalogue_cents)}</td>
                  <td className={`px-3 py-3 text-right ${HORS_TOTAL.includes(ligne.statut) ? 'text-ardoise line-through' : ''}`}>
                    {euros(ligne.total_ligne_cents)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {verification?.prix_unitaire_cents == null ? '—' : euros(verification.prix_unitaire_cents)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {verification ? <Ecart ecart={ecart} /> : <span className="text-ardoise">pas encore vérifié</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                        ligne.statut === 'confirme'
                          ? 'bg-sauge-pale text-sauge ring-transparent'
                          : ligne.statut === 'a_verifier'
                            ? 'bg-miel-pale text-[#5c3d0c] ring-transparent'
                            : ligne.statut === 'indisponible'
                              ? 'bg-grenade-pale text-grenade ring-transparent'
                              : 'bg-[#eef1f3] text-ardoise ring-trait'
                      }`}
                    >
                      {STATUT_LIGNE[ligne.statut]}
                    </span>
                    {ligne.prix_confirme && (
                      <span className="block text-xs text-ardoise">
                        {euros(ligne.prix_confirme.montant_cents)} · {SOURCE[ligne.prix_confirme.source]} · {instant(ligne.prix_confirme.le)} ·{' '}
                        {ligne.prix_confirme.par}
                      </span>
                    )}
                    <div className="mt-2">
                      <ActionsLigne
                        propositionId={proposition.id}
                        ligneId={ligne.id}
                        statut={ligne.statut}
                        figee={!modifiable}
                        verification={ligne.derniere_verification}
                        remplacantes={remplacantes}
                        prestationId={ligne.prestation.id}
                        date={ligne.date}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                    href={`/conseiller/propositions/${proposition.id}/lignes/${ligne.id}`}
                    className={`inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold no-underline ${
                      verification ? 'border border-[#d5d9df] bg-white text-encre hover:bg-brume' : 'bg-pervenche text-white hover:bg-pervenche-fonce'
                    }`}
                  >
                    {verification ? 'Détail' : 'Vérifier le prix'}
                  </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {alertes.length > 0 && (
        <section aria-labelledby="titre-alertes" className="mt-6 rounded-[18px] bg-miel-pale p-4">
          <h2 id="titre-alertes" className="text-lg text-[#5c3d0c]!">
            Alertes{resume.bloquantes > 0 && <span className="ml-2 text-sm font-normal text-grenade">{resume.bloquantes} bloquante{resume.bloquantes > 1 ? 's' : ''}</span>}
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-[#5c3d0c]">
            {[...resume.generales, ...[...resume.parLigne.values()].flat()].map((a, i) => (
              <li key={i}>
                <span className={a.bloquante ? 'font-semibold text-grenade' : 'font-semibold'}>{a.libelle}</span>
                {a.bloquante ? ' (bloque l’envoi)' : ''} : {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`mt-10 grid items-start gap-6 ${proposition.programme && mail ? 'lg:grid-cols-2' : ''}`}>
        {proposition.programme && (
          <section aria-labelledby="titre-programme" className="bo-carte p-5 sm:p-6">
            <h2 id="titre-programme" className="text-2xl">Programme</h2>
            <ol className="mt-4 flex flex-col gap-5 border-l-2 border-pervenche-pale pl-5 text-sm">
              {proposition.programme.map((jour, i) => (
                <li key={i}>
                  <span className="text-base font-semibold text-encre">{jour.date} · {jour.titre}</span>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{jour.texte}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {mail && (
          <section aria-labelledby="titre-mail" className="flex flex-col gap-3">
            <h2 id="titre-mail" className="text-2xl">Mail au client</h2>
            <CarteMail
              dossierId={proposition.dossier_id}
              propositionId={proposition.id}
              modele="proposition"
              titre="Mail « Proposition »"
              sujet={mail.sujet}
              corps={mail.corps}
              mailto={mail.mailto}
              imprimer={`/conseiller/propositions/${proposition.id}/imprimer`}
              ouvert={proposition.statut === 'envoyee' || proposition.statut === 'sans_reponse'}
            />
          </section>
        )}
      </div>
    </>
  );
}

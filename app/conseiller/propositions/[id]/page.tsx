import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { etatEnvoi } from '@/src/application/tarifs';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { TarifsSupabase } from '@/src/infrastructure/db/tarifsSupabase';
import { Ecart } from '../../_composants/ecart';
import { AllerA, AValider } from '../../_composants/a-valider';
import { Fil } from '../../_composants/fil';
import { Pastille, PastilleActeur, prochaineEtape } from '../../_composants/statut';
import { dateDeVerification, jourCourt } from '../../_composants/libelles';
import { FAMILLE_STATUT_LIGNE, FAMILLE_STATUT_PROPOSITION } from '@/types/statuts-famille';
import { resumerProposition } from '@/src/domain/proposition/resumeProposition';
import { comparerVersions } from '@/src/domain/proposition/ecartsVersions';
import { REGLES_CHIFFRAGE } from '@/types/chiffrage';
import { ActionsLigne, PanneauEnvoi } from './actions-tarifs';
import { PanneauAbandon } from './panneau-abandon';
import { AjouterLigne, ModifierBudget, ModifierLigne, NuitsPlusMoins, ParticipantsPlusMoins, SejourPlusMoins } from './ajuster-lignes';
import { PanneauChangement } from './panneau-changement';
import { PanneauReponse } from './panneau-reponse';
import { CarteReponseEnLigne } from './reponse-en-ligne';
import { lireReponseEnLigne } from '@/src/infrastructure/db/reponseClientSupabase';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailConfirmation, mailProposition, MailImpossibleErreur } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { AbandonSupabase } from '@/src/infrastructure/db/abandonSupabase';
import { abandonPropose } from '@/src/domain/rappels';
import { BoutonRelancerBrouillon, RafraichirPendantGeneration } from './suivi-brouillon';
import { EcartsVersionsCarte } from './ecarts-versions';
import { PanneauResumeEcarts } from './panneau-resume-ecarts';
import { empreinteEcarts } from '@/src/application/resumeEcarts';
import { versEntreeEcarts } from '@/src/domain/proposition/entreeEcarts';

const HORS_TOTAL: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal; // lignes indisponibles, remplacées ou retirées : hors total
const SOURCE = { agent: 'agent', telephone: 'téléphone', mail: 'mail', lien: 'lien' } as const;

// Proposition : prix proposé, prix revérifié par l'agent et écart (E8.4) ; tarifs confirmés et envoi (E5.1) ;
// remplacement d'une ligne indisponible (E5.2) ; écarts avec la version précédente (E6.2) ; abandon à J+14 sans réponse (E6.5).
export default function PropositionPage({ params }: PageProps<'/conseiller/propositions/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="mt-6 text-encre-doux">Chargement…</p>}>
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
  // E7.4 : après le dépôt, une ligne pas encore réservée peut devenir indisponible, puis être remplacée ou retirée
  const apresDepot = proposition.statut === 'depot_recu';
  const ligneAjustable = (statut: string) => modifiable || (apresDepot && ['a_verifier', 'confirme', 'indisponible'].includes(statut));
  const alertes = modifiable && envoi ? envoi.chiffrage.alertes : proposition.alertes;
  const total = modifiable && envoi ? envoi.chiffrage.total_cents : proposition.total_cents;
  const resume = resumerProposition({ total_cents: total, budget_reference_cents: proposition.budget_reference_cents, alertes });

  // mail de la proposition (E5.4) : seulement une fois envoyée, donc tous ses prix vérifiés (E5.1)
  const envoyee = ['envoyee', 'sans_reponse', 'changement_demande', 'acceptee', 'depot_recu', 'reservee'].includes(proposition.statut);
  const dossier = await new DossiersSupabase().detail(proposition.dossier_id); // nom du client (fil d'Ariane) et mail
  // E6.5 : dossier abandonné, clos ; sinon, abandon proposé à J+14 d'une proposition sans réponse
  const abandonne = dossier?.statut === 'abandonnee';
  const aAbandonner = proposition.statut === 'sans_reponse' && !abandonne ? await new AbandonSupabase().lire(proposition.id) : null;
  const proposeAbandon = aAbandonner !== null && aAbandonner.dossier_statut === 'en_proposition' && abandonPropose(aAbandonner, new Date());
  const attendReponse = !abandonne && (proposition.statut === 'envoyee' || proposition.statut === 'sans_reponse');
  // espace client : réponse donnée en ligne par le client, à enregistrer par le conseiller
  const reponseEnLigne = attendReponse ? await lireReponseEnLigne(proposition.id) : null;
  // E6.2 : ce qui a changé depuis la version précédente, recalculé à chaque lecture
  const precedente = proposition.version > 1 ? await lecture.versionDuDossier(proposition.dossier_id, proposition.version - 1) : null;
  const ecartsVersions = precedente ? comparerVersions(precedente, proposition) : null;
  // une fois toutes les prestations réservées, c'est la confirmation qui part au client (même modèle que la fiche du dossier)
  const reservee = proposition.statut === 'reservee';
  let mail: { sujet: string; corps: string; mailto: string } | null = null;
  if (dossier && envoyee) {
    try {
      const sejour = sejourDe(dossier, conseiller.nomAffiche);
      const m = reservee ? mailConfirmation(sejour, lignesPourMail(proposition)) : mailProposition(sejour, lignesPourMail(proposition));
      mail = { ...m, mailto: lienMailto(dossier.demande.client.email, m) };
    } catch (e) {
      if (!(e instanceof MailImpossibleErreur)) throw e;
    }
  }
  const lignes = await Promise.all(
    proposition.lignes.map(async (ligne) => {
      const verification = await lecture.verificationDeLigne(ligne.id);
      // E5.2 : les prestations de remplacement ne sont cherchées que pour une ligne indisponible
      const remplacantes = ligneAjustable(ligne.statut) && ligne.statut === 'indisponible' ? await tarifs.prestationsRemplacantes(ligne.id) : [];
      return { ligne, verification, remplacantes, ecart: verification && ecartPrix(ligne, verification) };
    }),
  );

  // E6.6 : prestations du catalogue qu'on peut ajouter, seulement tant que la proposition est modifiable
  const ajoutables = modifiable ? await tarifs.prestationsAjoutables(proposition.id) : [];

  const comptees = proposition.lignes.filter((l) => l.statut !== 'remplacee' && l.statut !== 'retiree');
  const confirmees = comptees.filter((l) => l.statut === 'confirme' || l.statut === 'reservee').length;
  const jauge = resume.budget ? Math.min(resume.budget.part_pourcent, 100) : 0;
  // colonne de droite seulement s'il y a quelque chose à faire : envoyer, ou enregistrer la réponse du client
  const aCote = (modifiable && envoi !== null) || attendReponse || ['acceptee', 'depot_recu', 'reservee'].includes(proposition.statut);
  const retenues = proposition.lignes.filter((l) => !HORS_TOTAL.includes(l.statut));
  const lignesNonVerifiees = retenues.filter((l) => l.prix_confirme === null).length;
  const verifieDepuis = retenues.map((l) => l.prix_confirme?.le).filter((d): d is string => !!d).sort()[0] ?? null;
  const tonJauge = resume.budget?.depasse ? 'bg-brique' : 'bg-encre';

  // étape qui attend le conseiller : un bandeau en tête, qui renvoie à la zone entourée et marquée « À valider »
  const aVerifier = retenues.filter((l) => l.statut === 'a_verifier').length;
  const etape = abandonne ? null : prochaineEtape('en_proposition', { statut: proposition.statut, lignes_a_verifier: aVerifier });
  const AGIR: Partial<Record<typeof proposition.statut, { ancre?: string; lien?: string; libelle: string }>> = {
    brouillon_pret: { ancre: 'prestations', libelle: 'Voir les prix à vérifier' },
    a_verifier: { ancre: 'prestations', libelle: 'Voir les prix à vérifier' },
    prete: { ancre: 'envoi', libelle: 'Aller à l’envoi' },
    sans_reponse: { ancre: 'mail-proposition', libelle: 'Voir le mail de relance' },
    acceptee: { ancre: 'reponse', libelle: 'Enregistrer le dépôt' },
    depot_recu: { lien: `/conseiller/propositions/${proposition.id}/accord`, libelle: 'Poser les options' },
    reservee: { ancre: 'mail-confirmation', libelle: 'Voir le mail de confirmation' },
    remplacee: { lien: `/conseiller/dossiers/${proposition.dossier_id}`, libelle: 'Ouvrir le dossier' },
  };
  const agir = etape?.acteur === 'conseiller' ? AGIR[proposition.statut] : undefined;
  const aValider = (...statuts: (typeof proposition.statut)[]) => etape?.acteur === 'conseiller' && statuts.includes(proposition.statut);

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
        <Pastille style={FAMILLE_STATUT_PROPOSITION[proposition.statut]} />
      </div>
      {/* E6.6 : le séjour de référence (dates fixes de la fiche, sinon de la demande), ajustable tant que la proposition l'est */}
      {modifiable && chiffrage && (
        <SejourPlusMoins propositionId={proposition.id} debut={chiffrage.date_debut} fin={chiffrage.date_fin} nuits={chiffrage.nb_nuits} />
      )}

      {etape?.acteur === 'conseiller' && (
        <section aria-labelledby="titre-maintenant" className="mt-6 flex flex-wrap items-center gap-2.5 rounded-[18px] bg-ciel px-5 py-4">
          <PastilleActeur acteur="conseiller" />
          <h2 id="titre-maintenant" className="text-base">
            {etape.texte}
          </h2>
          {agir && (
            <span className="ml-auto">
              {agir.ancre ? (
                <AllerA cible={agir.ancre} libelle={agir.libelle} />
              ) : (
                <Link href={agir.lien!} className="bo-btn text-sm">
                  {agir.libelle} <span aria-hidden>→</span>
                </Link>
              )}
            </span>
          )}
        </section>
      )}

      {proposition.statut === 'remplacee' && (
        <p className="mt-6 rounded-[18px] bg-craie p-4 text-sm text-encre">
          Version remplacée après un changement demandé par le client. Elle reste telle qu’elle a été envoyée ; la version suivante est
          dans la{' '}
          <Link href={`/conseiller/dossiers/${proposition.dossier_id}`} className="font-semibold underline underline-offset-4">
            fiche du dossier
          </Link>
          .
        </p>
      )}
      {abandonne && (
        <p role="status" className="mt-6 rounded-[18px] bg-craie p-4 text-sm text-encre">
          <span className="font-semibold">Dossier abandonné</span> : le client n’a pas répondu à cette proposition. Elle reste telle qu’elle a
          été envoyée.
        </p>
      )}
      {proposition.statut === 'sans_reponse' && !abandonne && (
        <p role="status" className="mt-6 rounded-[18px] bg-ciel-pale p-4 text-sm text-encre">
          {proposeAbandon ? (
            <>
              <span className="font-semibold">Sans réponse du client</span> depuis au moins 14 jours après l’envoi. Vous pouvez abandonner le
              dossier, ou encore le relancer et enregistrer sa réponse.
            </>
          ) : (
            <>
              <span className="font-semibold">Sans réponse du client</span> depuis au moins 3 jours après l’envoi. Relancez-le avec le mail de la
              proposition ci-dessous, puis enregistrez son acceptation ou le changement qu’il demande.
            </>
          )}
        </p>
      )}
      {proposition.motif_changement && (
        <p className="mt-6 rounded-[18px] bg-ciel-pale p-4 text-sm text-encre">
          <span className="font-semibold">Changement demandé par le client :</span> {proposition.motif_changement}
        </p>
      )}
      {ecartsVersions && (
        <EcartsVersionsCarte e={ecartsVersions}>
          {ecartsVersions.prestations.length > 0 && (
            <PanneauResumeEcarts
              propositionId={proposition.id}
              resume={proposition.ecarts?.resume ?? null}
              aJour={proposition.ecarts?.empreinte === empreinteEcarts(versEntreeEcarts(ecartsVersions))}
            />
          )}
        </EcartsVersionsCarte>
      )}

      {proposition.statut === 'brouillon_en_cours' && (
        <p role="status" className="bo-carte mt-6 p-4 text-encre-doux">
          Brouillon en cours de génération…
          <RafraichirPendantGeneration />
        </p>
      )}
      {proposition.statut === 'erreur' && (
        <section className="mt-6 rounded-[18px] bg-brique-pale p-4">
          <p className="font-semibold text-brique-texte">La génération du brouillon a échoué.</p>
          <div className="mt-3">
            <BoutonRelancerBrouillon propositionId={proposition.id} />
          </div>
        </section>
      )}

      <div className={`mt-6 grid items-start gap-6 ${aCote ? 'lg:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <section aria-labelledby="titre-total" className="bo-carte grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
          <div className="sm:col-span-2">
            <h2 id="titre-total" className="text-base text-encre-doux!">Total</h2>
            <p className="mt-1 font-titre text-4xl font-extrabold tracking-[-0.025em] text-encre">{total === null ? '—' : euros(total)}</p>
            {/* un prix affiché est daté : le total n'est vérifié que si chaque ligne l'est */}
            <p className="mt-1 text-sm text-encre-doux">
              {lignesNonVerifiees > 0
                ? `Dont ${lignesNonVerifiees} prix du catalogue, pas encore vérifié${lignesNonVerifiees > 1 ? 's' : ''}.`
                : verifieDepuis
                  ? `Tous les prix vérifiés, le plus ancien ${dateDeVerification(verifieDepuis)}.`
                  : null}
            </p>
            {resume.budget ? (
              <div className="mt-4">
                <div className="h-2.5 overflow-hidden rounded-full bg-craie" aria-hidden>
                  <div className={`h-full rounded-full ${tonJauge}`} style={{ width: `${jauge}%` }} />
                </div>
                <p className={`mt-2 text-sm ${resume.budget.depasse ? 'font-semibold text-brique-texte' : resume.budget.part_pourcent >= 90 ? 'text-encre' : 'text-encre-doux'}`}>
                  {resume.budget.part_pourcent} % du budget de {euros(resume.budget.reference_cents)}
                  {resume.budget.depasse ? ' : budget dépassé' : ''}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-encre-doux">Pas de budget de référence.</p>
            )}
            {/* E6.6 : le client accepte de payer plus (ou moins) : budget réel de la fiche, modifiable ici */}
            {modifiable && <ModifierBudget propositionId={proposition.id} budgetCents={proposition.budget_reference_cents} />}
          </div>
          <dl className="flex flex-col gap-3 text-sm sm:border-l sm:border-trait sm:pl-6">
            <div>
              <dt className="text-encre-doux">Tarifs confirmés</dt>
              <dd className=" text-2xl font-semibold text-encre">
                {confirmees} / {comptees.length}
              </dd>
            </div>
            <div>
              <dt className="text-encre-doux">Alertes bloquantes</dt>
              <dd className={` text-2xl font-semibold ${resume.bloquantes > 0 ? 'text-brique-texte' : 'text-encre'}`}>{resume.bloquantes}</dd>
            </div>
          </dl>
        </section>

        {aCote && (
          <div className="flex flex-col gap-4">
            {modifiable && envoi && <PanneauEnvoi propositionId={proposition.id} bloquants={envoi.bloquants} aValider={aValider('prete')} />}
            {reponseEnLigne && <CarteReponseEnLigne reponse={reponseEnLigne} />}
            {!abandonne && <PanneauReponse propositionId={proposition.id} statut={proposition.statut} aValider={aValider('acceptee', 'depot_recu')} />}

            {attendReponse && <PanneauChangement propositionId={proposition.id} version={proposition.version} />}
            {proposeAbandon && <PanneauAbandon propositionId={proposition.id} />}
          </div>
        )}
      </div>

      <div id="prestations" className="mt-10 flex scroll-mt-6 flex-wrap items-center gap-3">
        <h2 className="text-2xl">Prestations</h2>
        {aValider('a_verifier', 'brouillon_pret') && aVerifier > 0 && <AValider texte={`${aVerifier} prix à vérifier`} />}
      </div>
      <div className="mt-3">
      <div className="bo-carte overflow-x-auto">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <caption className="sr-only">Prestations de la proposition et leurs tarifs</caption>
            <thead className="bg-craie text-encre-doux">
              <tr>
                <th className="px-3 py-3 font-semibold">Prestation</th>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 text-right font-semibold">Pers.</th>
                <th className="px-3 py-3 text-right font-semibold">Nuits</th>
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
                <tr
                  key={ligne.id}
                  className={`align-top ${ligne.statut === 'remplacee' || ligne.statut === 'retiree' ? 'text-encre-doux line-through' : ''} ${modifiable && ligne.statut === 'a_verifier' ? 'bg-ciel-pale/60 shadow-[inset_4px_0_0_var(--detour-encre)]' : ''}`}
                >
                  <td className="px-3 py-3 font-semibold">
                    {ligne.prestation.nom}
                    {resume.parLigne.get(ligne.id)?.map((a, i) => (
                      <span key={i} className={`block text-xs ${a.bloquante ? 'text-brique-texte' : 'text-brique-texte'}`}>
                        {a.libelle}
                      </span>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{jourCourt(ligne.date)}</td>
                  <td className="px-3 py-3 text-right">
                    {modifiable && ['a_verifier', 'confirme', 'indisponible'].includes(ligne.statut) ? (
                      <ParticipantsPlusMoins
                        propositionId={proposition.id}
                        ligneId={ligne.id}
                        participants={ligne.participants}
                        confirmee={ligne.statut === 'confirme'}
                      />
                    ) : (
                      ligne.participants
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {ligne.prestation.type !== 'hebergement' ? (
                      <span className="text-encre-doux">—</span>
                    ) : modifiable && ['a_verifier', 'confirme', 'indisponible'].includes(ligne.statut) ? (
                      <NuitsPlusMoins propositionId={proposition.id} ligneId={ligne.id} nuits={ligne.nb_nuits} confirmee={ligne.statut === 'confirme'} />
                    ) : (
                      ligne.nb_nuits
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{euros(ligne.prix_unitaire_catalogue_cents)}</td>
                  <td className={`px-3 py-3 text-right ${HORS_TOTAL.includes(ligne.statut) ? 'text-encre-doux line-through' : ''}`}>
                    {euros(ligne.total_ligne_cents)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {verification?.prix_unitaire_cents == null ? (
                      '—'
                    ) : (
                      <>
                        {euros(verification.prix_unitaire_cents)}
                        <span className="block text-xs text-encre-doux">{dateDeVerification(verification.le)}</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {verification ? <Ecart ecart={ecart} /> : <span className="text-encre-doux">pas encore vérifié</span>}
                  </td>
                  <td className="px-3 py-3">
                    <Pastille style={FAMILLE_STATUT_LIGNE[ligne.statut]} />
                    {ligne.prix_confirme && (
                      <span className="block text-xs text-encre-doux">
                        {euros(ligne.prix_confirme.montant_cents)}, vérifié {dateDeVerification(ligne.prix_confirme.le)} ({SOURCE[ligne.prix_confirme.source]}) ·
                        confirmé par {ligne.prix_confirme.par}
                      </span>
                    )}
                    <div className="mt-2">
                      <ActionsLigne
                        propositionId={proposition.id}
                        ligneId={ligne.id}
                        statut={ligne.statut}
                        figee={!ligneAjustable(ligne.statut)}
                        apresDepot={apresDepot}
                        verification={ligne.derniere_verification}
                        remplacantes={remplacantes}
                        prestationId={ligne.prestation.id}
                        date={ligne.date}
                      />
                      {modifiable && ['a_verifier', 'confirme', 'indisponible'].includes(ligne.statut) && (
                        <div className="mt-2">
                          <ModifierLigne
                            propositionId={proposition.id}
                            ligneId={ligne.id}
                            date={ligne.date}
                            participants={ligne.participants}
                            confirmee={ligne.statut === 'confirme'}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                    href={`/conseiller/propositions/${proposition.id}/lignes/${ligne.id}`}
                    className={`inline-flex whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold no-underline ${
                      verification ? 'border border-trait bg-carte text-encre hover:bg-craie' : 'bg-encre text-craie hover:bg-encre'
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
        {modifiable && (
          <AjouterLigne
            propositionId={proposition.id}
            prestations={ajoutables}
            date={comptees.at(-1)?.date ?? proposition.lignes.at(-1)?.date ?? ''}
            participants={comptees.at(-1)?.participants ?? 2}
          />
        )}
      </div>

      {alertes.length > 0 && (
        <section aria-labelledby="titre-alertes" className="mt-6 rounded-[18px] bg-ciel-pale p-4">
          <h2 id="titre-alertes" className="text-lg text-encre!">
            Alertes{resume.bloquantes > 0 && <span className="ml-2 text-sm font-normal text-brique-texte">{resume.bloquantes} bloquante{resume.bloquantes > 1 ? 's' : ''}</span>}
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-encre">
            {[...resume.generales, ...[...resume.parLigne.values()].flat()].map((a, i) => (
              <li key={i}>
                <span className={a.bloquante ? 'font-semibold text-brique-texte' : 'font-semibold'}>{a.libelle}</span>
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
            <ol className="mt-4 flex flex-col gap-5 border-l-2 border-ciel-pale pl-5 text-sm">
              {proposition.programme.map((jour, i) => (
                <li key={i}>
                  <span className="text-base font-semibold text-encre">{jourCourt(jour.date)} · {jour.titre}</span>
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
              modele={reservee ? 'confirmation' : 'proposition'}
              titre={reservee ? 'Mail « Confirmation de réservation »' : 'Mail « Proposition »'}
              sujet={mail.sujet}
              corps={mail.corps}
              mailto={mail.mailto}
              imprimer={`/conseiller/propositions/${proposition.id}/imprimer`}
              ouvert={attendReponse || reservee}
              aValider={aValider('sans_reponse', 'reservee')}
            />
          </section>
        )}
      </div>
    </>
  );
}

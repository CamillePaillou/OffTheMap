import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import type { DetailDossier } from '@/types/dashboard';
import { DECISION, ETAT_FICHE, STATUT_DOSSIER, STATUT_PROPOSITION, euros, instantParis, jour } from '../../_composants/libelles';
import { Fil } from '../../_composants/fil';
import { Avancement, Depart, groupeDe, joursAvantDepart, PastilleActeur, PastilleStatut, photoDestination, prochaineEtape } from '../../_composants/statut';
import { BoutonBrouillon, BoutonEntretienFait, BoutonRelancer, FormulaireCorrection } from './formulaires';
import { PanneauTri } from './panneauTri';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailConfirmation, mailRendezVous, MailImpossibleErreur } from '@/src/domain/mails';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';

type Props = PageProps<'/conseiller/dossiers/[id]'>;

const TYPE_EVENEMENT: Record<DetailDossier['historique'][number]['type'], string> = {
  statut: 'Changement de statut', mail: 'Mail envoyé', rappel: 'Rappel', depot: 'Dépôt de garantie', changement: 'Changement demandé',
  verification: 'Prix vérifié par l’agent', accord: 'Accord donné', option: 'Option posée', reservation: 'Réservation',
};
const HISTORIQUE_VISIBLE = 5; // les plus récents ; le reste se déplie

const REGIME: Record<string, string> = {
  vegetarien: 'végétarien', vegetalien: 'végétalien', sans_gluten: 'sans gluten', allergie: 'allergie alimentaire', autre: 'autre',
};

// Fiche d'un dossier (E2.1) : la demande du client, la fiche de l'IA, le tri (E3.1) et ce que le conseiller corrige après l'entretien.
const TYPES_PRESTATION = { transport: 'transport', hebergement: 'hébergement', activite: 'activité' } as const;

export default function DossierPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="px-9 pt-7 text-encre-doux">Chargement…</p>}>
      <Contenu params={params} />
    </Suspense>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id } = await params;
  const conseiller = await exigerConseiller(`/conseiller/dossiers/${id}`);
  const dossier = await new DossiersSupabase().detail(id);
  if (!dossier) notFound();
  const { demande, fiche } = dossier;
  const nbVoyageurs = demande.voyageurs.length;
  const enErreur = dossier.statut === 'erreur' || fiche?.etat === 'erreur';
  // tri (E3.1) : sur une fiche prête, ou sur un dossier à corriger (valider, refuser, nouveau lien)
  // brouillon (E4.4) : après l'entretien, fiche corrigée (budget réel et dates fixes), aucune proposition encore
  const ficheComplete = fiche !== null && fiche.budget_reel_cents !== null && fiche.dates_fixes.debut !== null && fiche.dates_fixes.fin !== null;
  const peutDemanderBrouillon = (dossier.statut === 'entretien_fait' || dossier.statut === 'en_proposition') && dossier.propositions.length === 0;
  const aTrier = (dossier.statut === 'fiche_prete' || dossier.statut === 'a_corriger') && fiche !== null && fiche.etat !== 'erreur';
  const boucles = aTrier ? await new CorrectionsSupabase().boucles(dossier.dossier_id) : null;

  // mails modèles (E5.4) : rendez-vous après la validation, confirmation quand une proposition est réservée
  const sejour = sejourDe(dossier, conseiller.nomAffiche);
  const mails: { modele: 'rendez_vous' | 'confirmation'; propositionId: string | null; titre: string; mail: { sujet: string; corps: string } }[] = [];
  if (dossier.statut === 'validee' || dossier.statut === 'rdv_propose') {
    mails.push({ modele: 'rendez_vous', propositionId: null, titre: 'Mail « Rendez-vous »', mail: mailRendezVous(sejour) });
  }
  const reservee = dossier.propositions.find((p) => p.statut === 'reservee');
  const propositionReservee = reservee ? await new PropositionsSupabase().proposition(reservee.id) : null;
  if (propositionReservee) {
    try {
      mails.push({ modele: 'confirmation', propositionId: propositionReservee.id, titre: 'Mail « Confirmation de réservation »', mail: mailConfirmation(sejour, lignesPourMail(propositionReservee)) });
    } catch (e) {
      if (!(e instanceof MailImpossibleErreur)) throw e; // une ligne sans prix vérifié : pas de mail
    }
  }

  const derniere = dossier.propositions.at(-1) ?? null;
  const etape = prochaineEtape(dossier.statut, derniere);
  const jours = joursAvantDepart(demande.dates.debut);
  const ouvert = groupeDe(dossier.statut).id !== 'clos';
  const photo = photoDestination(demande.destination);
  const budget = fiche?.budget_reel_cents ?? demande.budget_annonce?.montant_cents ?? null;
  const total = derniere?.total_cents ?? null;
  const part = total !== null && budget ? Math.round((total / budget) * 100) : null;
  const nuits = demande.dates.nb_nuits;

  // le bloc « Maintenant » : ce qu'il faut faire, avec l'action sur place ; sa couleur dit qui doit agir
  const ton = enErreur ? 'bg-brique-pale' : etape.acteur === 'conseiller' ? 'bg-ciel' : etape.acteur === 'client' ? 'bg-ciel-pale' : 'bg-carte';
  const titreMaintenant = enErreur ? 'La fiche n’a pas pu être préparée' : etape.acteur === null ? 'Dossier clos' : etape.texte;

  return (
    <main className="bo-entre flex flex-1 flex-col gap-5 px-4 pt-6 pb-10 sm:px-9 sm:pt-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Fil etapes={[{ libelle: 'Dossiers', href: '/conseiller' }, { libelle: demande.client.nom }]} />
        <a href={`mailto:${demande.client.email}`} className="bo-btn-2 text-sm">
          Écrire au client
        </a>
      </div>

      <section aria-labelledby="titre-sejour" className="bo-bloc flex flex-wrap items-center gap-7 p-3.5 pr-7">
        {photo ? (
          <Image src={photo} alt="" width={600} height={400} priority className="h-[200px] w-full rounded-2xl object-cover sm:w-[300px]" />
        ) : (
          <div className="flex h-[200px] w-full items-center justify-center rounded-2xl bg-ciel-pale p-6 text-center text-encre-doux sm:w-[300px]">
            Destination à proposer après l’entretien
          </div>
        )}
        <div className="min-w-0 flex-[1_1_320px] pb-2 sm:pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-encre-doux">
            <span>
              {demande.client.nom} · {nbVoyageurs} voyageur{nbVoyageurs > 1 ? 's' : ''}
            </span>
            <PastilleStatut statut={dossier.statut} />
          </div>
          <h1 id="titre-sejour" className="mt-1.5 text-[32px] leading-tight tracking-[-0.025em] sm:text-[40px]">
            {demande.destination ? `Paris → ${demande.destination}` : 'Destination à proposer'}
          </h1>
          <p className="mt-1.5 text-encre-doux">
            {jour(demande.dates.debut)} → {jour(demande.dates.fin)} · {nuits} nuit{nuits > 1 ? 's' : ''}
          </p>
          <div className="mt-6">
            <Avancement statut={dossier.statut} />
          </div>
        </div>
      </section>

      <section aria-labelledby="titre-maintenant" className={`rounded-[18px] px-5 py-5 sm:px-6 ${ton}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          {!enErreur && <PastilleActeur acteur={etape.acteur} />}
          <h2 id="titre-maintenant" className="text-base">
            {titreMaintenant}
          </h2>
        </div>
        {enErreur ? (
          <>
            <p className="mt-1 text-sm text-brique-texte">{fiche?.erreur ?? 'Le service de résumé n’a pas répondu.'} La demande du client est intacte.</p>
            {dossier.statut === 'erreur' && (
              <div className="mt-4">
                <BoutonRelancer dossierId={dossier.dossier_id} />
              </div>
            )}
          </>
        ) : aTrier && boucles && fiche ? (
          <PanneauTri
            dossierId={dossier.dossier_id}
            statut={dossier.statut as 'fiche_prete' | 'a_corriger'}
            boucles={boucles}
            pointsFlous={fiche.points_flous}
          />
        ) : peutDemanderBrouillon ? (
          ficheComplete ? (
            <div className="mt-4">
              <BoutonBrouillon dossierId={dossier.dossier_id} valideFiche={dossier.statut === 'entretien_fait'} />
            </div>
          ) : (
            <p className="mt-1 text-sm text-encre">Renseignez le budget réel et les dates fixes dans « Après l’entretien », plus bas, pour générer le brouillon.</p>
          )
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-encre">
              {derniere
                ? `Proposition version ${derniere.version} : ${STATUT_PROPOSITION[derniere.statut].toLowerCase()}${derniere.total_cents !== null ? `, ${euros(derniere.total_cents)}` : ''}.`
                : etape.acteur === 'client'
                  ? 'Le client a la main : rien à faire de votre côté pour l’instant.'
                  : etape.acteur === 'systeme'
                    ? 'Préparation automatique en cours : le résultat s’affichera ici.'
                    : etape.acteur === null
                      ? 'Le dossier reste consultable.'
                      : dossier.statut === 'validee'
                        ? 'Envoyez le mail de rendez-vous, puis marquez-le comme envoyé.'
                        : dossier.statut === 'rdv_propose'
                          ? 'Après l’entretien, confirmez-le ici, puis notez le budget réel et les dates fixes dans la fiche.'
                          : 'Ouvrez la fiche ci-dessous pour avancer.'}
            </p>
            {dossier.statut === 'rdv_propose' && <BoutonEntretienFait dossierId={dossier.dossier_id} />}
            {derniere && (
              <Link href={`/conseiller/propositions/${derniere.id}`} className="bo-btn">
                Ouvrir la proposition
              </Link>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bo-carte px-5 py-4">
          <p className="text-sm text-encre-doux">{total !== null ? 'Total proposé' : fiche?.budget_reel_cents != null ? 'Budget réel' : 'Budget annoncé'}</p>
          <p className="mt-1.5 font-titre text-[28px] font-extrabold tracking-[-0.025em]">{total !== null ? euros(total) : budget !== null ? euros(budget) : 'Non précisé'}</p>
          {part !== null && (
            <>
              <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-craie">
                <div className={`bo-glisse h-full rounded-full ${part > 100 ? 'bg-brique' : 'bg-encre'}`} style={{ width: `${Math.min(part, 100)}%` }} />
              </div>
              <p className={`mt-1.5 text-[13px] ${part > 100 ? 'font-semibold text-brique-texte' : 'text-encre-doux'}`}>
                {part} % du budget de {euros(budget!)}
              </p>
            </>
          )}
          {part === null && <p className="mt-1.5 text-[13px] text-encre-doux">{budget === null ? 'À demander pendant l’entretien' : 'Pour tout le groupe'}</p>}
        </div>
        <div className="bo-carte px-5 py-4">
          <p className="text-sm text-encre-doux">Départ</p>
          <p className="mt-1.5 text-[28px] font-semibold">
            <Depart jours={jours} ouvert={ouvert} long />
          </p>
          <p className="mt-1.5 text-[13px] text-encre-doux">{jour(demande.dates.debut)}</p>
        </div>
        <div className="bo-carte px-5 py-4">
          <p className="text-sm text-encre-doux">Envies</p>
          <p className="mt-2 line-clamp-3 leading-relaxed">{demande.envies ? `« ${demande.envies} »` : <span className="text-encre-doux">Non précisées</span>}</p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          <section aria-labelledby="titre-demande" className="bo-carte p-5 sm:p-6">
            <h2 id="titre-demande" className="text-base">Demande du client</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-encre-doux">E-mail</dt>
              <dd>{demande.client.email}</dd>
              <dt className="text-encre-doux">Voyageurs</dt>
              <dd>{voyageurs(demande.voyageurs)}</dd>
              <dt className="text-encre-doux">Budget annoncé</dt>
              <dd>{demande.budget_annonce ? `${euros(demande.budget_annonce.montant_cents)} pour le groupe` : 'non précisé'}</dd>
              {demande.prestations_souhaitees.length > 0 && (
                <>
                  {/* E1.4 : ajoutées par le client depuis le chatbot ; le brouillon les retient en priorité */}
                  <dt className="text-encre-doux">Ce qui le tente</dt>
                  <dd>
                    <ul aria-label="Prestations choisies par le client" className="flex flex-col items-start gap-1.5">
                      {demande.prestations_souhaitees.map((p) => (
                        <li key={p.id} className="rounded-[10px] bg-ciel px-3 py-1">
                          <span className="font-semibold">{p.nom}</span>
                          <span className="text-encre-doux">
                            {' '}
                            · {TYPES_PRESTATION[p.type]}, {p.destination}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
              <dt className="text-encre-doux">Contraintes</dt>
              <dd className="whitespace-pre-line">{demande.contraintes ?? '—'}</dd>
              <dt className="text-encre-doux">Reçue le</dt>
              <dd>
                {instantParis(dossier.cree_le)}
                {demande.version > 1 && ` (version ${demande.version})`}
              </dd>
            </dl>
          </section>

          <section aria-labelledby="titre-fiche" className="bo-carte p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titre-fiche" className="text-base">Fiche</h2>
              {fiche && <span className="text-sm text-encre-doux">{ETAT_FICHE[fiche.etat]}</span>}
            </div>
            {!fiche ? (
              <p className="mt-2 text-encre-doux">{dossier.statut === 'fiche_en_cours' ? 'En préparation…' : 'La fiche n’a pas encore été préparée.'}</p>
            ) : (
              <>
                {fiche.points_flous.length > 0 && (
                  <div className="mt-4 rounded-[14px] bg-ciel-pale px-4 py-3 text-sm text-encre">
                    <p className="font-semibold">Points flous à éclaircir</p>
                    <Liste items={fiche.points_flous} />
                  </div>
                )}
                <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[9rem_1fr]">
                  <dt className="text-encre-doux">Envies</dt>
                  <dd><Liste items={fiche.envies} /></dd>
                  <dt className="text-encre-doux">Contraintes</dt>
                  <dd><Liste items={fiche.contraintes} /></dd>
                  <dt className="text-encre-doux">Régimes</dt>
                  <dd>{fiche.regimes.length ? fiche.regimes.map((r) => REGIME[r]).join(', ') : 'aucun'}</dd>
                  <dt className="text-encre-doux">Mobilité</dt>
                  <dd>{fiche.mobilite === 'reduite' ? 'réduite' : 'sans contrainte signalée'}</dd>
                  <dt className="text-encre-doux">Niveau physique</dt>
                  <dd>{fiche.niveau_physique ?? '—'}</dd>
                  <dt className="text-encre-doux">Décision</dt>
                  <dd>
                    {fiche.decision ? DECISION[fiche.decision] : 'pas encore triée'}
                    {fiche.validee_le && <span className="text-encre-doux"> · {instantParis(fiche.validee_le)}</span>}
                  </dd>
                </dl>

                <div className="mt-6 border-t border-trait pt-5">
                  <h3 className="text-base">Après l’entretien</h3>
                  <p className="mt-1 text-sm text-encre-doux">Ces champs sont gardés si la fiche est régénérée.</p>
                  <FormulaireCorrection
                    dossierId={dossier.dossier_id}
                    valeurs={{
                      budget_reel_euros: fiche.budget_reel_cents === null ? '' : String(fiche.budget_reel_cents / 100),
                      date_debut_fixe: fiche.dates_fixes.debut ?? '',
                      date_fin_fixe: fiche.dates_fixes.fin ?? '',
                      nb_nuits_fixe: fiche.dates_fixes.nb_nuits === null ? '' : String(fiche.dates_fixes.nb_nuits),
                      notes_conseiller: fiche.notes_conseiller ?? '',
                    }}
                  />
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          {dossier.propositions.length > 0 && (
            <section aria-labelledby="titre-propositions" className="bo-carte p-5">
              <h2 id="titre-propositions" className="text-base">Propositions</h2>
              <ul className="mt-2 flex flex-col">
                {[...dossier.propositions].reverse().map((p) => (
                  <li key={p.id}>
                    <Link href={`/conseiller/propositions/${p.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-[10px] px-2 py-2.5 text-sm text-encre! no-underline transition-colors hover:bg-craie">
                      <span className="font-semibold">Version {p.version}</span>
                      <span className="text-right">
                        <span className="block">{STATUT_PROPOSITION[p.statut]}</span>
                        <span className="text-encre-doux">{p.total_cents === null ? 'total à calculer' : euros(p.total_cents)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mails.map((m) => (
            <CarteMail
              key={m.modele}
              dossierId={dossier.dossier_id}
              propositionId={m.propositionId}
              modele={m.modele}
              titre={m.titre}
              sujet={m.mail.sujet}
              corps={m.mail.corps}
              mailto={lienMailto(demande.client.email, m.mail)}
            />
          ))}

          <section aria-labelledby="titre-activite" className="bo-carte p-5">
            <h2 id="titre-activite" className="text-base">Activité</h2>
            <Historique evenements={[...dossier.historique].reverse()} />
          </section>
        </div>
      </div>
    </main>
  );
}

/** Du plus récent au plus ancien : ce qui vient de se passer d'abord ; les plus anciens se déplient. */
function Historique({ evenements }: { evenements: DetailDossier['historique'] }) {
  const liste = (items: DetailDossier['historique']) => (
    <ol className="flex flex-col gap-3 text-sm">
      {items.map((h, i) => (
        <li key={i} className="flex flex-col">
          <span className="text-[13px] text-encre-doux">{instantParis(h.date)}</span>
          <span>
            {evenement(h)} <span className="text-encre-doux">· {h.auteur_nom ?? 'système'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
  return (
    <div className="mt-4">
      {liste(evenements.slice(0, HISTORIQUE_VISIBLE))}
      {evenements.length > HISTORIQUE_VISIBLE && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-encre">Voir les {evenements.length - HISTORIQUE_VISIBLE} événements plus anciens</summary>
          <div className="mt-3">{liste(evenements.slice(HISTORIQUE_VISIBLE))}</div>
        </details>
      )}
    </div>
  );
}

function Liste({ items, vide = '—' }: { items: string[]; vide?: string }) {
  if (items.length === 0) return <>{vide}</>;
  return (
    <ul className="list-inside list-disc">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function voyageurs(tranches: DetailDossier['demande']['voyageurs']) {
  const adultes = tranches.filter((t) => t === 'adulte').length;
  const enfants = tranches.length - adultes;
  return [`${adultes} adulte${adultes > 1 ? 's' : ''}`, enfants && `${enfants} enfant${enfants > 1 ? 's' : ''}`].filter(Boolean).join(', ');
}

function evenement(h: DetailDossier['historique'][number]) {
  if (h.type !== 'statut') return h.resume ?? TYPE_EVENEMENT[h.type];
  const libelle = (s: string | null) =>
    s === null ? '—' : h.cible === 'dossier' ? (STATUT_DOSSIER[s as keyof typeof STATUT_DOSSIER] ?? s) : (STATUT_PROPOSITION[s as keyof typeof STATUT_PROPOSITION] ?? s);
  const prefixe = h.cible === 'proposition' ? 'Proposition : ' : '';
  return h.ancien_statut === null ? `${prefixe}${libelle(h.nouveau_statut)}` : `${prefixe}${libelle(h.ancien_statut)} → ${libelle(h.nouveau_statut)}`;
}

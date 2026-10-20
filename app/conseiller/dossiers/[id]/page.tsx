import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import type { DetailDossier } from '@/types/dashboard';
import { DECISION, ETAT_FICHE, STATUT_DOSSIER, STATUT_PROPOSITION, euros, instantParis, jour } from '../../_composants/libelles';
import { LigneDossier, PastilleStatut } from '../../_composants/statut';
import { BoutonBrouillon, BoutonRelancer, FormulaireCorrection } from './formulaires';
import { PanneauTri } from './panneauTri';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailConfirmation, mailRendezVous, MailImpossibleErreur } from '@/src/domain/mails';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';

type Props = PageProps<'/conseiller/dossiers/[id]'>;

const REGIME: Record<string, string> = {
  vegetarien: 'végétarien', vegetalien: 'végétalien', sans_gluten: 'sans gluten', allergie: 'allergie alimentaire', autre: 'autre',
};

// Fiche d'un dossier (E2.1) : la demande du client, la fiche de l'IA, le tri (E3.1) et ce que le conseiller corrige après l'entretien.
export default function DossierPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/conseiller" className="text-sm font-semibold underline underline-offset-4">
        ← Tous les dossiers
      </Link>
      <Suspense fallback={<p className="mt-6 text-doux">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id } = await params;
  const conseiller = await exigerConseiller(`/conseiller/dossiers/${id}`);
  const dossier = await new DossiersSupabase().detail(id);
  if (!dossier) notFound();
  const { demande, fiche } = dossier;
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

  const actions = enErreur || (aTrier && boucles && fiche) || peutDemanderBrouillon;

  return (
    <>
      <header className="mt-4 flex flex-col gap-5 border-b border-filet pb-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-3xl sm:text-4xl">{demande.client.nom}</h1>
          <PastilleStatut statut={dossier.statut} />
        </div>
        <p className="-mt-3 text-doux">
          {demande.destination ?? 'Destination à proposer'} · {jour(demande.dates.debut)} → {jour(demande.dates.fin)} · demande v{demande.version} reçue le{' '}
          {instantParis(dossier.cree_le)}
        </p>
        <LigneDossier statut={dossier.statut} />
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="titre-demande" className="panneau p-5 sm:p-6">
            <h2 id="titre-demande" className="text-xl">Demande du client</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-doux">E-mail</dt>
              <dd>{demande.client.email}</dd>
              <dt className="text-doux">Destination</dt>
              <dd>{demande.destination ?? 'aucune idée'}</dd>
              <dt className="text-doux">Dates</dt>
              <dd>
                {jour(demande.dates.debut)} → {jour(demande.dates.fin)}, {demande.dates.nb_nuits} nuit{demande.dates.nb_nuits > 1 ? 's' : ''}
              </dd>
              <dt className="text-doux">Voyageurs</dt>
              <dd>{voyageurs(demande.voyageurs)}</dd>
              <dt className="text-doux">Budget annoncé</dt>
              <dd>{demande.budget_annonce ? `${euros(demande.budget_annonce.montant_cents)} pour le groupe` : 'non précisé'}</dd>
              <dt className="text-doux">Envies</dt>
              <dd className="whitespace-pre-line">{demande.envies ?? '—'}</dd>
              <dt className="text-doux">Contraintes</dt>
              <dd className="whitespace-pre-line">{demande.contraintes ?? '—'}</dd>
            </dl>
          </section>

          <section aria-labelledby="titre-fiche" className="panneau p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titre-fiche" className="text-xl">Fiche</h2>
              {fiche && <span className="text-sm text-doux">{ETAT_FICHE[fiche.etat]}</span>}
            </div>
            {!fiche ? (
              <p className="mt-2 text-doux">
                {dossier.statut === 'fiche_en_cours' ? 'Génération en cours…' : 'La fiche n’a pas encore été générée.'}
              </p>
            ) : (
              <>
                {fiche.points_flous.length > 0 && (
                  <div className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    <p className="font-semibold">Points flous à éclaircir</p>
                    <Liste items={fiche.points_flous} />
                  </div>
                )}
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
                  <dt className="text-doux">Envies</dt>
                  <dd><Liste items={fiche.envies} /></dd>
                  <dt className="text-doux">Contraintes</dt>
                  <dd><Liste items={fiche.contraintes} /></dd>
                  <dt className="text-doux">Régimes</dt>
                  <dd>{fiche.regimes.length ? fiche.regimes.map((r) => REGIME[r]).join(', ') : 'aucun'}</dd>
                  <dt className="text-doux">Mobilité</dt>
                  <dd>{fiche.mobilite === 'reduite' ? 'réduite' : 'sans contrainte signalée'}</dd>
                  <dt className="text-doux">Niveau physique</dt>
                  <dd>{fiche.niveau_physique ?? '—'}</dd>
                  <dt className="text-doux">Décision</dt>
                  <dd>{fiche.decision ? DECISION[fiche.decision] : 'pas encore triée'}</dd>
                  {fiche.validee_le && (
                    <>
                      <dt className="text-doux">Validée le</dt>
                      <dd>{instantParis(fiche.validee_le)}</dd>
                    </>
                  )}
                </dl>

                <div className="mt-6 border-t border-filet pt-5">
                  <h3 className="text-lg">Après l’entretien</h3>
                  <p className="mt-1 text-sm text-doux">Ces champs sont gardés si la fiche est régénérée.</p>
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

          <section aria-labelledby="titre-historique" className="panneau p-5 sm:p-6">
            <h2 id="titre-historique" className="text-xl">Historique</h2>
            <ol className="mt-4 flex flex-col border-l-2 border-filet text-sm">
              {dossier.historique.map((h, i) => (
                <li key={i} className="relative pb-3 pl-5 last:pb-0">
                  <span aria-hidden className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-bleu" />
                  <span className="text-doux">{instantParis(h.date)}</span>
                  <span className="block">
                    {evenement(h)} <span className="text-doux">· {h.auteur_nom ?? 'système'}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-label="À faire sur ce dossier" className="flex flex-col gap-6 lg:sticky lg:top-6">
          {actions ? (
            <div className="panneau border-t-4 border-t-orange p-5">
              <h2 className="text-xl">À faire</h2>
              {enErreur && (
                <section className="mt-4 rounded-lg border-l-4 border-red-700 bg-red-50 p-4">
                  <p className="font-semibold text-red-800">La génération de la fiche a échoué.</p>
                  {fiche?.erreur && <p className="mt-1 text-sm text-red-800">{fiche.erreur}</p>}
                  {dossier.statut === 'erreur' && (
                    <div className="mt-3">
                      <BoutonRelancer dossierId={dossier.dossier_id} />
                    </div>
                  )}
                </section>
              )}
              {aTrier && boucles && fiche && (
                <PanneauTri
                  dossierId={dossier.dossier_id}
                  statut={dossier.statut as 'fiche_prete' | 'a_corriger'}
                  boucles={boucles}
                  pointsFlous={fiche.points_flous}
                />
              )}
              {peutDemanderBrouillon && (
                <section className="mt-4">
                  <h3 className="text-lg">Proposition</h3>
                  {ficheComplete ? (
                    <div className="mt-3">
                      <BoutonBrouillon dossierId={dossier.dossier_id} valideFiche={dossier.statut === 'entretien_fait'} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-doux">Renseignez le budget réel et les dates fixes (fiche, « Après l’entretien ») pour générer le brouillon.</p>
                  )}
                </section>
              )}
            </div>
          ) : (
            <p className="panneau p-5 text-sm text-doux">Rien à faire sur ce dossier pour l’instant.</p>
          )}

          {dossier.propositions.length > 0 && (
            <section aria-labelledby="titre-propositions" className="panneau p-5">
              <h2 id="titre-propositions" className="text-xl">Propositions</h2>
              <ul className="mt-3 flex flex-col divide-y divide-filet text-sm">
                {dossier.propositions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/conseiller/propositions/${p.id}`} className="font-semibold underline underline-offset-4">
                      Version {p.version}
                    </Link>
                    <span className="text-right">
                      <span className="block">{STATUT_PROPOSITION[p.statut]}</span>
                      <span className="text-doux">{p.total_cents === null ? 'total à calculer' : euros(p.total_cents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mails.length > 0 && (
            <section aria-labelledby="titre-mails" className="flex flex-col gap-3">
              <h2 id="titre-mails" className="px-1 text-xl">Mails au client</h2>
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
            </section>
          )}
        </aside>
      </div>
    </>
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
  if (h.type !== 'statut') return h.resume ?? h.type;
  const libelle = (s: string | null) =>
    s === null ? '—' : h.cible === 'dossier' ? (STATUT_DOSSIER[s as keyof typeof STATUT_DOSSIER] ?? s) : (STATUT_PROPOSITION[s as keyof typeof STATUT_PROPOSITION] ?? s);
  const prefixe = h.cible === 'proposition' ? 'Proposition : ' : '';
  return h.ancien_statut === null ? `${prefixe}${libelle(h.nouveau_statut)}` : `${prefixe}${libelle(h.ancien_statut)} → ${libelle(h.nouveau_statut)}`;
}

import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { LIMITES } from '@/types/enums';
import { MESSAGES_REFUS_ACCORD, evaluerAccord, prixReverifieCents } from '@/src/domain/accord';
import { BoutonAccord } from './bouton-accord';
import { BoutonOption } from './bouton-option';
import { BoutonConfirmation } from './bouton-confirmation';
import { BoutonAnnulation } from './bouton-annulation';
import { chargerProposition } from './charger';
import { accordsDemo } from './depot';
import { ReservationConfirmee } from './reservation-confirmee';
import { Fil } from '../../../_composants/fil';
import { dateDeVerification } from '../../../_composants/libelles';

// Écran d'accord (E9.3) : prestations, prix revérifié et conditions, puis autorisation d'UNE écriture précise.
// Données : la proposition en base (ou celle des fixtures pour la démonstration) ; les accords restent en mémoire.
export default function PageAccord({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="mt-4 text-encre-doux">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
/** « Alice Martin » → « Alice » : le conseiller signe de son prénom. */
const prenom = (nom: unknown) => (typeof nom === 'string' && nom.trim() ? nom.trim().split(/\s+/)[0]! : 'le conseiller');
const jour = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

async function Contenu({ params }: { params: Promise<{ id: string }> }) {
  await exigerConseiller();
  const { id } = await params;
  const proposition = await chargerProposition(id);
  if (!proposition) notFound();
  const maintenant = new Date();

  // un seul O par écran : le monogramme va à la dernière réservation confirmée (celle qui vient de l'être)
  const derniereConfirmee = accordsDemo.accords.filter((a) => a.statut === 'confirmee').at(-1)?.ligne_id;

  return (
    <>
      <Fil
        etapes={[
          { libelle: 'Dossiers', href: '/conseiller' },
          { libelle: 'Dossier', href: `/conseiller/dossiers/${proposition.dossier_id}` },
          { libelle: `Proposition v${proposition.version}`, href: `/conseiller/propositions/${proposition.id}` },
          { libelle: 'Accord avant option' },
        ]}
      />
      <h1 className="mt-3 text-3xl sm:text-4xl">Accord avant option</h1>
      <p className="mt-2 max-w-3xl text-encre-doux">
        Vous autorisez une écriture précise : une prestation, une date, un nombre de participants et un prix. Rien n’est réservé à cette étape.
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="conditions" className="bo-carte order-first p-5 lg:order-last lg:sticky lg:top-6">
        <h2 id="conditions" className="text-lg">Conditions de l’accord</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-encre">
          <li>Valable {LIMITES.dureeAccordMinutes} minutes, à usage unique, pour cette prestation, cette date, ce nombre de participants et ce prix seulement.</li>
          <li>Il permet seulement de poser une option : la durée est fixée par le simulateur du prestataire et affichée à la pose.</li>
          <li>La réservation demande ensuite une seconde validation avec la clé d’approbation, saisie par vous.</li>
          <li>Si le prix revérifié change, l’accord est refusé : il faut relire le prix et autoriser de nouveau.</li>
        </ul>
      </section>

      <ul className="flex flex-col gap-4">
        {proposition.lignes.map((ligne) => {
          const prix = prixReverifieCents(ligne);
          const accord = accordsDemo.accordValable(ligne.id, maintenant);
          const optionPosee = accordsDemo.accords.find((a) => a.ligne_id === ligne.id && a.statut === 'posee');
          const reservationConfirmee = accordsDemo.accords.find((a) => a.ligne_id === ligne.id && a.statut === 'confirmee');
          const reservationAnnulee = accordsDemo.accords.find((a) => a.ligne_id === ligne.id && a.statut === 'annulee');
          const verdict = evaluerAccord({
            statutProposition: proposition.statut,
            ligne,
            prixAfficheCents: prix ?? 0,
            demarcheEnCours: accord !== undefined,
            maintenant,
          });
          const v = ligne.derniere_verification;
          return (
            <li key={ligne.id} className={`bo-carte p-5 ${optionPosee ? 'ring-2 ring-encre' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xl">{ligne.prestation.nom}</h3>
                <span className="text-sm text-encre-doux">{jour(ligne.date)} · {ligne.participants} participants</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div><dt className="text-encre-doux">Prix du catalogue</dt><dd>{euros(ligne.prix_unitaire_catalogue_cents)} / pers.</dd></div>
                <div><dt className="text-encre-doux">Prix revérifié</dt><dd>{v && v.prix_unitaire_cents !== null ? `${euros(v.prix_unitaire_cents)} / pers.` : 'indisponible'}</dd></div>
                <div><dt className="text-encre-doux">Places restantes</dt><dd>{v && v.places_restantes !== null ? v.places_restantes : 'inconnues'}</dd></div>
                <div><dt className="text-encre-doux">Total de la ligne</dt><dd className="text-lg font-semibold text-encre">{prix !== null ? euros(prix) : '—'}</dd></div>
              </dl>
              {v && <p className="mt-1 text-xs text-encre-doux">Prix vérifié par l’agent {dateDeVerification(v.le)}.</p>}

              {reservationAnnulee && !reservationConfirmee && (
                <p className="mt-4 rounded-lg bg-ciel-pale px-3 py-2 text-sm text-encre" role="status">
                  Réservation annulée : {reservationAnnulee.reservation_id_simulateur ?? 'identifiant non renseigné'}. Les places sont libérées ; un nouvel accord reste possible.
                </p>
              )}
              {reservationConfirmee ? (
                <>
                  <ReservationConfirmee
                    ligneId={ligne.id}
                    reservation={reservationConfirmee.reservation_id_simulateur ?? 'sans identifiant'}
                    prix={prix !== null ? `${euros(prix)}${v ? ` ${dateDeVerification(v.le)}` : ''}` : null}
                    monogramme={ligne.id === derniereConfirmee}
                    par={prenom((reservationConfirmee.reponse_confirmation as { approuve_par?: unknown } | undefined)?.approuve_par)}
                  />
                  <BoutonAnnulation propositionId={proposition.id} ligneId={ligne.id} />
                </>
              ) : optionPosee ? (
                <>
                  <p className="mt-4 rounded-lg bg-ciel-pale px-3 py-2 text-sm text-encre" role="status">
                    Option posée : {optionPosee.option_id_simulateur}. Expiration confirmée par le simulateur : {optionPosee.expire_option_le ? new Date(optionPosee.expire_option_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'non renseignée'}.
                  </p>
                  <BoutonConfirmation propositionId={proposition.id} ligneId={ligne.id} />
                </>
              ) : accord ? (
                <>
                  <p className="mt-4 rounded-lg bg-ciel-pale px-3 py-2 text-sm text-encre" role="status">
                    Accord donné pour {euros(accord.prix_accorde_cents)}, valable jusqu’à {heure(accord.accord_expire_le)}.
                  </p>
                  <BoutonOption propositionId={proposition.id} ligneId={ligne.id} />
                </>
              ) : verdict.ok && prix !== null ? (
                <BoutonAccord propositionId={proposition.id} ligneId={ligne.id} prixAfficheCents={prix} prixAffiche={euros(prix)} />
              ) : (
                <p className="mt-4 rounded-lg bg-ciel-pale px-3 py-2 text-sm text-encre">{!verdict.ok ? MESSAGES_REFUS_ACCORD[verdict.raison] : ''}</p>
              )}
            </li>
          );
        })}
      </ul>
      </div>
    </>
  );
}

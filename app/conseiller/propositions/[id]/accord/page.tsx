import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PROPOSITION_DEPOT_RECU } from '@/fixtures/dashboard';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { LIMITES } from '@/types/enums';
import { MESSAGES_REFUS_ACCORD, evaluerAccord, prixReverifieCents } from '@/src/domain/accord';
import { BoutonAccord } from './bouton-accord';
import { BoutonOption } from './bouton-option';
import { BoutonConfirmation } from './bouton-confirmation';
import { accordsDemo } from './depot';

// Écran d'accord (E9.3) : prestations, prix revérifié et conditions, puis autorisation d'UNE écriture précise.
// Données : fixtures du dashboard en attendant la route GET /api/propositions/{id} (E4.5).
export default function PageAccord({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Accord avant option</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-600">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const jour = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

async function Contenu({ params }: { params: Promise<{ id: string }> }) {
  await exigerConseiller();
  const { id } = await params;
  const proposition = PROPOSITION_DEPOT_RECU;
  if (proposition.id !== id) notFound();
  const maintenant = new Date();

  return (
    <>
      <p className="mt-2 text-zinc-600">
        Vous autorisez une écriture précise : une prestation, une date, un nombre de participants et un prix. Rien n’est réservé à cette étape.
      </p>

      <section aria-labelledby="conditions" className="mt-6 rounded border border-zinc-300 p-4">
        <h2 id="conditions" className="font-medium">Conditions de l’accord</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700">
          <li>Valable {LIMITES.dureeAccordMinutes} minutes, à usage unique, pour cette prestation, cette date, ce nombre de participants et ce prix seulement.</li>
          <li>Il permet seulement de poser une option : la durée est fixée par le simulateur du prestataire et affichée à la pose.</li>
          <li>La réservation demande ensuite une seconde validation avec la clé d’approbation, saisie par vous.</li>
          <li>Si le prix revérifié change, l’accord est refusé : il faut relire le prix et autoriser de nouveau.</li>
        </ul>
      </section>

      <ul className="mt-6 flex flex-col gap-4">
        {proposition.lignes.map((ligne) => {
          const prix = prixReverifieCents(ligne);
          const accord = accordsDemo.accordValable(ligne.id, maintenant);
          const optionPosee = accordsDemo.accords.find((a) => a.ligne_id === ligne.id && a.statut === 'posee');
          const reservationConfirmee = accordsDemo.accords.find((a) => a.ligne_id === ligne.id && a.statut === 'confirmee');
          const verdict = evaluerAccord({
            statutProposition: proposition.statut,
            ligne,
            prixAfficheCents: prix ?? 0,
            demarcheEnCours: accord !== undefined,
            maintenant,
          });
          const v = ligne.derniere_verification;
          return (
            <li key={ligne.id} className="rounded border border-zinc-300 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{ligne.prestation.nom}</h3>
                <span className="text-sm text-zinc-600">{jour(ligne.date)} · {ligne.participants} participants</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-zinc-500">Prix du catalogue</dt><dd>{euros(ligne.prix_unitaire_catalogue_cents)} / pers.</dd></div>
                <div><dt className="text-zinc-500">Prix revérifié</dt><dd>{v && v.prix_unitaire_cents !== null ? `${euros(v.prix_unitaire_cents)} / pers.` : 'indisponible'}</dd></div>
                <div><dt className="text-zinc-500">Places restantes</dt><dd>{v && v.places_restantes !== null ? v.places_restantes : 'inconnues'}</dd></div>
                <div><dt className="text-zinc-500">Total de la ligne</dt><dd className="font-medium">{prix !== null ? euros(prix) : '—'}</dd></div>
              </dl>
              {v && <p className="mt-1 text-xs text-zinc-500">Vérifié par l’agent à {heure(v.le)}.</p>}

              {reservationConfirmee ? (
                <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">Réservation confirmée : {reservationConfirmee.reservation_id_simulateur ?? 'identifiant non renseigné'}.</p>
              ) : optionPosee ? (
                <>
                  <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
                    Option posée : {optionPosee.option_id_simulateur}. Expiration confirmée par le simulateur : {optionPosee.expire_option_le ? new Date(optionPosee.expire_option_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'non renseignée'}.
                  </p>
                  <BoutonConfirmation propositionId={proposition.id} ligneId={ligne.id} />
                </>
              ) : accord ? (
                <>
                  <p className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
                    Accord donné pour {euros(accord.prix_accorde_cents)}, valable jusqu’à {heure(accord.accord_expire_le)}.
                  </p>
                  <BoutonOption propositionId={proposition.id} ligneId={ligne.id} />
                </>
              ) : verdict.ok && prix !== null ? (
                <BoutonAccord propositionId={proposition.id} ligneId={ligne.id} prixAfficheCents={prix} prixAffiche={euros(prix)} />
              ) : (
                <p className="mt-3 text-sm text-amber-800">{!verdict.ok ? MESSAGES_REFUS_ACCORD[verdict.raison] : ''}</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

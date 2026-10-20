'use client';

import { useActionState } from 'react';
import type { StatutLigne, StatutVerification } from '@/types';
import { accepter, envoyer, indisponible, revoir, saisirTarif, type EtatAction } from './tarifs';

const champ = 'rounded border border-zinc-300 px-2 py-1';
const SOURCES = [
  { id: 'telephone', libelle: 'Téléphone' },
  { id: 'mail', libelle: 'Mail' },
  { id: 'lien', libelle: 'Lien du prestataire' },
] as const;

const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

interface PropsLigne {
  propositionId: string;
  ligneId: string;
  statut: StatutLigne;
  /** La proposition n'est plus modifiable (envoyée ou au-delà). */
  figee: boolean;
  verification: { statut: StatutVerification; prix_unitaire_cents: number | null } | null;
}

/** Tarif d'une ligne (E5.1) : accepter le prix revérifié, saisir un tarif avec sa source, indisponible, revoir. */
export function ActionsLigne({ propositionId, ligneId, statut, figee, verification }: PropsLigne) {
  const [etatAccepter, actionAccepter, accepterEnCours] = useActionState<EtatAction, FormData>(() => accepter(propositionId, ligneId), {});
  const [etatSaisie, actionSaisie, saisieEnCours] = useActionState<EtatAction, FormData>(saisirTarif.bind(null, propositionId, ligneId), {});
  const [etatIndispo, actionIndispo, indispoEnCours] = useActionState<EtatAction, FormData>(() => indisponible(propositionId, ligneId), {});
  const [etatRevoir, actionRevoir, revoirEnCours] = useActionState<EtatAction, FormData>(() => revoir(propositionId, ligneId), {});
  if (figee) return null;

  const erreur = [etatAccepter, etatSaisie, etatIndispo, etatRevoir].map((e) => e.erreurs?.formulaire).find(Boolean);
  const e = etatSaisie.erreurs ?? {};
  const v = etatSaisie.valeurs ?? {};
  const bouton = 'rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50';

  if (statut === 'confirme' || statut === 'indisponible') {
    return (
      <form action={actionRevoir} className="flex flex-col items-end gap-1">
        <button type="submit" disabled={revoirEnCours} className={bouton}>
          Repasser à vérifier
        </button>
        {erreur && <span role="alert" className="text-xs text-red-700">{erreur}</span>}
      </form>
    );
  }
  if (statut !== 'a_verifier') return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {verification?.statut === 'ok' && verification.prix_unitaire_cents !== null && (
        <form action={actionAccepter}>
          <button type="submit" disabled={accepterEnCours} className="rounded bg-green-700 px-2 py-1 text-xs text-white disabled:opacity-50">
            Accepter {euros(verification.prix_unitaire_cents)} (agent)
          </button>
        </form>
      )}
      <details open={Object.keys(e).length > 0} className="text-right">
        <summary className="cursor-pointer text-xs underline underline-offset-4">Saisir un tarif</summary>
        <form key={JSON.stringify(v)} action={actionSaisie} noValidate className="mt-2 flex flex-col items-end gap-1">
          <label className="flex items-center gap-1 text-xs">
            Prix par personne (€)
            <input name="montant" inputMode="decimal" defaultValue={v.montant} className={`${champ} w-20 text-right`} aria-invalid={!!e.montant} />
          </label>
          {e.montant && <span role="alert" className="text-xs text-red-700">{e.montant}</span>}
          <label className="flex items-center gap-1 text-xs">
            Source
            <select name="source" defaultValue={v.source ?? ''} className={champ} aria-invalid={!!e.source}>
              <option value="" disabled>
                choisir
              </option>
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          {e.source && <span role="alert" className="text-xs text-red-700">{e.source}</span>}
          <button type="submit" disabled={saisieEnCours} className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50">
            Confirmer ce tarif
          </button>
        </form>
      </details>
      <form action={actionIndispo}>
        <button type="submit" disabled={indispoEnCours} className={bouton}>
          {verification?.statut === 'indisponible' ? 'Accepter : indisponible' : 'Marquer indisponible'}
        </button>
      </form>
      {erreur && <span role="alert" className="text-xs text-red-700">{erreur}</span>}
    </div>
  );
}

/** Envoi (E5.1) : le bouton reste désactivé tant qu'une ligne est à vérifier ou indisponible, ou qu'une alerte bloque. */
export function PanneauEnvoi({ propositionId, bloquants }: { propositionId: string; bloquants: string[] }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(() => envoyer(propositionId), {});
  const raisons = etat.bloquants ?? bloquants;
  const bloque = raisons.length > 0;
  return (
    <form action={action} className="mt-8 flex flex-col gap-2 rounded border border-zinc-200 p-4">
      <button
        type="submit"
        disabled={bloque || enCours}
        aria-describedby={bloque ? 'envoi-bloque' : undefined}
        className="self-start rounded bg-zinc-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enCours ? 'Envoi…' : 'Envoyer au client'}
      </button>
      {bloque ? (
        <div id="envoi-bloque" className="text-sm text-amber-900">
          <p>Envoi impossible tant que :</p>
          <ul className="list-inside list-disc">
            {raisons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">Tous les prix sont vérifiés. L’envoi marque la proposition « envoyée » à votre nom.</p>
      )}
      {etat.erreurs?.formulaire && <p role="alert" className="text-sm text-red-700">{etat.erreurs.formulaire}</p>}
    </form>
  );
}

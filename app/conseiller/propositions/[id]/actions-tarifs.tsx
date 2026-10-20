'use client';

import { useActionState } from 'react';
import type { StatutLigne, StatutVerification } from '@/types';
import { accepter, envoyer, indisponible, remplacer, revoir, saisirTarif, type EtatAction } from './tarifs';

const champ = 'rounded-lg border border-[#b7c7d3] bg-white px-2 py-1';
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
  /** E5.2 : prestations du catalogue qui peuvent remplacer une ligne indisponible. */
  remplacantes?: { id: string; nom: string; prix_unitaire_cents: number; capacite: number }[];
  /** Prestation et date actuelles de la ligne : la même prestation peut être reprise à une autre date. */
  prestationId?: string;
  date?: string;
}

/** Tarif d'une ligne (E5.1) : accepter le prix revérifié, saisir un tarif avec sa source, indisponible, revoir ; remplacer (E5.2). */
export function ActionsLigne({ propositionId, ligneId, statut, figee, verification, remplacantes = [], prestationId, date }: PropsLigne) {
  const [etatAccepter, actionAccepter, accepterEnCours] = useActionState<EtatAction, FormData>(() => accepter(propositionId, ligneId), {});
  const [etatSaisie, actionSaisie, saisieEnCours] = useActionState<EtatAction, FormData>(saisirTarif.bind(null, propositionId, ligneId), {});
  const [etatIndispo, actionIndispo, indispoEnCours] = useActionState<EtatAction, FormData>(() => indisponible(propositionId, ligneId), {});
  const [etatRevoir, actionRevoir, revoirEnCours] = useActionState<EtatAction, FormData>(() => revoir(propositionId, ligneId), {});
  const [etatRemplacer, actionRemplacer, remplacerEnCours] = useActionState<EtatAction, FormData>(remplacer.bind(null, propositionId, ligneId), {});
  if (figee) return null;

  const erreur = [etatAccepter, etatSaisie, etatIndispo, etatRevoir, etatRemplacer].map((e) => e.erreurs?.formulaire).find(Boolean);
  const e = etatSaisie.erreurs ?? {};
  const v = etatSaisie.valeurs ?? {};
  const bouton = 'rounded-lg border border-[#b7c7d3] bg-white px-2 py-1 text-xs hover:bg-ciel disabled:opacity-50';

  if (statut === 'confirme' || statut === 'indisponible') {
    const er = etatRemplacer.erreurs ?? {};
    const vr = etatRemplacer.valeurs ?? {};
    return (
      <div className="flex flex-col items-end gap-2">
        {statut === 'indisponible' && (
          <details open={Object.keys(er).length > 0} className="text-right">
            <summary className="cursor-pointer text-xs underline underline-offset-4">Remplacer la prestation</summary>
            {remplacantes.length === 0 ? (
              <p className="mt-2 text-xs text-doux">Aucune prestation active à cette destination.</p>
            ) : (
              <form key={JSON.stringify(vr)} action={actionRemplacer} noValidate className="mt-2 flex flex-col items-end gap-1">
                <label className="flex items-center gap-1 text-xs">
                  Prestation
                  <select name="prestation" defaultValue={vr.prestation ?? ''} className={champ} aria-invalid={!!er.prestationId}>
                    <option value="" disabled>
                      choisir
                    </option>
                    {remplacantes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.id === prestationId ? `${p.nom} (même prestation, autre date)` : p.nom} · {euros(p.prix_unitaire_cents)} · {p.capacite} pers. max
                      </option>
                    ))}
                  </select>
                </label>
                {er.prestationId && <span role="alert" className="text-xs text-red-700">{er.prestationId}</span>}
                <label className="flex items-center gap-1 text-xs">
                  Date
                  <input type="date" name="date" defaultValue={vr.date ?? date} className={champ} aria-invalid={!!er.date} />
                </label>
                {er.date && <span role="alert" className="text-xs text-red-700">{er.date}</span>}
                <button type="submit" disabled={remplacerEnCours} className="rounded-lg bg-nuit px-2 py-1 text-xs text-white hover:bg-[#0a3a57] disabled:opacity-50">
                  Remplacer (nouvelle ligne à vérifier)
                </button>
              </form>
            )}
          </details>
        )}
        <form action={actionRevoir}>
          <button type="submit" disabled={revoirEnCours} className={bouton}>
            Repasser à vérifier
          </button>
        </form>
        {erreur && <span role="alert" className="text-xs text-red-700">{erreur}</span>}
      </div>
    );
  }
  if (statut !== 'a_verifier') return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {verification?.statut === 'ok' && verification.prix_unitaire_cents !== null && (
        <form action={actionAccepter}>
          <button type="submit" disabled={accepterEnCours} className="rounded-lg bg-green-700 px-2 py-1 text-xs text-white disabled:opacity-50">
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
          <button type="submit" disabled={saisieEnCours} className="rounded-lg bg-nuit hover:bg-[#0a3a57] px-2 py-1 text-xs text-white disabled:opacity-50">
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
    <form action={action} className="panneau flex flex-col gap-3 border-t-4 border-t-orange p-5">
      <h2 className="text-xl">Envoi au client</h2>
      <button
        type="submit"
        disabled={bloque || enCours}
        aria-describedby={bloque ? 'envoi-bloque' : undefined}
        className="btn-principal self-start disabled:cursor-not-allowed disabled:bg-doux! disabled:opacity-100!"
      >
        {enCours ? 'Envoi…' : 'Envoyer au client'}
      </button>
      {bloque ? (
        <div id="envoi-bloque" className="text-sm text-amber-950">
          <p>Envoi impossible tant que :</p>
          <ul className="list-inside list-disc">
            {raisons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-doux">Tous les prix sont vérifiés. L’envoi marque la proposition « envoyée » à votre nom.</p>
      )}
      {etat.erreurs?.formulaire && <p role="alert" className="text-sm text-red-700">{etat.erreurs.formulaire}</p>}
    </form>
  );
}

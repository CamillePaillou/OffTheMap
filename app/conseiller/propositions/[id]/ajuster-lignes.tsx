'use client';

import { startTransition, useActionState } from 'react';
import { ajouter, ajusterNuits, changerBudget, changerParticipants, modifier, type EtatAction } from './tarifs';

const champ = 'rounded-lg border border-[#d5d9df] bg-white px-2 py-1';
const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const pastille = 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d5d9df] bg-white text-base font-semibold leading-none text-encre hover:bg-brume disabled:opacity-40';

/** AAAA-MM-JJ → « 7 nov. », sans décalage de fuseau. */
const jourCourt = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Séjour : « − » et « + » (E6.6). Une nuit de moins ou de plus, la date de retour suit ; écrit dans les dates fixes de la
 * fiche, puis les alertes de dates sont recalculées. Les lignes (la nuit d'hôtel) s'ajoutent à part.
 */
export function SejourPlusMoins({ propositionId, debut, fin, nuits }: { propositionId: string; debut: string; fin: string; nuits: number }) {
  const [etatMoins, actionMoins, moinsEnCours] = useActionState<EtatAction, FormData>(() => ajusterNuits(propositionId, -1), {});
  const [etatPlus, actionPlus, plusEnCours] = useActionState<EtatAction, FormData>(() => ajusterNuits(propositionId, 1), {});
  const erreur = etatMoins.erreurs?.formulaire ?? etatPlus.erreurs?.formulaire;
  const enCours = moinsEnCours || plusEnCours;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ardoise">Séjour :</span>
      <span className="font-semibold text-encre">
        {jourCourt(debut)} → {jourCourt(fin)} · {nuits} nuit{nuits > 1 ? 's' : ''}
      </span>
      <form action={actionMoins}>
        <button type="submit" disabled={enCours || nuits === 0} className={pastille} aria-label="Une nuit de moins" title="Une nuit de moins (retour un jour plus tôt)">
          −
        </button>
      </form>
      <form action={actionPlus}>
        <button type="submit" disabled={enCours || nuits >= 14} className={pastille} aria-label="Une nuit de plus" title="Une nuit de plus (retour un jour plus tard)">
          +
        </button>
      </form>
      {erreur && <span role="alert" className="text-grenade">{erreur}</span>}
    </div>
  );
}

/**
 * Budget réel du groupe : « Modifier » (E6.6), quand le client accepte de payer plus ou moins. Un champ en euros plutôt que
 * « − » / « + » : un budget n'avance pas par pas fixes. Écrit dans la fiche, puis les alertes de budget sont recalculées.
 */
export function ModifierBudget({ propositionId, budgetCents }: { propositionId: string; budgetCents: number | null }) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(changerBudget.bind(null, propositionId), {});
  const e = etat.erreurs ?? {};
  const v = etat.valeurs ?? {};
  return (
    <details open={Object.keys(e).length > 0} className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs underline underline-offset-4">
        {budgetCents === null ? 'Indiquer le budget réel' : 'Modifier le budget'}
      </summary>
      <form key={JSON.stringify(v)} action={action} noValidate className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          Nouveau budget (€)
          <input
            name="budget"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={v.budget ?? (budgetCents === null ? '' : String(budgetCents / 100))}
            className={`${champ} w-28 text-right`}
            aria-invalid={!!e.budget}
          />
        </label>
        <button type="submit" disabled={enCours} className="bo-btn-2 px-3! py-1! text-xs">
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {(e.budget ?? e.formulaire) && <span role="alert" className="w-full text-xs text-grenade">{e.budget ?? e.formulaire}</span>}
      </form>
    </details>
  );
}

/** Participants d'une ligne : « − » et « + » (E6.6). La ligne repasse à vérifier, sans prix confirmé. */
export function ParticipantsPlusMoins({ propositionId, ligneId, participants, confirmee }: {
  propositionId: string;
  ligneId: string;
  participants: number;
  confirmee: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatAction, number>((_e, n) => changerParticipants(propositionId, ligneId, n), {});
  // une ligne confirmée perd son tarif : on le demande avant
  const changer = (n: number) => {
    if (confirmee && !window.confirm('Le tarif confirmé de cette ligne ne vaudra plus : elle repassera à vérifier. Continuer ?')) return;
    startTransition(() => action(n)); // hors d'un formulaire, l'action se lance dans une transition
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <button type="button" disabled={enCours || participants <= 1} onClick={() => changer(participants - 1)} className={pastille} aria-label="Un participant de moins">
          −
        </button>
        <span className="min-w-[1.5ch] text-center">{participants}</span>
        <button type="button" disabled={enCours || participants >= 20} onClick={() => changer(participants + 1)} className={pastille} aria-label="Un participant de plus">
          +
        </button>
      </span>
      {etat.erreurs?.formulaire && <span role="alert" className="text-xs text-grenade">{etat.erreurs.formulaire}</span>}
    </span>
  );
}

/** Changer la date ou les participants d'une ligne (E6.6) : elle repasse « à vérifier », sans prix confirmé. */
export function ModifierLigne({ propositionId, ligneId, date, participants, confirmee }: {
  propositionId: string;
  ligneId: string;
  date: string;
  participants: number;
  /** Le tarif confirmé sera perdu : on le dit avant. */
  confirmee: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(modifier.bind(null, propositionId, ligneId), {});
  const e = etat.erreurs ?? {};
  const v = etat.valeurs ?? {};
  return (
    <details open={Object.keys(e).length > 0} className="text-right">
      <summary className="cursor-pointer text-xs underline underline-offset-4">Changer la date ou les participants</summary>
      <form key={JSON.stringify(v)} action={action} noValidate className="mt-2 flex flex-col items-end gap-1">
        <label className="flex items-center gap-1 text-xs">
          Date
          <input type="date" name="date" defaultValue={v.date ?? date} className={champ} aria-invalid={!!e.date} />
        </label>
        {e.date && <span role="alert" className="text-xs text-grenade">{e.date}</span>}
        <label className="flex items-center gap-1 text-xs">
          Participants
          <input type="number" name="participants" min={1} max={20} defaultValue={v.participants ?? participants} className={`${champ} w-16 text-right`} aria-invalid={!!e.participants} />
        </label>
        {e.participants && <span role="alert" className="text-xs text-grenade">{e.participants}</span>}
        {confirmee && <span className="max-w-56 text-xs text-ardoise">Le tarif confirmé ne vaudra plus : la ligne repassera à vérifier.</span>}
        <button type="submit" disabled={enCours} className="bo-btn px-2.5! py-1! text-xs">
          {enCours ? 'Enregistrement…' : 'Enregistrer (ligne à vérifier)'}
        </button>
        {e.formulaire && <span role="alert" className="text-xs text-grenade">{e.formulaire}</span>}
      </form>
    </details>
  );
}

/** Ajouter une prestation du catalogue (E6.6), par exemple une nuit d'hôtel de plus : nouvelle ligne à vérifier. */
export function AjouterLigne({ propositionId, prestations, date, participants }: {
  propositionId: string;
  prestations: { id: string; nom: string; prix_unitaire_cents: number; capacite: number }[];
  /** Valeurs proposées par défaut : dernière date et participants des lignes existantes. */
  date: string;
  participants: number;
}) {
  const [etat, action, enCours] = useActionState<EtatAction, FormData>(ajouter.bind(null, propositionId), {});
  const e = etat.erreurs ?? {};
  const v = etat.valeurs ?? {};
  return (
    <details open={Object.keys(e).length > 0} className="bo-carte mt-4 p-4">
      <summary className="cursor-pointer font-semibold text-encre">Ajouter une prestation</summary>
      {prestations.length === 0 ? (
        <p className="mt-2 text-sm text-ardoise">Aucune prestation active à cette destination.</p>
      ) : (
        <form key={JSON.stringify(v)} action={action} noValidate className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Prestation
            <select name="prestation" defaultValue={v.prestation ?? ''} className={champ} aria-invalid={!!e.prestationId}>
              <option value="" disabled>
                choisir
              </option>
              {prestations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} · {euros(p.prix_unitaire_cents)} · {p.capacite} pers. max
                </option>
              ))}
            </select>
            {e.prestationId && <span role="alert" className="text-xs text-grenade">{e.prestationId}</span>}
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" name="date" defaultValue={v.date ?? date} className={champ} aria-invalid={!!e.date} />
            {e.date && <span role="alert" className="text-xs text-grenade">{e.date}</span>}
          </label>
          <label className="flex flex-col gap-1">
            Participants
            <input type="number" name="participants" min={1} max={20} defaultValue={v.participants ?? participants} className={`${champ} w-20 text-right`} aria-invalid={!!e.participants} />
            {e.participants && <span role="alert" className="text-xs text-grenade">{e.participants}</span>}
          </label>
          <button type="submit" disabled={enCours} className="bo-btn-2 text-sm">
            {enCours ? 'Ajout…' : 'Ajouter (ligne à vérifier, prix catalogue)'}
          </button>
          {e.formulaire && <span role="alert" className="w-full text-sm text-grenade">{e.formulaire}</span>}
        </form>
      )}
    </details>
  );
}

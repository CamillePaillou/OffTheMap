'use client';

import { useActionState } from 'react';
import { demanderBrouillonAction, enregistrerCorrection, relancer, type EtatCorrection } from './actions';

const champ = 'rounded border border-zinc-300 px-3 py-2';

export interface ValeursCorrection {
  budget_reel_euros: string;
  date_debut_fixe: string;
  date_fin_fixe: string;
  nb_nuits_fixe: string;
  notes_conseiller: string;
}

/** Budget réel, dates fixes et notes, saisis après l'entretien. Une régénération de la fiche ne les écrase pas. */
export function FormulaireCorrection({ dossierId, valeurs }: { dossierId: string; valeurs: ValeursCorrection }) {
  const [etat, action, enCours] = useActionState<EtatCorrection, FormData>(enregistrerCorrection.bind(null, dossierId), {});
  const e = etat.erreurs ?? {};
  // après une erreur, la saisie est reprise ; après un enregistrement, les valeurs relues en base
  const v: ValeursCorrection = { ...valeurs, ...etat.valeurs };
  const erreur = (nom: string) =>
    e[nom] ? (
      <span id={`${nom}-erreur`} role="alert" className="text-sm text-red-700">
        {e[nom]}
      </span>
    ) : null;
  const decrit = (nom: string) => (e[nom] ? { 'aria-invalid': true, 'aria-describedby': `${nom}-erreur` } : {});

  return (
    // La clé remonte le formulaire quand les valeurs changent : defaultValue n'est lu qu'au montage.
    <form key={JSON.stringify(v)} action={action} noValidate className="mt-4 flex flex-col gap-4">
      {e.formulaire && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {e.formulaire}
        </p>
      )}
      <label className="flex flex-col gap-1 sm:max-w-xs">
        <span className="text-sm font-medium">Budget réel du groupe (€)</span>
        <input name="budget_reel_euros" type="number" min={1} step={1} inputMode="numeric" defaultValue={v.budget_reel_euros} className={champ} {...decrit('budget_reel_euros')} />
        {erreur('budget_reel_euros')}
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Départ fixé</span>
          <input name="date_debut_fixe" type="date" defaultValue={v.date_debut_fixe} className={champ} {...decrit('date_debut_fixe')} />
          {erreur('date_debut_fixe')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Retour fixé</span>
          <input name="date_fin_fixe" type="date" defaultValue={v.date_fin_fixe} className={champ} {...decrit('date_fin_fixe')} />
          {erreur('date_fin_fixe')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nuits</span>
          <input name="nb_nuits_fixe" type="number" min={0} max={14} step={1} defaultValue={v.nb_nuits_fixe} className={champ} {...decrit('nb_nuits_fixe')} />
          {erreur('nb_nuits_fixe')}
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notes de l’entretien</span>
        <textarea name="notes_conseiller" rows={4} defaultValue={v.notes_conseiller} className={champ} {...decrit('notes_conseiller')} />
        {erreur('notes_conseiller')}
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={enCours} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50">
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {etat.enregistre && !enCours && (
          <span role="status" className="text-sm text-green-700">
            Correction enregistrée.
          </span>
        )}
      </div>
    </form>
  );
}

export function BoutonRelancer({ dossierId }: { dossierId: string }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => relancer(dossierId), {});
  return (
    <form action={action} className="flex items-center gap-4">
      <button type="submit" disabled={enCours} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
        {enCours ? 'Relance…' : 'Relancer'}
      </button>
      {etat.erreur && (
        <span role="alert" className="text-sm text-red-700">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}

/** « Générer le brouillon » (E4.4). En entretien_fait, le clic valide aussi la fiche (dossier en_proposition). */
export function BoutonBrouillon({ dossierId, valideFiche }: { dossierId: string; valideFiche: boolean }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => demanderBrouillonAction(dossierId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={enCours} className="rounded border border-zinc-400 px-4 py-2 disabled:opacity-50">
        {enCours ? 'Lancement…' : valideFiche ? 'Valider la fiche et générer le brouillon' : 'Générer le brouillon'}
      </button>
      {etat.erreur && !enCours && (
        <span role="alert" className="text-sm text-red-700">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}

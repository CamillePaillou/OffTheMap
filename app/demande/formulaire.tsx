'use client';

import { useActionState } from 'react';
import { envoyerDemande, type EtatDemande } from './actions';

const REGIMES = [
  { id: 'vegetarien', libelle: 'Végétarien' },
  { id: 'vegetalien', libelle: 'Végétalien' },
  { id: 'sans_gluten', libelle: 'Sans gluten' },
  { id: 'allergie', libelle: 'Allergie alimentaire' },
  { id: 'autre', libelle: 'Autre' },
] as const;

const champ = 'rounded border border-zinc-300 px-3 py-2';

export function FormulaireDemande() {
  const [etat, action, enCours] = useActionState<EtatDemande, FormData>(envoyerDemande, {});
  const v = etat.valeurs ?? {};
  const e = etat.erreurs ?? {};
  const erreur = (nom: string) =>
    e[nom] ? (
      <span id={`${nom}-erreur`} role="alert" className="text-sm text-red-700">
        {e[nom]}
      </span>
    ) : null;
  const decrit = (nom: string) => (e[nom] ? { 'aria-invalid': true, 'aria-describedby': `${nom}-erreur` } : {});

  return (
    // La clé remonte le formulaire après une erreur : les valeurs saisies sont reprises par defaultValue.
    <form key={JSON.stringify(v)} action={action} noValidate className="mt-8 flex flex-col gap-8">
      {e.formulaire && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {e.formulaire}
        </p>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Vous</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nom et prénom</span>
          <input name="nom" autoComplete="name" required defaultValue={v.nom} className={champ} {...decrit('nom')} />
          {erreur('nom')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Adresse e-mail</span>
          <input name="email" type="email" autoComplete="email" required defaultValue={v.email} className={champ} {...decrit('email')} />
          {erreur('email')}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Votre voyage</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Destination souhaitée (laisser vide si vous n’avez pas d’idée)</span>
          <input name="destination" defaultValue={v.destination} className={champ} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Départ</span>
            <input name="date_debut" type="date" required defaultValue={v.date_debut} className={champ} {...decrit('date_debut')} />
            {erreur('date_debut')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Retour</span>
            <input name="date_fin" type="date" required defaultValue={v.date_fin} className={champ} {...decrit('date_fin')} />
            {erreur('date_fin')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre de nuits</span>
            <input name="nb_nuits" type="number" min={0} max={14} required defaultValue={v.nb_nuits} className={champ} {...decrit('nb_nuits')} />
            {erreur('nb_nuits')}
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Les voyageurs</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Adultes</span>
            <input name="adultes" type="number" min={1} max={20} required defaultValue={v.adultes ?? '2'} className={champ} {...decrit('adultes')} />
            {erreur('adultes')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Enfants (moins de 18 ans)</span>
            <input name="enfants" type="number" min={0} max={19} defaultValue={v.enfants ?? '0'} className={champ} {...decrit('enfants')} />
            {erreur('enfants')}
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Budget</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Budget total pour tout le groupe, en euros (facultatif)</span>
          <input name="budget_euros" type="number" min={1} step={1} defaultValue={v.budget_euros} className={champ} {...decrit('budget_euros')} />
          {erreur('budget_euros')}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Vos envies</legend>
        <p className="text-sm text-zinc-600">N’indiquez ici aucune information de santé : cochez plutôt les cases plus bas.</p>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ce qui vous ferait plaisir</span>
          <textarea name="envies" rows={4} defaultValue={v.envies} className={champ} {...decrit('envies')} />
          {erreur('envies')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ce qu’il faut éviter ou prévoir</span>
          <textarea name="contraintes" rows={3} defaultValue={v.contraintes} className={champ} {...decrit('contraintes')} />
          {erreur('contraintes')}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-medium">Alimentation et mobilité (facultatif)</legend>
        <p className="text-sm text-zinc-600">
          Elles servent à choisir des repas et des activités adaptés. Le conseiller vous contactera pour les détails.
        </p>
        <div className="flex flex-wrap gap-4">
          {REGIMES.map((r) => (
            <label key={r.id} className="flex items-center gap-2">
              <input name={`regime_${r.id}`} type="checkbox" defaultChecked={v[`regime_${r.id}`] === 'on'} />
              <span className="text-sm">{r.libelle}</span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input name="mobilite_reduite" type="checkbox" defaultChecked={v.mobilite_reduite === 'on'} />
          <span className="text-sm">Un voyageur a une mobilité réduite</span>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-medium">Vos accords</legend>
        <label className="flex items-start gap-2">
          <input name="consentement_rgpd" type="checkbox" className="mt-1" defaultChecked={v.consentement_rgpd === 'on'} {...decrit('consentement_rgpd')} />
          <span className="text-sm">
            J’accepte que Detour utilise ces informations pour préparer ma proposition de voyage et me recontacter.
          </span>
        </label>
        {erreur('consentement_rgpd')}
        <label className="flex items-start gap-2">
          <input name="consentement_ia" type="checkbox" className="mt-1" defaultChecked={v.consentement_ia === 'on'} {...decrit('consentement_ia')} />
          <span className="text-sm">
            J’ai compris que ma demande est d’abord résumée par une intelligence artificielle, sans mon nom ni mes coordonnées, puis lue
            par un conseiller qui prépare et valide la proposition.
          </span>
        </label>
        {erreur('consentement_ia')}
      </fieldset>

      <button type="submit" disabled={enCours} className="self-start rounded bg-zinc-900 px-5 py-2 text-white disabled:opacity-60">
        {enCours ? 'Envoi…' : 'Envoyer ma demande'}
      </button>
    </form>
  );
}

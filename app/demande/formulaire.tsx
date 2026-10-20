'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { Ligne } from '../_composants/ligne';
import type { ChampCorrigeable, Commentaires } from '@/types/correction';
import { envoyerDemande, type EtatDemande } from './actions';

const REGIMES = [
  { id: 'vegetarien', libelle: 'Végétarien' },
  { id: 'vegetalien', libelle: 'Végétalien' },
  { id: 'sans_gluten', libelle: 'Sans gluten' },
  { id: 'allergie', libelle: 'Allergie alimentaire' },
  { id: 'autre', libelle: 'Autre' },
] as const;

const champ = 'rounded-lg border border-[#b7c7d3] bg-white px-3 py-2.5 hover:border-doux';

const APRES_ENVOI = [
  { libelle: 'Demande envoyée', detail: 'Vous recevez la confirmation à l’écran.' },
  { libelle: 'Un conseiller la lit', detail: 'Il vous écrit si un point est à préciser.' },
  { libelle: 'Prix vérifiés', detail: 'Chaque prestation est confirmée auprès du prestataire.' },
  { libelle: 'Proposition par mail', detail: 'Programme jour par jour et total.' },
];

const dateLongue = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Étapes du formulaire : une station remplie se colore (« la ligne »). Les facultatives le sont dès qu'on y touche. */
const STATIONS: Record<string, (v: Record<string, string>) => boolean> = {
  vous: (v) => !!v.nom?.trim() && !!v.email?.trim(),
  voyage: (v) => !!v.date_debut && !!v.date_fin && v.nb_nuits !== undefined && v.nb_nuits !== '',
  voyageurs: (v) => Number(v.adultes) >= 1,
  budget: (v) => !!v.budget_euros,
  envies: (v) => !!v.envies?.trim() || !!v.contraintes?.trim(),
  besoins: (v) => Object.keys(v).some((k) => k.startsWith('regime_') || k === 'mobilite_reduite'),
  accords: (v) => v.consentement_rgpd === 'on' && v.consentement_ia === 'on',
};
const OBLIGATOIRES = ['vous', 'voyage', 'voyageurs', 'accords'] as const;

function lire(form: HTMLFormElement): Record<string, string> {
  const v: Record<string, string> = {};
  new FormData(form).forEach((valeur, cle) => {
    if (typeof valeur === 'string') v[cle] = valeur;
  });
  return v;
}

type Action = (etat: EtatDemande, formulaire: FormData) => Promise<EtatDemande>;

interface Props {
  /** Action serveur appelée à l'envoi : dépôt (E1.1) par défaut, correction (E1.2) depuis un lien. */
  action?: Action;
  /** Valeurs de départ : la version à corriger. */
  initiales?: Record<string, string>;
  /** Champs (attribut name) que le conseiller demande de revoir. */
  surlignes?: readonly string[];
  /** Petit commentaire du conseiller par point signalé : explique au client pourquoi le champ ne va pas. */
  commentaires?: Commentaires;
  libelleEnvoi?: string;
}

export function FormulaireDemande({
  action: envoyer = envoyerDemande,
  initiales,
  surlignes = [],
  commentaires = {},
  libelleEnvoi = 'Envoyer ma demande',
}: Props) {
  const [etat, action, enCours] = useActionState<EtatDemande, FormData>(envoyer, {});
  const v = etat.valeurs ?? initiales ?? {};
  const e = etat.erreurs ?? {};
  // ce que le client a saisi, relu à chaque frappe pour le récapitulatif et les stations
  const [saisie, setSaisie] = useState<Record<string, string> | null>(null);
  const courant = saisie ?? v;
  const suivre = (ev: FormEvent<HTMLFormElement>) => setSaisie(lire(ev.currentTarget));
  const rempli = (station: keyof typeof STATIONS) => (STATIONS[station]!(courant) ? 'true' : 'false');
  const faites = OBLIGATOIRES.filter((o) => STATIONS[o]!(courant)).length;
  const aRevoir = (nom: string) => surlignes.includes(nom);
  // champ signalé par le conseiller : bordure et fond ambre, et annonce pour les lecteurs d'écran
  const c = (nom: string) => (aRevoir(nom) ? `${champ} border-amber-500! bg-amber-50 ring-2 ring-amber-300` : champ);
  const note = (point: ChampCorrigeable) =>
    commentaires[point] ? (
      <p id={`note-${point}`} className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <span className="font-medium">Votre conseiller : </span>
        {commentaires[point]}
      </p>
    ) : null;
  const groupe = (prefixe: string) =>
    surlignes.some((n) => n.startsWith(prefixe)) ? 'rounded-lg p-3 ring-2 ring-amber-300 bg-amber-50' : '';
  const erreur = (nom: string) =>
    e[nom] ? (
      <span id={`${nom}-erreur`} role="alert" className="text-sm font-semibold text-red-700">
        {e[nom]}
      </span>
    ) : null;
  const decrit = (nom: string) =>
    e[nom] ? { 'aria-invalid': true, 'aria-describedby': `${nom}-erreur` } : aRevoir(nom) ? { 'aria-describedby': 'points-a-revoir' } : {};

  return (
    // La clé remonte le formulaire après une erreur : les valeurs saisies sont reprises par defaultValue.
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <form key={JSON.stringify(v)} action={action} onInput={suivre} onChange={suivre} noValidate className="panneau ligne-formulaire flex flex-col gap-8 p-5 sm:p-8">
      {e.formulaire && (
        <p role="alert" className="rounded-lg border-l-4 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
          {e.formulaire}
        </p>
      )}

      <fieldset data-rempli={rempli('vous')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Vous</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nom et prénom</span>
          <input name="nom" autoComplete="name" required defaultValue={v.nom} className={c('nom')} {...decrit('nom')} />
          {erreur('nom')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Adresse e-mail</span>
          <input name="email" type="email" autoComplete="email" required defaultValue={v.email} className={c('email')} {...decrit('email')} />
          {erreur('email')}
        </label>
        {note('email')}
      </fieldset>

      <fieldset data-rempli={rempli('voyage')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Votre voyage</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Destination souhaitée (laisser vide si vous n’avez pas d’idée)</span>
          <input name="destination" defaultValue={v.destination} className={c('destination')} />
        </label>
        {note('destination')}
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Départ</span>
            <input name="date_debut" type="date" required defaultValue={v.date_debut} className={c('date_debut')} {...decrit('date_debut')} />
            {erreur('date_debut')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Retour</span>
            <input name="date_fin" type="date" required defaultValue={v.date_fin} className={c('date_fin')} {...decrit('date_fin')} />
            {erreur('date_fin')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre de nuits</span>
            <input name="nb_nuits" type="number" min={0} max={14} required defaultValue={v.nb_nuits} className={c('nb_nuits')} {...decrit('nb_nuits')} />
            {erreur('nb_nuits')}
          </label>
        </div>
        {note('dates')}
        {note('nb_nuits')}
      </fieldset>

      <fieldset data-rempli={rempli('voyageurs')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Les voyageurs</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Adultes</span>
            <input name="adultes" type="number" min={1} max={20} required defaultValue={v.adultes ?? '2'} className={c('adultes')} {...decrit('adultes')} />
            {erreur('adultes')}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Enfants (moins de 18 ans)</span>
            <input name="enfants" type="number" min={0} max={19} defaultValue={v.enfants ?? '0'} className={c('enfants')} {...decrit('enfants')} />
            {erreur('enfants')}
          </label>
        </div>
        {note('voyageurs')}
      </fieldset>

      <fieldset data-rempli={rempli('budget')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Budget (facultatif)</legend>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Budget total pour tout le groupe, en euros</span>
          <span className="text-sm text-doux">Le conseiller compose le séjour dans cette enveloppe, transport compris.</span>
          <input name="budget_euros" type="number" min={1} step={1} defaultValue={v.budget_euros} className={c('budget_euros')} {...decrit('budget_euros')} />
          {erreur('budget_euros')}
        </label>
        {note('budget')}
      </fieldset>

      <fieldset data-rempli={rempli('envies')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Vos envies</legend>
        <p className="text-sm text-doux">N’indiquez ici aucune information de santé : cochez plutôt les cases plus bas.</p>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ce qui vous ferait plaisir</span>
          <textarea name="envies" rows={4} defaultValue={v.envies} className={c('envies')} {...decrit('envies')} />
          {erreur('envies')}
        </label>
        {note('envies')}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ce qu’il faut éviter ou prévoir</span>
          <textarea name="contraintes" rows={3} defaultValue={v.contraintes} className={c('contraintes')} {...decrit('contraintes')} />
          {erreur('contraintes')}
        </label>
        {note('contraintes')}
      </fieldset>

      <fieldset data-rempli={rempli('besoins')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Alimentation et mobilité (facultatif)</legend>
        <p className="text-sm text-doux">
          Elles servent à choisir des repas et des activités adaptés. Le conseiller vous contactera pour les détails.
        </p>
        <div className={`flex flex-wrap gap-4 ${groupe('regime_')}`}>
          {REGIMES.map((r) => (
            <label key={r.id} className="flex items-center gap-2">
              <input name={`regime_${r.id}`} type="checkbox" defaultChecked={v[`regime_${r.id}`] === 'on'} />
              <span className="text-sm">{r.libelle}</span>
            </label>
          ))}
        </div>
        {note('regimes')}
        <label className={`flex items-center gap-2 ${groupe('mobilite_')}`}>
          <input name="mobilite_reduite" type="checkbox" defaultChecked={v.mobilite_reduite === 'on'} />
          <span className="text-sm">Un voyageur a une mobilité réduite</span>
        </label>
        {note('mobilite')}
      </fieldset>

      <fieldset data-rempli={rempli('accords')} className="flex flex-col gap-3">
        <legend className="mb-3 text-xl">Vos accords</legend>
        <label className="flex items-start gap-2">
          <input name="consentement_rgpd" type="checkbox" className="mt-1" defaultChecked={v.consentement_rgpd === 'on'} {...decrit('consentement_rgpd')} />
          <span className="text-sm">
            J’accepte que DÉTOUR utilise ces informations pour préparer ma proposition de voyage et me recontacter.
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

      {etat.inchanges && etat.inchanges.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Ces points n’ont pas changé : {etat.inchanges.join(', ')}.</p>
          <p>Le conseiller vous a demandé de les revoir. S’ils sont exacts tels quels, confirmez-le avant d’envoyer.</p>
          <label className="flex items-center gap-2">
            <input name="confirmer_inchanges" type="checkbox" />
            <span>Je confirme que ces informations sont exactes</span>
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-filet pt-6 sm:flex-row sm:items-center sm:gap-5">
        <button type="submit" disabled={enCours} className="btn-principal self-start text-lg">
          {enCours ? 'Envoi…' : libelleEnvoi}
        </button>
        <p className="text-sm text-doux">Gratuit et sans engagement.</p>
      </div>
    </form>

    <aside aria-label="Récapitulatif de votre demande" className="flex flex-col gap-6 lg:sticky lg:top-6">
      <Billet v={courant} faites={faites} />
      <div className="px-1">
        <h2 className="text-lg">Après l’envoi</h2>
        <div className="mt-3">
          <Ligne titre="Ce qui se passe après l’envoi" stations={APRES_ENVOI} actuelle={-1} compacte verticale />
        </div>
      </div>
    </aside>
    </div>
  );
}

/** Le « billet » : la demande telle que le conseiller la lira, mise à jour pendant la saisie. */
function Billet({ v, faites }: { v: Record<string, string>; faites: number }) {
  const adultes = Number(v.adultes) || 0;
  const enfants = Number(v.enfants) || 0;
  const nuits = v.nb_nuits === undefined || v.nb_nuits === '' ? null : Number(v.nb_nuits);
  const budget = Number(v.budget_euros);
  const ligne = (terme: string, valeur: string | null, vide: string) => (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-doux">{terme}</dt>
      <dd className={`text-right ${valeur ? 'font-semibold text-nuit' : 'text-doux italic'}`}>{valeur || vide}</dd>
    </div>
  );
  return (
    <section className="overflow-hidden rounded-xl border border-filet bg-white shadow-[0_8px_24px_rgb(14_74_110/0.08)]">
      <div className="flex items-center justify-between bg-nuit px-5 py-3 text-white">
        <h2 className="text-lg text-white!">Votre billet</h2>
        <span className="text-sm text-[#d8e6f0]" aria-live="polite">
          {faites} / {OBLIGATOIRES.length} étapes obligatoires
        </span>
      </div>
      <div className="px-5 pt-4">
        <p className="text-sm text-doux">Paris</p>
        <p className="font-titre text-2xl font-semibold text-nuit">→ {v.destination?.trim() || 'Destination à proposer'}</p>
      </div>
      <dl className="divide-y divide-dashed divide-filet px-5 pb-2 pt-2 text-sm">
        {ligne('Aller', v.date_debut ? dateLongue(v.date_debut) : null, 'à choisir')}
        {ligne('Retour', v.date_fin ? dateLongue(v.date_fin) : null, 'à choisir')}
        {ligne('Nuits', nuits === null ? null : pluriel(nuits, 'nuit'), 'à préciser')}
        {ligne(
          'Voyageurs',
          adultes ? [pluriel(adultes, 'adulte'), enfants ? pluriel(enfants, 'enfant') : ''].filter(Boolean).join(', ') : null,
          'à préciser',
        )}
        {ligne('Budget', budget > 0 ? `${budget.toLocaleString('fr-FR')} € pour le groupe` : null, 'non précisé')}
      </dl>
      {v.envies?.trim() && (
        <p className="mx-5 mb-4 line-clamp-3 border-t border-filet pt-3 text-sm italic text-texte">« {v.envies.trim()} »</p>
      )}
      {/* talon du billet : perforation */}
      <div aria-hidden className="h-3 bg-[radial-gradient(circle_at_6px_0,var(--detour-fond)_5px,transparent_6px)] bg-[length:12px_12px] bg-repeat-x" />
    </section>
  );
}

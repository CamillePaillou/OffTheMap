'use client';

import { useActionState, useEffect, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { CHAMPS_FORMULAIRE, ETAPES_FORMULAIRE, type EtatFormulaire } from '@/src/domain/chatbot/aideFormulaire';
import { nuitsEntre, reglesCroisees, schemaSaisieDemande } from '@/types/demande';
import { lireSaisie } from './lecture';
import { EVENEMENT_PRESTATION, type DetailPrestation } from '../_composants/chatbot';
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

const champ = 'rounded-[10px] border-[1.5px] border-ballast bg-carte px-3 py-2.5 hover:border-encre';

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
  voyage: (v) => !!v.date_debut && !!v.date_fin,
  voyageurs: (v) => Number(v.adultes) >= 1,
  budget: (v) => !!v.budget_euros,
  envies: (v) => !!v.envies?.trim() || !!v.contraintes?.trim() || !!v.prestation,
  besoins: (v) => Object.keys(v).some((k) => k.startsWith('regime_') || k === 'mobilite_reduite'),
  accords: (v) => v.consentement_rgpd === 'on' && v.consentement_ia === 'on',
};
const OBLIGATOIRES = ['vous', 'voyage', 'voyageurs', 'accords'] as const;
/** Champs vérifiés par le schéma : tous marqués « quittés » après un envoi refusé. */
const STATIONS_CHAMPS = {
  nom: 1, email: 1, date_debut: 1, date_fin: 1, adultes: 1, enfants: 1, budget_euros: 1, envies: 1, contraintes: 1,
  consentement_rgpd: 1, consentement_ia: 1,
} as const;

function lire(form: HTMLFormElement): Record<string, string> {
  const v: Record<string, string> = {};
  new FormData(form).forEach((valeur, cle) => {
    if (typeof valeur === 'string') v[cle] = valeur;
  });
  return v;
}

type Action = (etat: EtatDemande, formulaire: FormData) => Promise<EtatDemande>;

/** Date du jour à Paris (AAAA-MM-JJ), comme le serveur : une date de départ antérieure est refusée. */
const aujourdhuiParis = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/**
 * Les mêmes règles que le serveur (schemaSaisieDemande), vérifiées dans le navigateur : le client voit une erreur
 * dès qu'il quitte le champ, sans attendre l'envoi. Le serveur revérifie tout à l'envoi.
 */
function verifier(form: HTMLFormElement): Record<string, string> {
  const saisie = lireSaisie(new FormData(form));
  const verdict = schemaSaisieDemande(aujourdhuiParis()).safeParse(saisie);
  const erreurs: Record<string, string> = {};
  if (!verdict.success) for (const i of verdict.error.issues) erreurs[String(i.path[0] ?? 'formulaire')] ??= i.message;
  // le schéma n'applique les règles croisées que si tout le reste est valide : on les applique ici champ par champ
  for (const e of reglesCroisees(saisie, aujourdhuiParis())) erreurs[e.champ] ??= e.message;
  return erreurs;
}

/** Nom du champ dans le schéma pour un élément du formulaire (cases des régimes, case de mobilité). */
const champDuSchema = (nom: string) => (nom.startsWith('regime_') ? 'regimes' : nom === 'mobilite_reduite' ? 'mobilite' : nom);

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
  /** Prestations ajoutées depuis le chatbot (E1.4), nommées par le serveur : le client peut en retirer. */
  prestationsChoisies?: readonly PrestationChoisie[];
}

export interface PrestationChoisie {
  id: string;
  nom: string;
  type: 'transport' | 'hebergement' | 'activite';
  destination: string;
}
const TYPES_PRESTATION = { transport: 'Transport', hebergement: 'Hébergement', activite: 'Activité' } as const;

export function FormulaireDemande({
  action: envoyer = envoyerDemande,
  initiales,
  surlignes = [],
  commentaires = {},
  libelleEnvoi = 'Envoyer ma demande',
  prestationsChoisies = [],
}: Props) {
  // gardées dans l'état du composant : elles survivent à un renvoi du formulaire avec erreurs
  const [choisies, setChoisies] = useState<readonly PrestationChoisie[]>(prestationsChoisies);
  // une prestation ajoutée ou retirée depuis le chatbot ouvert sur cette page
  useEffect(() => {
    const recevoir = (ev: Event) => {
      const { prestation, ajoutee } = (ev as CustomEvent<DetailPrestation>).detail;
      setChoisies((liste) => {
        const sans = liste.filter((x) => x.id !== prestation.id);
        return ajoutee ? [...sans, prestation].slice(-6) : sans;
      });
    };
    window.addEventListener(EVENEMENT_PRESTATION, recevoir);
    return () => window.removeEventListener(EVENEMENT_PRESTATION, recevoir);
  }, []);
  const [etat, action, enCours] = useActionState<EtatDemande, FormData>(envoyer, {});
  const v = etat.valeurs ?? initiales ?? {};
  // erreurs vérifiées dans le navigateur, pour les champs que le client a déjà quittés (ou tous, après un envoi refusé)
  const [touches, setTouches] = useState<ReadonlySet<string>>(new Set());
  const [locales, setLocales] = useState<Record<string, string>>({});
  const serveur = etat.erreurs ?? {};
  const e: Record<string, string | undefined> = { ...serveur };
  for (const nom of touches) e[nom] = locales[nom];
  const quitter = (ev: FocusEvent<HTMLFormElement>) => {
    const nom = (ev.target as unknown as HTMLInputElement).name;
    if (!nom || nom === 'prestation') return;
    setTouches((t) => new Set(t).add(champDuSchema(nom)));
    setLocales(verifier(ev.currentTarget));
  };
  const avantEnvoi = (ev: FormEvent<HTMLFormElement>) => {
    const erreurs = verifier(ev.currentTarget);
    setLocales(erreurs);
    const noms = Object.keys(erreurs);
    if (noms.length === 0) return; // le serveur revérifie
    ev.preventDefault();
    setTouches(new Set([...Object.keys(STATIONS_CHAMPS), ...noms]));
    // le premier champ en erreur reçoit le focus : le client voit tout de suite quoi corriger
    const premier = ev.currentTarget.querySelector<HTMLElement>(noms.map((n) => `[name="${n}"],[name^="${n === 'regimes' ? 'regime_' : n}"]`).join(','));
    premier?.focus();
  };
  // ce que le client a saisi, relu à chaque frappe pour le récapitulatif et les stations
  const [saisie, setSaisie] = useState<Record<string, string> | null>(null);
  const courant = saisie ?? v;
  const suivre = (ev: FormEvent<HTMLFormElement>) => {
    setSaisie(lire(ev.currentTarget));
    // un champ déjà quitté est revérifié à chaque frappe : l'erreur disparaît dès qu'elle est corrigée
    if (touches.size > 0) setLocales(verifier(ev.currentTarget));
  };
  const rempli = (station: keyof typeof STATIONS) => (STATIONS[station]!(courant) ? 'true' : 'false');
  const faites = OBLIGATOIRES.filter((o) => STATIONS[o]!(courant)).length;
  const aRevoir = (nom: string) => surlignes.includes(nom);
  // pour le chatbot de la page : des clés seulement (étapes vides, champs en erreur affichés), aucune valeur saisie,
  // et rien sur « Alimentation et mobilité » (src/domain/chatbot/aideFormulaire.ts)
  // « Adultes » affiche 2 par défaut avant toute frappe : le chatbot ne doit pas dire que l'étape est vide
  const pourAssistant: EtatFormulaire = {
    manquantes: ETAPES_FORMULAIRE.filter((s) => !STATIONS[s]!({ adultes: '2', ...courant })),
    erreurs: CHAMPS_FORMULAIRE.filter((n) => !!e[n]),
  };
  // écrit sur le formulaire après le rendu, pas dans le HTML : l'état vu par le serveur et par le navigateur peut
  // différer (valeurs reprises par le navigateur, extensions…) et un attribut rendu ferait une erreur d'hydratation
  const formulaire = useRef<HTMLFormElement>(null);
  const etatAssistant = JSON.stringify(pourAssistant);
  useEffect(() => {
    if (formulaire.current) formulaire.current.dataset.assistant = etatAssistant;
  });
  // champ signalé par le conseiller : bordure et fond ambre, et annonce pour les lecteurs d'écran
  // champ en erreur : bordure brique ; champ signalé par le conseiller : fond ciel
  const c = (nom: string) => (e[nom] ? `${champ} border-brique!` : aRevoir(nom) ? `${champ} border-encre! bg-ciel-pale ring-2 ring-ciel` : champ);
  const note = (point: ChampCorrigeable) =>
    commentaires[point] ? (
      <p id={`note-${point}`} className="rounded-lg border-l-4 border-encre bg-ciel-pale px-3 py-2 text-sm text-encre">
        <span className="font-medium">Votre conseiller : </span>
        {commentaires[point]}
      </p>
    ) : null;
  const groupe = (prefixe: string) =>
    surlignes.some((n) => n.startsWith(prefixe)) ? 'rounded-lg p-3 ring-2 ring-ciel bg-ciel-pale' : '';
  const erreur = (nom: string) =>
    e[nom] ? (
      <span id={`${nom}-erreur`} role="alert" className="text-sm font-semibold text-brique-texte">
        {e[nom]}
      </span>
    ) : null;
  const decrit = (nom: string) =>
    e[nom] ? { 'aria-invalid': true, 'aria-describedby': `${nom}-erreur` } : aRevoir(nom) ? { 'aria-describedby': 'points-a-revoir' } : {};

  return (
    // La clé remonte le formulaire après une erreur : les valeurs saisies sont reprises par defaultValue.
    <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <form id="formulaire-demande" ref={formulaire} key={JSON.stringify(v)} action={action} onInput={suivre} onChange={suivre} onBlur={quitter} onSubmit={avantEnvoi} noValidate className="panneau ligne-formulaire flex flex-col gap-8 p-5 sm:p-8">
      {e.formulaire && (
        <p role="alert" className="rounded-lg border-l-4 border-brique bg-brique-pale px-3 py-2 text-sm text-brique-texte">
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
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        {note('dates')}
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
          <span className="text-sm text-encre-doux">Le conseiller compose le séjour dans cette enveloppe, transport compris.</span>
          <input name="budget_euros" type="number" min={1} step={1} defaultValue={v.budget_euros} className={c('budget_euros')} {...decrit('budget_euros')} />
          {erreur('budget_euros')}
        </label>
        {note('budget')}
      </fieldset>

      <fieldset data-rempli={rempli('envies')} className="flex flex-col gap-4">
        <legend className="mb-3 text-xl">Vos envies</legend>
        <p className="text-sm text-encre-doux">N’indiquez ici aucune information de santé : cochez plutôt les cases plus bas.</p>
        {choisies.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Ce qui vous tente</span>
            <ul aria-label="Prestations ajoutées depuis l’assistant" className="flex flex-col gap-2">
              {choisies.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-ciel-pale px-3.5 py-2.5">
                  <input type="hidden" name="prestation" value={p.id} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-encre-doux">
                      {TYPES_PRESTATION[p.type]} · {p.destination}
                    </span>
                    <span className="font-titre font-semibold leading-snug">{p.nom}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setChoisies((liste) => liste.filter((x) => x.id !== p.id))}
                    className="shrink-0 rounded-full px-2.5 py-1 text-sm font-medium underline underline-offset-4 hover:bg-encre/[0.07]"
                    aria-label={`Retirer ${p.nom}`}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            <span className="text-sm text-encre-doux">Votre conseiller les verra sur votre demande et les privilégiera.</span>
          </div>
        )}
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
        <p className="text-sm text-encre-doux">
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
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-ciel bg-ciel-pale px-4 py-3 text-sm text-encre">
          <p className="font-medium">Ces points n’ont pas changé : {etat.inchanges.join(', ')}.</p>
          <p>Le conseiller vous a demandé de les revoir. S’ils sont exacts tels quels, confirmez-le avant d’envoyer.</p>
          <label className="flex items-center gap-2">
            <input name="confirmer_inchanges" type="checkbox" />
            <span>Je confirme que ces informations sont exactes</span>
          </label>
        </div>
      )}

      {/* sur téléphone, le billet est sous le formulaire : un rappel reste collé en bas pendant la saisie */}
      <div aria-hidden className="sticky bottom-3 z-10 -mx-2 lg:hidden">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-encre px-4 py-3 text-sm text-craie shadow-[0_8px_24px_rgb(22_35_63/0.3)]">
          <span className="truncate font-semibold">Paris → {courant.destination?.trim() || 'à proposer'}</span>
          <span className="shrink-0 text-craie-sur-encre">
            {faites} / {OBLIGATOIRES.length} étapes
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-trait pt-6 sm:flex-row sm:items-center sm:gap-5">
        <button type="submit" disabled={enCours} className="btn-principal self-start text-lg">
          {enCours ? 'Envoi…' : libelleEnvoi}
        </button>
        <p className="text-sm text-encre-doux">Gratuit et sans engagement.</p>
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
  // calculées depuis les dates, comme le serveur : le client ne les saisit pas
  const nuits = nuitsEntre(v.date_debut, v.date_fin);
  const budget = Number(v.budget_euros);
  const ligne = (terme: string, valeur: string | null, vide: string) => (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-encre-doux">{terme}</dt>
      <dd className={`text-right ${valeur ? 'font-semibold text-encre' : 'text-encre-doux italic'}`}>{valeur || vide}</dd>
    </div>
  );
  return (
    <section className="overflow-hidden rounded-xl border border-trait bg-carte shadow-[0_8px_24px_rgb(22_35_63/0.08)]">
      <div className="flex items-center justify-between bg-encre px-5 py-3 text-craie">
        <h2 className="text-lg text-craie!">Votre billet</h2>
        <span className="text-sm text-craie-sur-encre" aria-live="polite">
          {faites} / {OBLIGATOIRES.length} étapes obligatoires
        </span>
      </div>
      <div className="px-5 pt-4">
        <p className="text-sm text-encre-doux">Paris</p>
        <p className="font-titre text-2xl font-semibold text-encre">→ {v.destination?.trim() || 'Destination à proposer'}</p>
      </div>
      <dl className="divide-y divide-dashed divide-trait px-5 pb-2 pt-2 text-sm">
        {ligne('Aller', v.date_debut ? dateLongue(v.date_debut) : null, 'à choisir')}
        {ligne('Retour', v.date_fin ? dateLongue(v.date_fin) : null, 'à choisir')}
        {ligne('Nuits', nuits === null || nuits < 0 ? null : pluriel(nuits, 'nuit'), 'selon vos dates')}
        {ligne(
          'Voyageurs',
          adultes ? [pluriel(adultes, 'adulte'), enfants ? pluriel(enfants, 'enfant') : ''].filter(Boolean).join(', ') : null,
          'à préciser',
        )}
        {ligne('Budget', budget > 0 ? `${budget.toLocaleString('fr-FR')} € pour le groupe` : null, 'non précisé')}
      </dl>
      {v.envies?.trim() && (
        <p className="mx-5 mb-4 line-clamp-3 border-t border-trait pt-3 text-sm italic text-encre">« {v.envies.trim()} »</p>
      )}
      {/* talon du billet : perforation */}
      <div aria-hidden className="h-3 bg-[radial-gradient(circle_at_6px_0,var(--detour-craie)_5px,transparent_6px)] bg-[length:12px_12px] bg-repeat-x" />
    </section>
  );
}

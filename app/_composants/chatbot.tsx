'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

/** Réponse de /api/chatbot (src/application/repondreChatbot.ts). */
interface Carte {
  id: string;
  nom: string;
  type: 'transport' | 'hebergement' | 'activite';
  destination: string;
  description?: string;
  disponibilite?: { disponible: boolean; date: string; participants: number };
}
interface Reponse {
  texte: string;
  verification: 'disponible' | 'indisponible' | 'non_verifie' | null;
  suggestion: { destination?: string; date_debut?: string; voyageurs?: number } | null;
  prestations?: Carte[];
  relances?: string[];
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  verification?: Reponse['verification'];
  prestations?: Carte[];
  relances?: string[];
}
const TYPES: Record<Carte['type'], string> = { transport: 'Transport', hebergement: 'Hébergement', activite: 'Activité' };

const LONGUEUR_MAX = 600;
const HISTORIQUE_MAX = 12;
const IDEES = ['Que faire à Nantes ?', 'Où dormir à Lyon ?', 'Une activité quand il pleut ?', 'Quels sont vos horaires ?'];
const BONJOUR = 'Bonjour ! Je peux vous parler de nos destinations et vérifier si une activité est disponible à une date. Les prix, c’est un conseiller qui vous les envoie.';
const HORS_LIGNE = 'L’assistant ne répond pas pour le moment. Vous pouvez composer votre week-end directement : un conseiller vous répondra.';

/** Le chatbot n'apparaît que sur le site public, et pas sur le formulaire (il y mène). */
export function ChatbotSite() {
  const chemin = usePathname();
  if (chemin.startsWith('/conseiller') || chemin.startsWith('/connexion') || chemin.startsWith('/demande')) return null;
  return <Chatbot />;
}

/**
 * Le formulaire prérempli : ville, date, voyageurs, et les prestations ajoutées (E1.4), que le serveur renomme depuis
 * le catalogue et enregistre avec la demande. Rien d'autre ne passe par l'adresse.
 */
function lienDemande(s: Reponse['suggestion'], choix: readonly Carte[]) {
  const q = new URLSearchParams();
  const villes = [...new Set(choix.map((c) => c.destination))];
  const destination = s?.destination ?? (villes.length === 1 ? villes[0] : undefined);
  if (destination) q.set('destination', destination);
  if (choix.length > 0) q.set('prestations', choix.map((c) => c.id).join(','));
  if (s?.date_debut) q.set('date_debut', s.date_debut);
  if (s?.voyageurs) q.set('adultes', String(s.voyageurs));
  const chaine = q.toString();
  return chaine ? `/demande?${chaine}` : '/demande';
}

/**
 * Chatbot du site (E1.3). La conversation reste dans cette page : rien n'est stocké, ni ici ni sur le serveur.
 * Accessible au clavier (Échap ferme et rend le focus au bouton), réponses annoncées aux lecteurs d'écran.
 */
function Chatbot() {
  const [ouvert, setOuvert] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [suggestion, setSuggestion] = useState<Reponse['suggestion']>(null);
  // prestations ajoutées au week-end depuis les cartes (E1.4), 6 au plus
  const [choix, setChoix] = useState<Carte[]>([]);
  const basculer = (c: Carte) =>
    setChoix((liste) => (liste.some((x) => x.id === c.id) ? liste.filter((x) => x.id !== c.id) : [...liste, c].slice(-6)));
  const [annonce, setAnnonce] = useState('');
  const idPanneau = useId();
  const bouton = useRef<HTMLButtonElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const fil = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ouvert) champ.current?.focus();
  }, [ouvert]);
  useEffect(() => {
    fil.current?.scrollTo({ top: fil.current.scrollHeight, behavior: 'smooth' });
  }, [messages, enCours]);

  const fermer = () => {
    setOuvert(false);
    bouton.current?.focus();
  };

  async function envoyer(texte: string) {
    const contenu = texte.trim().slice(0, LONGUEUR_MAX);
    if (!contenu || enCours) return;
    const suite: Message[] = [...messages, { role: 'user', content: contenu }];
    setMessages(suite);
    setSaisie('');
    setEnCours(true);
    let reponse: Reponse;
    try {
      const r = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: suite.slice(-HISTORIQUE_MAX).map(({ role, content }) => ({ role, content })) }),
      });
      reponse = r.ok ? ((await r.json()) as Reponse) : { texte: HORS_LIGNE, verification: null, suggestion: null };
    } catch {
      reponse = { texte: HORS_LIGNE, verification: null, suggestion: null };
    }
    setMessages([
      ...suite,
      { role: 'assistant', content: reponse.texte, verification: reponse.verification, prestations: reponse.prestations ?? [], relances: reponse.relances ?? [] },
    ]);
    if (reponse.suggestion) setSuggestion((s) => ({ ...s, ...reponse.suggestion }));
    setAnnonce(reponse.texte);
    setEnCours(false);
    champ.current?.focus();
  }

  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    void envoyer(saisie);
  };
  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void envoyer(saisie);
    }
  };

  return (
    <div className="print:hidden" onKeyDown={(e) => e.key === 'Escape' && ouvert && fermer()}>
      {ouvert && (
        <section
          id={idPanneau}
          role="dialog"
          aria-label="Assistant DÉTOUR"
          className="chatbot-entre fixed inset-x-3 bottom-20 z-40 flex max-h-[min(36rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-trait bg-carte shadow-[0_18px_48px_rgb(22_35_63/0.22)] sm:inset-x-auto sm:right-6 sm:w-[24rem]"
        >
          <header className="sur-encre flex items-start justify-between gap-3 bg-encre px-5 py-4 text-craie">
            <div>
              <h2 className="text-lg text-craie!">Une question sur votre week-end ?</h2>
              <p className="text-sm text-craie-sur-encre">Destinations, idées, disponibilités</p>
            </div>
            <button type="button" onClick={fermer} aria-label="Fermer l’assistant" className="-mr-1 rounded-md p-1.5 text-craie hover:bg-craie/10">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div ref={fil} role="log" aria-label="Conversation" className="flex flex-1 flex-col gap-3 overflow-y-auto bg-craie px-4 py-4">
            <Bulle role="assistant" content={BONJOUR} />
            {messages.length === 0 && (
              <ul aria-label="Idées de questions" className="flex flex-wrap gap-2">
                {IDEES.map((idee) => (
                  <li key={idee}>
                    <button
                      type="button"
                      onClick={() => void envoyer(idee)}
                      className="rounded-full border border-trait bg-carte px-3 py-1.5 text-left text-sm text-encre hover:border-encre"
                    >
                      {idee}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {messages.map((m, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bulle {...m} />
                {m.prestations && m.prestations.length > 0 && (
                  <ul aria-label="Prestations proposées" className="chatbot-entre flex flex-col gap-2">
                    {m.prestations.map((c) => (
                      <li key={c.id}>
                        <CartePrestation carte={c} ajoutee={choix.some((x) => x.id === c.id)} basculer={() => basculer(c)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {/* réponses rapides : seulement après la dernière réponse */}
            {!enCours && (messages.at(-1)?.relances?.length ?? 0) > 0 && (
              <ul aria-label="Réponses rapides" className="flex flex-wrap gap-2">
                {messages.at(-1)!.relances!.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => void envoyer(r)}
                      className="rounded-full border border-trait bg-carte px-3 py-1.5 text-left text-sm text-encre hover:border-encre"
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {enCours && (
              <p className="self-start rounded-2xl rounded-bl-md bg-carte px-4 py-3 text-encre-doux" aria-label="L’assistant écrit">
                <span className="chatbot-points" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            )}
          </div>

          <div className="border-t border-trait bg-carte px-4 pt-3 pb-4">
            {choix.length > 0 && (
              <p className="mb-2 text-sm text-encre-doux" aria-live="polite">
                {choix.length === 1 ? '1 prestation ajoutée' : `${choix.length} prestations ajoutées`} : {choix.map((c) => c.nom).join(', ')}.
              </p>
            )}
            <Link href={lienDemande(suggestion, choix)} className="btn-principal mb-3 w-full py-2.5! text-[0.95rem]">
              Composer mon week-end
            </Link>
            <form onSubmit={soumettre} className="flex items-end gap-2">
              <label htmlFor={`${idPanneau}-champ`} className="sr-only">
                Votre question
              </label>
              <textarea
                id={`${idPanneau}-champ`}
                ref={champ}
                rows={1}
                value={saisie}
                maxLength={LONGUEUR_MAX}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={touche}
                placeholder="Votre question"
                className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border-[1.5px] border-ballast bg-craie px-3 py-2.5 focus:border-encre"
              />
              <button
                type="submit"
                disabled={enCours || !saisie.trim()}
                aria-label="Envoyer"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-encre text-craie hover:bg-encre-clair disabled:opacity-40"
              >
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
            <p className="mt-2 text-xs text-encre-doux">Ne donnez ici ni coordonnées ni information de santé. Rien n’est conservé.</p>
          </div>
          <p aria-live="polite" className="sr-only">
            {annonce}
          </p>
        </section>
      )}

      <button
        ref={bouton}
        type="button"
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
        aria-expanded={ouvert}
        aria-controls={ouvert ? idPanneau : undefined}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-encre py-3 pr-5 pl-4 font-semibold text-craie shadow-[0_10px_28px_rgb(22_35_63/0.35)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-encre-clair sm:right-6 sm:bottom-6"
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {ouvert ? <path d="M6 9l6 6 6-6" /> : <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />}
        </svg>
        {ouvert ? 'Fermer' : 'Une question ?'}
      </button>
    </div>
  );
}

function Bulle({ role, content, verification }: Message) {
  const visiteur = role === 'user';
  return (
    <div className={`chatbot-entre max-w-[85%] ${visiteur ? 'self-end' : 'self-start'}`}>
      <div
        className={`flex flex-col gap-1.5 rounded-2xl px-4 py-2.5 leading-relaxed ${
          visiteur ? 'rounded-br-md bg-encre text-craie' : 'rounded-bl-md bg-carte text-encre'
        }`}
      >
        <span className="sr-only">{visiteur ? 'Vous : ' : 'Assistant : '}</span>
        <TexteLisible texte={content} />
      </div>
      {verification && (
        <p className={`mt-1 text-xs ${verification === 'non_verifie' ? 'text-encre-doux' : 'text-encre'}`}>
          {verification === 'disponible'
            ? 'Vérifié auprès du prestataire à l’instant'
            : verification === 'indisponible'
              ? 'Vérifié auprès du prestataire : pas disponible'
              : 'Non vérifié'}
        </p>
      )}
    </div>
  );
}

/**
 * Le texte d'une bulle, aéré : un paragraphe par ligne, et les lignes « - … » (que le vrai modèle peut écrire) en
 * liste à puces. Pas de HTML venu du serveur : tout est rendu comme du texte.
 */
function TexteLisible({ texte }: { texte: string }) {
  const blocs: (string | string[])[] = [];
  for (const ligne of texte.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const puce = /^[-•*]\s+(.*)$/.exec(ligne);
    if (puce) {
      const dernier = blocs.at(-1);
      if (Array.isArray(dernier)) dernier.push(puce[1]!);
      else blocs.push([puce[1]!]);
    } else blocs.push(ligne);
  }
  return (
    <>
      {blocs.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.map((l, j) => (
              <li key={j}>{l}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b}</p>
        ),
      )}
    </>
  );
}

const jour = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Une prestation du catalogue : ce qu'on y fait, et le chemin vers le formulaire prérempli avec elle. */
function CartePrestation({ carte, ajoutee, basculer }: { carte: Carte; ajoutee: boolean; basculer: () => void }) {
  const d = carte.disponibilite;
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border bg-carte px-3.5 py-2.5 transition-colors ${ajoutee ? 'border-encre' : 'border-trait'}`}>
      <span className="text-xs text-encre-doux">
        {TYPES[carte.type]} · {carte.destination}
      </span>
      <span className="font-titre font-semibold leading-snug text-encre">{carte.nom}</span>
      {carte.description && <span className="line-clamp-1 text-sm text-encre-doux">{carte.description}</span>}
      {d && (
        <span className={`mt-1 self-start rounded-full px-2 py-0.5 text-xs font-semibold ${d.disponible ? 'bg-ciel text-encre' : 'bg-brique-pale text-brique-texte'}`}>
          {d.disponible ? 'Libre' : 'Complet'} le {jour(d.date)} pour {d.participants}
        </span>
      )}
      {/* ajoute la prestation au week-end : elle part avec la demande, le conseiller la voit sur le dossier */}
      <button
        type="button"
        onClick={basculer}
        aria-pressed={ajoutee}
        className={`mt-1.5 self-start rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
          ajoutee ? 'bg-encre text-craie hover:bg-encre-clair' : 'border-[1.5px] border-encre text-encre hover:bg-encre hover:text-craie'
        }`}
      >
        {ajoutee ? 'Ajoutée ✓ · retirer' : 'Ajouter à mon week-end'}
      </button>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

/** Réponse de /api/chatbot (src/application/repondreChatbot.ts). */
interface Reponse {
  texte: string;
  verification: 'disponible' | 'indisponible' | 'non_verifie' | null;
  suggestion: { destination?: string; date_debut?: string; voyageurs?: number } | null;
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  verification?: Reponse['verification'];
}

const LONGUEUR_MAX = 600;
const HISTORIQUE_MAX = 12;
const IDEES = ['Que faire à Nantes ?', 'Un atelier à Nantes le 7 novembre pour deux ?', 'Quels sont vos horaires ?'];
const BONJOUR = 'Bonjour ! Je peux vous parler de nos destinations et vérifier si une activité est disponible à une date. Les prix, c’est un conseiller qui vous les envoie.';
const HORS_LIGNE = 'L’assistant ne répond pas pour le moment. Vous pouvez décrire votre week-end directement : un conseiller vous répondra.';

/** Le chatbot n'apparaît que sur le site public, et pas sur le formulaire (il y mène). */
export function ChatbotSite() {
  const chemin = usePathname();
  if (chemin.startsWith('/conseiller') || chemin.startsWith('/connexion') || chemin.startsWith('/demande')) return null;
  return <Chatbot />;
}

function lienDemande(s: Reponse['suggestion']) {
  const q = new URLSearchParams();
  if (s?.destination) q.set('destination', s.destination);
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
    setMessages([...suite, { role: 'assistant', content: reponse.texte, verification: reponse.verification }]);
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
          className="chatbot-entre fixed inset-x-3 bottom-20 z-40 flex max-h-[min(36rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-filet bg-white shadow-[0_18px_48px_rgb(14_74_110/0.22)] sm:inset-x-auto sm:right-6 sm:w-[24rem]"
        >
          <header className="flex items-start justify-between gap-3 bg-nuit px-5 py-4 text-white">
            <div>
              <h2 className="text-lg text-white!">Une question sur votre week-end ?</h2>
              <p className="text-sm text-[#d8e6f0]">Destinations, idées, disponibilités</p>
            </div>
            <button type="button" onClick={fermer} aria-label="Fermer l’assistant" className="-mr-1 rounded-md p-1.5 text-white hover:bg-white/10">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div ref={fil} role="log" aria-label="Conversation" className="flex flex-1 flex-col gap-3 overflow-y-auto bg-fond px-4 py-4">
            <Bulle role="assistant" content={BONJOUR} />
            {messages.length === 0 && (
              <ul aria-label="Idées de questions" className="flex flex-wrap gap-2">
                {IDEES.map((idee) => (
                  <li key={idee}>
                    <button
                      type="button"
                      onClick={() => void envoyer(idee)}
                      className="rounded-full border border-filet bg-white px-3 py-1.5 text-left text-sm text-nuit hover:border-bleu"
                    >
                      {idee}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {messages.map((m, i) => (
              <Bulle key={i} {...m} />
            ))}
            {enCours && (
              <p className="self-start rounded-2xl rounded-bl-md bg-white px-4 py-3 text-doux" aria-label="L’assistant écrit">
                <span className="chatbot-points" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            )}
          </div>

          <div className="border-t border-filet bg-white px-4 pt-3 pb-4">
            <Link href={lienDemande(suggestion)} className="btn-principal mb-3 w-full py-2.5! text-[0.95rem]">
              Décrire mon week-end
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
                className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-[#b7c7d3] px-3 py-2.5"
              />
              <button
                type="submit"
                disabled={enCours || !saisie.trim()}
                aria-label="Envoyer"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-nuit text-white hover:bg-[#0a3a57] disabled:opacity-40"
              >
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
            <p className="mt-2 text-xs text-doux">Ne donnez ici ni coordonnées ni information de santé. Rien n’est conservé.</p>
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
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-nuit py-3 pr-5 pl-4 font-semibold text-white shadow-[0_10px_28px_rgb(14_74_110/0.35)] transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#0a3a57] sm:right-6 sm:bottom-6"
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
      <p
        className={`whitespace-pre-line rounded-2xl px-4 py-2.5 leading-relaxed ${
          visiteur ? 'rounded-br-md bg-nuit text-white' : 'rounded-bl-md bg-white text-texte'
        }`}
      >
        <span className="sr-only">{visiteur ? 'Vous : ' : 'Assistant : '}</span>
        {content}
      </p>
      {verification && (
        <p className={`mt-1 text-xs ${verification === 'non_verifie' ? 'text-doux' : 'text-[#2f6b4a]'}`}>
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

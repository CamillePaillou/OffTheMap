import Image from 'next/image';
import Link from 'next/link';
import { Ligne } from './_composants/ligne';

const DESTINATIONS = [
  { ville: 'Nantes', image: '/detour/nantes.jpg', trajet: 'Paris → Nantes', texte: 'Les machines imaginaires de l’île, puis une nuit à l’Hôtel des Machines.' },
  { ville: 'Lyon', image: '/detour/lyon.jpg', trajet: 'Paris → Lyon', texte: 'Une enquête dans les traboules et un hôtel au cœur de la Presqu’île.' },
  { ville: 'Lille', image: '/detour/lille.jpg', trajet: 'Paris → Lille', texte: 'Un atelier gaufres et une nuit au pied du Beffroi.' },
];

// Le parcours réel d'une demande, dans l'ordre où le client le vit.
const ETAPES = [
  { libelle: 'Vous décrivez votre week-end', detail: 'Dates, voyageurs, budget, envies. Cinq minutes, sans compte.' },
  { libelle: 'Un conseiller l’étudie', detail: 'Il vous écrit si un point est à préciser.' },
  { libelle: 'Il vérifie chaque prix', detail: 'Train, hôtel, activités : auprès des prestataires.' },
  { libelle: 'Vous recevez la proposition', detail: 'Programme jour par jour et total, par mail.' },
  { libelle: 'Vous dites oui', detail: 'On réserve, vous n’avez plus qu’à monter dans le train.' },
];

const ENGAGEMENTS = [
  { titre: 'Un conseiller, pas un algorithme', texte: 'Un brouillon peut être préparé par un assistant, mais rien ne part sans qu’un conseiller l’ait relu et signé.' },
  { titre: 'Des prix vérifiés', texte: 'Aucun prix ne vous est annoncé tant qu’il n’a pas été confirmé auprès du prestataire.' },
  { titre: 'Le train, d’abord', texte: 'Nos séjours partent de Paris en train. Pas de voiture à louer, pas de parking à chercher.' },
  { titre: 'Vos contraintes comptent', texte: 'Enfants, régimes, mobilité réduite : dites-le une fois, le séjour est construit avec.' },
];

// Accueil DÉTOUR : d'abord ce qu'on peut faire (décrire son week-end), puis ce qui se passe ensuite. Aucun prix affiché.
export default function Accueil() {
  return (
    <main className="flex-1">
      {/* Accroche : texte et action à gauche, photo à droite (dessous sur téléphone) */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-16">
          <div>
            <p className="font-semibold text-orange-fonce">Agence de week-ends insolites en train</p>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-[3.4rem]">Partez autrement, on s’occupe du reste.</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed">
              Dites-nous quand, avec qui et ce qui vous ferait plaisir. Un conseiller DÉTOUR compose votre séjour : train, nuit et activités,
              avec des prix vérifiés un par un.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/demande" className="btn-principal text-lg">
                Décrire mon week-end
              </Link>
              <a href="#comment" className="font-semibold underline underline-offset-4">
                Voir comment ça se passe
              </a>
            </div>
            <p className="mt-4 text-sm text-doux">Gratuit et sans engagement. Réponse d’un conseiller par mail.</p>
          </div>
          <div className="relative">
            <Image
              src="/detour/slide-1.jpg"
              alt="Voyageurs sur un quai de gare au départ d’un week-end"
              width={960}
              height={640}
              priority
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
            <div className="absolute -bottom-5 left-4 right-4 rounded-xl border border-filet bg-white p-4 shadow-[0_8px_24px_rgb(14_74_110/0.12)] sm:left-auto sm:right-6 sm:w-72">
              <p className="text-sm text-doux">Destinations au départ de Paris</p>
              <p className="mt-1 font-titre text-lg font-semibold text-nuit">Nantes · Lyon · Lille</p>
            </div>
          </div>
        </div>
      </section>

      {/* Destinations : des cartes postales, avec le trajet en train */}
      <section aria-labelledby="titre-destinations" className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="titre-destinations" className="text-3xl">Nos coups de cœur</h2>
            <p className="mt-2 text-doux">Trois villes, un week-end chacune, toutes à quelques heures de train.</p>
          </div>
          <Link href="/demande" className="font-semibold underline underline-offset-4">
            Proposer une autre idée
          </Link>
        </div>
        <ul className="mt-6 grid gap-5 md:grid-cols-3">
          {DESTINATIONS.map((d) => (
            <li key={d.ville} className="panneau group flex flex-col overflow-hidden">
              <div className="relative">
                <Image src={d.image} alt="" width={600} height={420} className="aspect-[10/7] w-full object-cover" />
                <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-sm font-semibold text-nuit">{d.trajet}</span>
              </div>
              <div className="flex flex-1 flex-col border-t-4 border-orange p-5">
                <h3 className="text-2xl">{d.ville}</h3>
                <p className="mt-2 flex-1 leading-relaxed">{d.texte}</p>
                <Link href={`/demande?destination=${encodeURIComponent(d.ville)}`} className="mt-4 font-semibold underline underline-offset-4">
                  Un week-end à {d.ville}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Comment ça marche : la ligne, de la demande au départ */}
      <section id="comment" aria-labelledby="titre-comment" className="scroll-mt-6 border-y border-filet bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="titre-comment" className="text-3xl">De votre demande au départ</h2>
          <p className="mt-2 max-w-2xl text-doux">Cinq arrêts. Vous savez toujours où en est votre dossier, et qui s’en occupe.</p>
          <div className="mt-8">
            <Ligne titre="Les étapes d’une demande" stations={ETAPES} actuelle={0} />
          </div>
        </div>
      </section>

      {/* Ce qui distingue l'agence */}
      <section aria-labelledby="titre-engagements" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="titre-engagements" className="text-3xl">Ce que DÉTOUR vous garantit</h2>
        <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {ENGAGEMENTS.map((e) => (
            <div key={e.titre} className="border-l-4 border-bleu pl-5">
              <dt className="font-titre text-xl font-semibold text-nuit">{e.titre}</dt>
              <dd className="mt-2 leading-relaxed">{e.texte}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Relance finale */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col items-start gap-5 rounded-2xl bg-nuit px-6 py-8 text-white sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <div>
            <h2 className="text-2xl text-white!">Une envie de week-end ?</h2>
            <p className="mt-1 text-[#d8e6f0]">Décrivez-la en quelques minutes, un conseiller vous répond.</p>
          </div>
          <Link href="/demande" className="btn-principal shrink-0">
            Décrire mon week-end
          </Link>
        </div>
      </section>
    </main>
  );
}

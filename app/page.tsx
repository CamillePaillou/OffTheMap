import Image from 'next/image';
import Link from 'next/link';
import { Ligne } from './_composants/ligne';
import { Saut } from './_composants/saut';

const DESTINATIONS = [
  { ville: 'Nantes', image: '/detour/nantes.jpg', trajet: 'Paris → Nantes, 2 h', texte: 'L’atelier des machines imaginaires, puis une nuit à l’Hôtel des Machines, en centre-ville.' },
  { ville: 'Lyon', image: '/detour/lyon.jpg', trajet: 'Paris → Lyon, 2 h', texte: 'Un jeu de piste dans les traboules du Vieux-Lyon, une nuit au cœur de la Presqu’île.' },
  { ville: 'Lille', image: '/detour/lille.jpg', trajet: 'Paris → Lille, 1 h', texte: 'Un atelier gaufres le samedi matin, une nuit au pied du Beffroi.' },
];

// Le parcours réel d'une demande, dans l'ordre où le voyageur le vit.
const ETAPES = [
  { libelle: 'Vous décrivez votre week-end', detail: 'Dates, voyageurs, budget, envies. Cinq minutes, sans compte.' },
  { libelle: 'Un conseiller l’étudie', detail: 'Il vous écrit si un point est à préciser.' },
  { libelle: 'Il vérifie chaque prix', detail: 'Train, hôtel, activités : auprès de nos partenaires, avec l’heure.' },
  { libelle: 'Vous recevez sa proposition', detail: 'Programme jour par jour et total, signés de son prénom.' },
  { libelle: 'Vous dites oui', detail: 'Il réserve. Il ne vous reste qu’à monter dans le train.' },
];

// Les trois valeurs de la plateforme de marque, telles que le produit les tient.
const VALEURS = [
  { titre: 'Curiosité', texte: 'Nous cherchons l’adresse d’à côté, celle qu’un moteur de recherche ne trouve pas.' },
  { titre: 'Exactitude', texte: 'Un prix affiché est vérifié et daté. Une place proposée existe.' },
  { titre: 'Attention', texte: 'Une personne compose, signe et confirme votre voyage. Jamais l’outil à sa place.' },
];

// Accueil DÉTOUR : d'abord ce qu'on peut faire (composer son week-end), puis comment on travaille. Aucun prix affiché :
// un prix n'est annoncé qu'une fois vérifié, dans la proposition du conseiller.
export default function Accueil() {
  return (
    <main className="flex-1">
      {/* Accroche : le saut typographique de l'écran est ici, sur le o de « détour » */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-16 lg:pb-20">
        <div>
          <h1 className="text-[2.75rem] sm:text-6xl lg:text-[4.25rem]">
            Le meilleur du voyage, c’est le <Saut avant="dét" apres="ur" />.
          </h1>
          <p className="mt-6 max-w-[34rem] text-xl leading-relaxed">
            Dites-nous vos envies et vos dates. Un conseiller compose votre week-end en train, vérifie chaque prix et vous l’envoie signé.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/demande" className="btn-principal px-6! py-3.5! text-base!">
              Composer mon week-end
            </Link>
            <a href="#comment" className="btn-second py-3! text-base!">
              Comment on travaille
            </a>
          </div>
          <p className="mt-5 text-[15px] text-encre-doux">Gratuit et sans engagement. Réponse d’un conseiller par mail.</p>
        </div>
        <Image
          src="/detour/train.jpg"
          alt="Une voyageuse lit dans un train, la campagne défile à la fenêtre"
          width={1600}
          height={1067}
          priority
          sizes="(min-width: 1024px) 560px, 100vw"
          className="aspect-[4/3] w-full rounded-[20px] object-cover"
        />
      </section>

      {/* Destinations : une photo, la ville, le trajet en train */}
      <section id="destinations" aria-labelledby="titre-destinations" className="scroll-mt-6 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 id="titre-destinations" className="text-4xl">Trois villes, un week-end chacune</h2>
        <p className="mt-2 text-encre-doux">Toutes à quelques heures de train de Paris. Et si vous avez une autre idée, dites-la.</p>
        <ul className="mt-8 grid gap-5 md:grid-cols-3">
          {DESTINATIONS.map((d) => (
            <li key={d.ville}>
              <Link
                href={`/demande?destination=${encodeURIComponent(d.ville)}`}
                className="panneau group flex h-full flex-col overflow-hidden no-underline transition-transform duration-300 ease-detour hover:-translate-y-1"
              >
                <Image src={d.image} alt="" width={800} height={600} sizes="(min-width: 768px) 360px, 100vw" className="aspect-[4/3] w-full object-cover" />
                <span className="flex flex-1 flex-col p-5">
                  <span className="text-sm text-encre-doux">{d.trajet}</span>
                  <span className="mt-1 font-titre text-[1.7rem] font-extrabold leading-tight tracking-[-0.025em]">{d.ville}</span>
                  <span className="mt-2 flex-1 leading-relaxed">{d.texte}</span>
                  <span className="mt-4 font-semibold underline decoration-2 underline-offset-4">Un week-end à {d.ville}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Comment on travaille : la ligne, de la demande au départ */}
      <section id="comment" aria-labelledby="titre-comment" className="scroll-mt-6 bg-carte">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="titre-comment" className="text-4xl">Comment on travaille</h2>
          <p className="mt-2 max-w-2xl text-encre-doux">Cinq arrêts. Vous savez toujours où en est votre voyage, et qui s’en occupe.</p>
          <div className="mt-10">
            <Ligne titre="Les étapes d’une demande" stations={ETAPES} actuelle={0} />
          </div>
        </div>
      </section>

      {/* Les valeurs de la marque */}
      <section aria-labelledby="titre-valeurs" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="titre-valeurs" className="text-4xl">Ce que nous tenons</h2>
        <dl className="mt-8 grid gap-4 md:grid-cols-3">
          {VALEURS.map((v) => (
            <div key={v.titre} className={`rounded-2xl p-6 ${v.titre === 'Exactitude' ? 'bg-ciel' : 'bg-carte'}`}>
              <dt className="font-titre text-2xl font-extrabold tracking-[-0.025em]">{v.titre}</dt>
              <dd className="mt-2 leading-relaxed">{v.texte}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Relance finale */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="sur-encre flex flex-col items-start gap-6 rounded-[20px] bg-encre px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <p className="max-w-xl font-titre text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-craie">
            Deux jours, trois adresses, et le détour que vous n’auriez pas trouvé seuls.
          </p>
          <Link href="/demande" className="btn-principal shrink-0 bg-craie! px-6! py-3.5! text-base! text-encre! hover:bg-ciel!">
            Composer mon week-end
          </Link>
        </div>
      </section>
    </main>
  );
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { deconnecter } from '../connexion/actions';

/** En-tête : site public (charte DÉTOUR) ou espace conseiller (design system du back-office). */
export function EnTete() {
  return <EnTeteSelon chemin={usePathname()} />;
}

/** Sans le chemin (prérendu, avant l'arrivée de l'URL) : l'en-tête public, sans lien actif. */
export function EnTeteSelon({ chemin }: { chemin: string }) {
  const connexion = chemin.startsWith('/connexion');
  const conseiller = chemin.startsWith('/conseiller') || connexion;
  const actif = (href: string) => (href === '/' ? chemin === '/' : chemin.startsWith(href));
  const lien = (href: string) =>
    `rounded-md px-3 py-2 text-[0.95rem] no-underline hover:bg-ciel ${actif(href) ? 'font-bold text-nuit' : 'text-doux'}`;

  if (conseiller) return <EnTeteConseiller chemin={chemin} connexion={connexion} />;

  return (
    <header className="border-b-[3px] border-orange bg-white print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3 no-underline" aria-label="DÉTOUR, accueil">
          <Image src="/detour/logo.png" alt="" width={156} height={52} priority className="h-11 w-auto" />
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="flex items-center gap-1 sm:gap-2">
            <li className="hidden sm:block"><Link href="/#comment" className={lien('/#')}>Comment ça marche</Link></li>
            <li>
              <Link href="/demande" aria-current={actif('/demande') ? 'page' : undefined} className="btn-principal px-4! py-2! text-[0.95rem]">
                Décrire mon week-end
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** En-tête de l'espace conseiller : le design system du back-office (clair, une seule couleur d'action). */
function EnTeteConseiller({ chemin, connexion }: { chemin: string; connexion: boolean }) {
  const onglet = (actif: boolean) =>
    `rounded-[10px] px-3.5 py-2 no-underline transition-colors duration-150 ${actif ? 'bg-pervenche-pale font-semibold text-pervenche-fonce!' : 'text-ardoise! hover:bg-brume'}`;
  return (
    <header className="bo border-b border-trait bg-white! print:hidden">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-7">
        <div className="flex items-center gap-4 sm:gap-9">
          <Link href={connexion ? '/' : '/conseiller'} className="text-lg font-bold text-encre! no-underline" aria-label="Espace conseiller DÉTOUR">
            Détour
          </Link>
          {!connexion && (
            <nav aria-label="Navigation principale" className="flex gap-1.5">
              <Link href="/conseiller" aria-current={chemin.startsWith('/conseiller') ? 'page' : undefined} className={onglet(chemin.startsWith('/conseiller'))}>
                Dossiers
              </Link>
              <Link href="/" className={`${onglet(false)} hidden sm:inline-block`}>
                Site public
              </Link>
            </nav>
          )}
        </div>
        {connexion ? (
          <Link href="/" className="text-ardoise!">
            Retour au site
          </Link>
        ) : (
          <form action={deconnecter}>
            <button type="submit" className="bo-btn-2 whitespace-nowrap py-2! text-sm">
              Se déconnecter
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

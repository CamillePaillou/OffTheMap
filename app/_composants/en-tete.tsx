'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** En-tête DÉTOUR : logo, liens utiles, et un filet orange qui reprend la courbe du logo. */
export function EnTete() {
  return <EnTeteSelon chemin={usePathname()} />;
}

/** Sans le chemin (prérendu, avant l'arrivée de l'URL) : l'en-tête public, sans lien actif. */
export function EnTeteSelon({ chemin }: { chemin: string }) {
  const conseiller = chemin.startsWith('/conseiller') || chemin.startsWith('/connexion');
  const actif = (href: string) => (href === '/' ? chemin === '/' : chemin.startsWith(href));
  const lien = (href: string) =>
    `rounded-md px-3 py-2 text-[0.95rem] no-underline hover:bg-ciel ${actif(href) ? 'font-bold text-nuit' : 'text-doux'}`;

  return (
    <header className="border-b-[3px] border-orange bg-white print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link href={conseiller ? '/conseiller' : '/'} className="flex shrink-0 items-center gap-3 no-underline" aria-label={conseiller ? 'Espace conseiller DÉTOUR' : 'DÉTOUR, accueil'}>
          <Image src="/detour/logo.png" alt="" width={156} height={52} priority className="h-11 w-auto" />
          {conseiller && <span className="hidden border-l border-filet pl-3 font-titre text-lg font-semibold text-nuit sm:inline">Espace conseiller</span>}
        </Link>
        <nav aria-label="Navigation principale">
          {conseiller ? (
            <ul className="flex items-center gap-1">
              <li><Link href="/conseiller" aria-current={actif('/conseiller') ? 'page' : undefined} className={lien('/conseiller')}>Dossiers</Link></li>
              <li><Link href="/" className={lien('/__site')}>Site public</Link></li>
            </ul>
          ) : (
            <ul className="flex items-center gap-1 sm:gap-2">
              <li className="hidden sm:block"><Link href="/#comment" className={lien('/#')}>Comment ça marche</Link></li>
              <li>
                <Link href="/demande" aria-current={actif('/demande') ? 'page' : undefined} className="btn-principal px-4! py-2! text-[0.95rem]">
                  Décrire mon week-end
                </Link>
              </li>
            </ul>
          )}
        </nav>
      </div>
    </header>
  );
}

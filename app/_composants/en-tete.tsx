'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { deconnecter } from '../connexion/actions';
import { Logo } from './logo';

/** En-tête : site public (craie) ou espace conseiller (bandeau encre du brand kit). */
export function EnTete() {
  return <EnTeteSelon chemin={usePathname()} saute />;
}

/**
 * Sans le chemin (prérendu, avant l'arrivée de l'URL) : l'en-tête public, sans lien actif. Ce repli ne fait pas sauter
 * le O : sinon il consommerait le saut de la visite avant que le vrai en-tête n'arrive.
 */
export function EnTeteSelon({ chemin, saute = false }: { chemin: string; saute?: boolean }) {
  const connexion = chemin.startsWith('/connexion');
  const conseiller = chemin.startsWith('/conseiller') || connexion;
  const lien = 'rounded-full px-3 py-2 text-[15px] font-medium no-underline transition-colors duration-150 hover:bg-encre/[0.07]';

  if (conseiller) return <EnTeteConseiller chemin={chemin} connexion={connexion} />;

  return (
    <header className="border-b border-trait bg-craie print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* le O saute à l'ouverture du site, une fois par visite */}
        <Link href="/" className="shrink-0 py-1" aria-label="DÉTOUR, accueil">
          <Logo saute={saute} titre="" className="h-[34px] w-auto" />
        </Link>
        <nav aria-label="Navigation principale">
          <ul className="flex items-center gap-1 sm:gap-2">
            <li className="hidden md:block"><Link href="/#destinations" className={lien}>Destinations</Link></li>
            <li className="hidden md:block"><Link href="/#comment" className={lien}>Comment on travaille</Link></li>
            <li>
              <Link href="/demande" aria-current={chemin.startsWith('/demande') ? 'page' : undefined} className="btn-principal px-4! py-2.5!">
                Composer mon week-end
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** En-tête de l'espace conseiller : le bandeau encre du brand kit, logo en négatif. */
function EnTeteConseiller({ chemin, connexion }: { chemin: string; connexion: boolean }) {
  const onglet = (actif: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium no-underline transition-colors duration-150 ${actif ? 'bg-craie text-encre!' : 'text-craie-sur-encre! hover:bg-craie/[0.12] hover:text-craie!'}`;
  return (
    <header className="bo sur-encre bg-encre! text-craie print:hidden">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-7">
        <div className="flex items-center gap-4 sm:gap-8">
          <Link href={connexion ? '/' : '/conseiller'} className="shrink-0 py-1" aria-label={connexion ? 'DÉTOUR, retour au site' : 'Espace conseiller DÉTOUR'}>
            <Logo negatif titre="" className="h-[34px] w-auto" />
          </Link>
          {!connexion && (
            <nav aria-label="Navigation principale" className="flex gap-1">
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
          <Link href="/" className="text-sm text-craie-sur-encre!">
            Retour au site
          </Link>
        ) : (
          <form action={deconnecter}>
            <button type="submit" className="whitespace-nowrap rounded-full border-[1.5px] border-craie/40 px-3.5 py-1.5 text-sm font-medium text-craie transition-colors duration-150 hover:bg-craie hover:text-encre">
              Se déconnecter
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { DECALAGE_O_MONOGRAMME, LOGO_VIEWBOX, MONOGRAMME_VIEWBOX, SAUT_O, TRACE_D, TRACE_LETTRES, TRACE_O } from './logo-traces';

const CLE_VISITE = 'detour-o-a-saute';

/** Une fois par visite : vrai la première fois, puis faux jusqu'à la fermeture de l'onglet. */
export function premiereFoisDeLaVisite(): boolean {
  try {
    if (sessionStorage.getItem(CLE_VISITE)) return false;
    sessionStorage.setItem(CLE_VISITE, '1');
  } catch {
    // stockage indisponible (navigation privée stricte) : on saute quand même, une fois par chargement
  }
  return true;
}

/**
 * Joue le saut du O une fois, si `doitSauter()` le dit au montage. La classe est posée directement sur le tracé
 * (aucun rendu de plus) ; rien si l'ordinateur demande moins d'animations.
 * Le saut attend que la page soit chargée et visible : sinon, sur une machine lente (serveur de développement,
 * premier chargement), il se jouait pendant le chargement et personne ne le voyait.
 */
function useSaut(doitSauter: (() => boolean) | undefined) {
  const o = useRef<SVGPathElement>(null);
  // décidé une seule fois par montage : en développement, React rejoue l'effet, et la marque de visite est déjà posée
  const decision = useRef<boolean | null>(null);
  useEffect(() => {
    if (!doitSauter || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    decision.current ??= doitSauter();
    if (!decision.current) return;
    let minuterie: number | undefined;
    const jouer = () => {
      if (document.visibilityState !== 'visible') return; // onglet en arrière-plan : on attend qu'il soit montré
      document.removeEventListener('visibilitychange', jouer);
      window.removeEventListener('load', jouer);
      minuterie = window.setTimeout(() => o.current?.classList.add('o-saute'), 250); // le temps que la page s'affiche
    };
    document.addEventListener('visibilitychange', jouer);
    if (document.readyState === 'complete') jouer();
    else window.addEventListener('load', jouer);
    return () => {
      document.removeEventListener('visibilitychange', jouer);
      window.removeEventListener('load', jouer);
      window.clearTimeout(minuterie);
    };
  }, [doitSauter]);
  return o;
}

/**
 * Le logo DÉTOUR, tracé depuis les fichiers du brand kit : lettres en encre (ou craie en négatif), O jaune monté d'une
 * demi-capitale. Sous 96 px de large, utiliser <Monogramme> : à 34 px de haut, le logo fait 99 px. Ni ombre, ni contour, ni autre couleur pour le O.
 */
export function Logo({
  negatif = false,
  saute = false,
  className = '',
  titre = 'DÉTOUR',
}: {
  /** Lettres en craie, pour un fond encre ou une photo sombre. */
  negatif?: boolean;
  /** Le O saute à l'ouverture du site, une fois par visite. */
  saute?: boolean;
  className?: string;
  /** Texte lu par les lecteurs d'écran ; vide si le logo est dans un lien déjà nommé. */
  titre?: string;
}) {
  const o = useSaut(saute ? premiereFoisDeLaVisite : undefined);
  return (
    <svg viewBox={LOGO_VIEWBOX} className={`overflow-visible ${className}`} role={titre ? 'img' : undefined} aria-label={titre || undefined} aria-hidden={titre ? undefined : true}>
      <path d={TRACE_LETTRES} fill={negatif ? 'var(--detour-craie)' : 'var(--detour-encre)'} />
      <g transform={`translate(0 -${SAUT_O})`}>
        <path ref={o} d={TRACE_O} fill="var(--detour-jaune)" />
      </g>
    </svg>
  );
}

/**
 * Monogramme « DO » : le D sur la ligne, le O qui saute. Pour les petites tailles et l'écran de confirmation du
 * conseiller, où le O se clique quand la réservation vient d'être confirmée (`saute` dit au montage s'il faut sauter).
 */
export function Monogramme({
  saute,
  pastille = false,
  className = '',
  titre = '',
}: {
  saute?: () => boolean;
  /** Version icône d'app : carré encre aux coins arrondis à 22,5 %, D en craie. */
  pastille?: boolean;
  className?: string;
  titre?: string;
}) {
  const o = useSaut(saute);
  return (
    <svg viewBox={MONOGRAMME_VIEWBOX} className={`overflow-visible ${className}`} role={titre ? 'img' : undefined} aria-label={titre || undefined} aria-hidden={titre ? undefined : true}>
      {pastille && <rect x="-267.75" y="-1442.25" width="1894.5" height="1894.5" rx="426.2625" fill="var(--detour-encre)" />}
      <path d={TRACE_D} fill={pastille ? 'var(--detour-craie)' : 'var(--detour-encre)'} />
      <g transform={`translate(${DECALAGE_O_MONOGRAMME} -${SAUT_O})`}>
        <path ref={o} d={TRACE_O} fill="var(--detour-jaune)" />
      </g>
    </svg>
  );
}

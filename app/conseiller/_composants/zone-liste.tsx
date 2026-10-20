'use client';

import { usePathname } from 'next/navigation';

/**
 * Colonne de la liste : affichée sur l'accueil de l'espace et sur la fiche d'un dossier. Sur téléphone, l'accueil
 * montre la liste seule et la fiche montre le dossier seul (retour par le fil d'Ariane).
 */
export function ZoneListe({ children }: { children: React.ReactNode }) {
  const chemin = usePathname();
  const accueil = chemin === '/conseiller';
  if (!accueil && !chemin.startsWith('/conseiller/dossiers/')) return null;
  return (
    <aside
      aria-label="Liste des dossiers"
      className={`${accueil ? 'block min-h-[75vh] lg:min-h-0' : 'hidden lg:block'} w-full border-trait bg-white lg:w-[372px] lg:shrink-0 lg:border-r`}
    >
      {/* la colonne blanche va jusqu'en bas ; la liste elle-même reste visible pendant qu'on fait défiler le dossier */}
      <div className="lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto">{children}</div>
    </aside>
  );
}

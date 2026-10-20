import { Suspense } from 'react';
import { ListeDossiers } from './_composants/liste-dossiers';
import { ZoneListe } from './_composants/zone-liste';

/**
 * Espace conseiller : le design system du back-office (classe `bo`). Sur les pages des dossiers, la liste reste à
 * gauche et le dossier ouvert s'affiche à droite ; les autres pages (proposition, vérification) prennent toute la largeur.
 */
export default function ConseillerLayout({ children }: LayoutProps<'/conseiller'>) {
  return (
    <div className="bo flex flex-1 flex-wrap items-stretch">
      <Suspense fallback={null}>
        <ZoneListe>
          <Suspense fallback={<p className="p-6 text-ardoise">Chargement des dossiers…</p>}>
            <ListeDossiers />
          </Suspense>
        </ZoneListe>
      </Suspense>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col">{children}</div>
    </div>
  );
}

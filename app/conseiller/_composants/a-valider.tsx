/**
 * Repères visuels de l'étape à valider : où le conseiller doit agir maintenant. La pastille dit « à valider » en toutes
 * lettres (jamais la couleur seule), le contour entoure la zone, le lien du bandeau y descend.
 */

/** Contour de la zone qui attend le conseiller ; `scroll-mt` laisse un peu d'air quand le lien du bandeau y descend. */
export const ZONE_A_VALIDER = 'scroll-mt-6 ring-2 ring-encre';

export function AValider({ texte = 'À valider' }: { texte?: string }) {
  return (
    <span className="bo-puce inline-flex items-center gap-1.5 bg-encre text-craie">
      <span aria-hidden className="size-1.5 rounded-full bg-craie motion-safe:animate-pulse" />
      {texte}
    </span>
  );
}

/** « Aller à l'étape ↓ » : descend jusqu'à la zone à valider de la même page. */
export function AllerA({ cible, libelle = 'Aller à l’étape' }: { cible: string; libelle?: string }) {
  return (
    <a href={`#${cible}`} className="bo-btn-2 text-sm no-underline">
      {libelle} <span aria-hidden>↓</span>
    </a>
  );
}

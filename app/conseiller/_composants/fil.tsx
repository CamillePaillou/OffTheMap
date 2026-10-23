import Link from 'next/link';

/**
 * Fil d'Ariane de l'espace conseiller : où l'on est, et un lien vers chaque niveau au-dessus. La flèche « ← » ramène au
 * niveau juste au-dessus (le dernier lien du fil), sans passer par le bouton « précédent » du navigateur.
 */
export function Fil({ etapes }: { etapes: readonly { libelle: string; href?: string }[] }) {
  const parent = etapes.filter((e) => e.href).at(-1);
  return (
    <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {parent && (
        <Link
          href={parent.href!}
          aria-label={`Retour : ${parent.libelle}`}
          title={`Retour : ${parent.libelle}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-trait bg-carte text-base font-semibold text-encre no-underline hover:bg-craie"
        >
          <span aria-hidden>←</span>
        </Link>
      )}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-encre-doux">
        {etapes.map((e, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>/</span>}
            {e.href ? (
              <Link href={e.href} className="font-semibold underline-offset-4 hover:underline">
                {e.libelle}
              </Link>
            ) : (
              <span aria-current="page" className="text-encre">
                {e.libelle}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

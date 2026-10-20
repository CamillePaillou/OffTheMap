import Link from 'next/link';

/** Fil d'Ariane de l'espace conseiller : où l'on est, et un lien vers chaque niveau au-dessus. */
export function Fil({ etapes }: { etapes: readonly { libelle: string; href?: string }[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ardoise">
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

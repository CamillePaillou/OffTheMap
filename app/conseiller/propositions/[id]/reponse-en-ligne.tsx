import type { ReponseEnLigne } from '@/src/ports/espaceClient';
import { instantParis } from '../../_composants/libelles';

/**
 * Réponse donnée par le client dans son espace (espace client). Elle ne change aucun statut : le conseiller la lit,
 * puis l'enregistre avec les panneaux habituels (acceptation, ou nouvelle version pour un changement).
 */
export function CarteReponseEnLigne({ reponse }: { reponse: ReponseEnLigne }) {
  const acceptee = reponse.type === 'acceptee';
  return (
    <section className="rounded-[18px] border-l-4 border-encre bg-ciel-pale p-4 text-sm text-encre">
      <h2 className="text-lg">{acceptee ? 'Le client accepte en ligne' : 'Le client demande un changement en ligne'}</h2>
      <p className="mt-1 text-encre-doux">Depuis son espace, {instantParis(reponse.cree_le)}.</p>
      {reponse.message && <blockquote className="mt-2 whitespace-pre-line border-l-2 border-encre/30 pl-3">{reponse.message}</blockquote>}
      <p className="mt-2">
        {acceptee
          ? 'Enregistrez l’acceptation ci-dessous pour passer au dépôt de garantie.'
          : 'Préparez une nouvelle version avec « Changement demandé » ci-dessous.'}
      </p>
    </section>
  );
}

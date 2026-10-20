import { euros, type EcartPrix } from '@/src/domain/ecartPrix';

const COULEUR = { hausse: 'text-red-700', baisse: 'text-green-700', identique: 'text-doux' } as const;

/** Écart revérifié − proposé. Rouge si le prix monte, vert s'il baisse. */
export function Ecart({ ecart, total = false }: { ecart: EcartPrix | null; total?: boolean }) {
  if (!ecart) return <span className="text-doux">non vérifié</span>;
  if (ecart.sens === 'identique') return <span className={COULEUR.identique}>aucun écart</span>;
  const montant = total ? ecart.total_cents : ecart.unitaire_cents;
  return (
    <span className={`font-medium ${COULEUR[ecart.sens]}`}>
      {euros(montant, true)}
      {ecart.pourcentage !== null && ` (${ecart.pourcentage > 0 ? '+' : ''}${ecart.pourcentage.toLocaleString('fr-FR')} %)`}
    </span>
  );
}

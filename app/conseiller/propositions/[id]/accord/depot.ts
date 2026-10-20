import 'server-only';
import { AccordsEnMemoire } from '@/src/infrastructure/db/accordsEnMemoire';

/**
 * Dépôt des accords de l'écran (en mémoire) : remplacé par l'adaptateur PostgreSQL quand les cas d'usage
 * seront branchés à la base. Conservé sur globalThis pour survivre au rechargement à chaud en développement.
 */
const g = globalThis as unknown as { __accordsDemo?: AccordsEnMemoire };
export const accordsDemo = (g.__accordsDemo ??= new AccordsEnMemoire());

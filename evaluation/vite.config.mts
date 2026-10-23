// Configuration de vite-node pour la campagne (make campagne) : alias de tsconfig, et modules réservés à Next.js remplacés.
import { fileURLToPath } from 'node:url';

const ici = (chemin: string) => fileURLToPath(new URL(chemin, import.meta.url));

const config = {
  resolve: {
    alias: [
      { find: 'server-only', replacement: ici('./support/vide.ts') },
      { find: /^(?:\.\/|(?:\.\.\/)+lib\/supabase\/|@\/lib\/supabase\/)serveur$/, replacement: ici('./support/supabase-campagne.ts') },
      { find: /^@\//, replacement: ici('../') },
    ],
  },
};

export default config;

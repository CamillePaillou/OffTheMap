import type { Metadata } from 'next';
import Link from 'next/link';
import { CadreCompte } from '../cadre';
import { FormulaireInscription } from '../formulaires';

export const metadata: Metadata = { title: 'Créer mon espace' };

// Inscription du client : facultative. L'adresse confirmée relie le compte aux demandes faites avec elle.
export default function InscriptionPage() {
  return (
    <CadreCompte
      titre="Créer mon espace"
      intro="Pour suivre vos demandes, lire votre proposition et y répondre en ligne. Rien d’obligatoire : une demande se fait aussi sans compte."
      pied={
        <p>
          Déjà un espace ?{' '}
          <Link href="/compte/connexion" className="font-semibold underline underline-offset-4">
            Se connecter
          </Link>
        </p>
      }
    >
      <FormulaireInscription />
    </CadreCompte>
  );
}

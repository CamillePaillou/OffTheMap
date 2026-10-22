import type { Metadata } from 'next';
import Link from 'next/link';
import { CadreCompte } from '../cadre';
import { FormulaireMotDePasseOublie } from '../formulaires';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

// Récupération du mot de passe : un lien par e-mail, valable une heure. Même réponse que l'adresse ait un compte ou non.
export default function MotDePasseOubliePage() {
  return (
    <CadreCompte
      titre="Mot de passe oublié"
      intro="Indiquez l’adresse de votre espace : nous vous envoyons un lien pour choisir un nouveau mot de passe."
      pied={
        <p>
          <Link href="/compte/connexion" className="font-semibold underline underline-offset-4">
            Revenir à la connexion
          </Link>
        </p>
      }
    >
      <FormulaireMotDePasseOublie />
    </CadreCompte>
  );
}

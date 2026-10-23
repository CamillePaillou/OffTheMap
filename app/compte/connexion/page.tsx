import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { suiteClientSure } from '@/lib/auth/redirection';
import { CadreCompte } from '../cadre';
import { FormulaireConnexionClient } from '../formulaires';

export const metadata: Metadata = { title: 'Mon espace' };

const MESSAGES: Record<string, string> = {
  lien: 'Ce lien a expiré ou a déjà servi. Connectez-vous ; si votre adresse n’est pas encore confirmée, un nouvel e-mail peut partir.',
  'lien-mdp': 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau depuis « Mot de passe oublié ».',
};

// Connexion du client (espace client, compte facultatif).
export default function ConnexionClientPage({ searchParams }: PageProps<'/compte/connexion'>) {
  return (
    <CadreCompte
      titre="Mon espace"
      intro="Retrouvez vos demandes, lisez votre proposition et répondez en ligne."
      pied={
        <p>
          Pas encore d’espace ?{' '}
          <Link href="/compte/inscription" className="font-semibold underline underline-offset-4">
            Créer mon espace
          </Link>
        </p>
      }
    >
      <Suspense>
        <Formulaire searchParams={searchParams} />
      </Suspense>
    </CadreCompte>
  );
}

async function Formulaire({ searchParams }: Pick<PageProps<'/compte/connexion'>, 'searchParams'>) {
  const { suite, erreur } = await searchParams;
  const texte = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const code = texte(erreur);
  return <FormulaireConnexionClient suite={suiteClientSure(texte(suite))} erreurInitiale={code ? MESSAGES[code] : undefined} />;
}

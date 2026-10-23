/** Lit le FormData du formulaire de demande et le met dans la forme attendue par schemaSaisieDemande. */
import { REGIMES } from '../../types/enums';

const texte = (f: FormData, nom: string) => (f.get(nom)?.toString() ?? '').trim();
const entier = (f: FormData, nom: string) => {
  const v = texte(f, nom);
  return v === '' ? null : Number(v);
};
const coche = (f: FormData, nom: string) => f.get(nom) === 'on';

export function lireSaisie(f: FormData) {
  return {
    nom: texte(f, 'nom'),
    email: texte(f, 'email'),
    destination: texte(f, 'destination'),
    date_debut: texte(f, 'date_debut'),
    date_fin: texte(f, 'date_fin'),
    adultes: entier(f, 'adultes'),
    enfants: entier(f, 'enfants') ?? 0,
    budget_euros: entier(f, 'budget_euros'),
    envies: texte(f, 'envies'),
    contraintes: texte(f, 'contraintes'),
    regimes: REGIMES.filter((r) => coche(f, `regime_${r}`)),
    mobilite: coche(f, 'mobilite_reduite') ? 'reduite' : null,
    prestations: f.getAll('prestation').map(String).slice(0, 6),
    consentement_rgpd: coche(f, 'consentement_rgpd'),
    consentement_ia: coche(f, 'consentement_ia'),
  };
}

/** Valeurs à remettre dans le formulaire après une erreur, pour ne rien faire ressaisir. */
export function valeursSaisies(f: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, v] of f.entries()) if (typeof v === 'string' && !cle.startsWith('$')) valeurs[cle] = v;
  return valeurs;
}

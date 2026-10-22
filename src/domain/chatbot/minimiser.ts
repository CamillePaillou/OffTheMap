/**
 * Minimisation des messages du chatbot (E1.3) : rien de personnel ne part vers le modèle.
 * Le visiteur peut écrire son e-mail, son téléphone ou une information de santé : elle est remplacée avant l'envoi,
 * et le texte d'origine n'est gardé nulle part (la conversation vit dans le navigateur, pas sur le serveur).
 */

export const RETIRE = {
  email: '[e-mail retiré]',
  telephone: '[téléphone retiré]',
  numero: '[numéro retiré]',
  sante: '[information de santé retirée]',
  nom: '[nom retiré]',
} as const;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// 06 12 34 56 78, 06.12.34.56.78, 0612345678, +33 6 12 34 56 78
const TELEPHONE = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
// carte bancaire, IBAN, numéro de sécurité sociale : 12 chiffres ou plus, espaces permis
const NUMERO_LONG = /\b(?:\d[\s-]?){12,}\b/g;
// santé : la racine suffit (allergie, allergique, intolérant, diabétique…) ; accents optionnels
// … et son complément direct : « allergique aux noix », « intolérant au gluten »
const SANTE =
  /[\p{L}]*(?:allerg|intol[ée]ran|diab[èée]t|enceinte|grossesse|maladi|m[ée]dicament|handicap|asthm|[ée]pilep|c[œo]e?liaq|cancer|d[ée]pressi|insulin|cardiaq)[\p{L}]*(?:\s+(?:à|aux|au|a|de|des|du|en)\s+(?:la\s+|le\s+|l['’])?[\p{L}'’-]+)?/giu;
// « je m'appelle Léa Martin », « mon nom est … », « c'est Léa »
const NOM = /\b(je m['’]appelle|mon nom est|mon nom c['’]est|moi c['’]est)\s+[\p{Lu}][\p{L}'’-]*(?:\s+[\p{Lu}][\p{L}'’-]*)?/gu;

export function minimiser(texte: string): string {
  return texte
    .replace(EMAIL, RETIRE.email)
    .replace(NUMERO_LONG, RETIRE.numero)
    .replace(TELEPHONE, RETIRE.telephone)
    .replace(SANTE, RETIRE.sante)
    .replace(NOM, (_m, intro: string) => `${intro} ${RETIRE.nom}`);
}

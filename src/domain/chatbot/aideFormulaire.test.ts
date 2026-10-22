import { describe, expect, it } from 'vitest';
import { aideFormulaire, EtatFormulaire, relancesFormulaire } from './aideFormulaire';
import { minimiser } from './minimiser';

const VIDE: EtatFormulaire = { manquantes: ['vous', 'voyage', 'voyageurs', 'budget', 'envies', 'accords'], erreurs: [] };
const COMPLET: EtatFormulaire = { manquantes: [], erreurs: [] };

describe('chatbot sur le formulaire de demande', () => {
  it('dit ce qu’il reste à remplir, les étapes obligatoires d’abord', () => {
    const r = aideFormulaire('Qu’est-ce qu’il me manque ?', { manquantes: ['voyage', 'budget', 'accords'], erreurs: [] });
    expect(r).toMatch(/Il vous reste à remplir : Votre voyage \(départ, retour, nuits\) et Vos accords/);
    expect(r).not.toMatch(/Budget/);
  });

  it('explique d’abord le champ en erreur, avec sa règle', () => {
    const r = aideFormulaire('pourquoi je ne peux pas envoyer', { manquantes: [], erreurs: ['nb_nuits', 'consentement_ia'] });
    expect(r).toMatch(/^2 champs sont à corriger\. « Nombre de nuits » : pas plus de nuits que de jours/);
    expect(r).toMatch(/Ensuite : « Vos accords » : la seconde case/);
  });

  it('donne le feu vert quand l’obligatoire est rempli', () => {
    expect(aideFormulaire('c’est bon ?', COMPLET)).toMatch(/Tout l’obligatoire est rempli/);
  });

  it.each([
    ['Combien de nuits je mets ?', /départ samedi, retour dimanche, c’est 1 nuit/],
    ['Le budget, c’est par personne ?', /total pour tout le groupe/],
    ['Mon fils a 15 ans, adulte ou enfant ?', /moins de 18 ans/],
    ['Que mettre dans mes envies ?', /Ce qui vous ferait plaisir/],
    ['Je n’ai pas d’idée de destination', /Laissez le champ vide/],
    ['À quoi sert la case sur l’IA ?', /résumée par une IA, sans votre nom/],
    ['Faut-il créer un compte ?', /Pas de compte à créer/],
    ['Et après l’envoi ?', /un conseiller lit votre demande/],
  ])('répond sur le formulaire : « %s »', (question, attendu) => {
    expect(aideFormulaire(question, VIDE)).toMatch(attendu);
  });

  it('oriente une information de santé vers les cases, sans la reprendre', () => {
    const question = minimiser('ma fille est allergique aux arachides, je le mets où ?');
    const r = aideFormulaire(question, VIDE)!;
    expect(r).toMatch(/cochez la case qui convient dans « Alimentation et mobilité »/);
    expect(r).not.toMatch(/arachides|allerg/i);
  });

  it('laisse au chatbot habituel les questions sur l’offre', () => {
    expect(aideFormulaire('Que faire à Lyon ?', VIDE)).toBeNull();
    expect(aideFormulaire('Libre le 7 novembre pour 2 ?', VIDE)).toBeNull();
  });

  it('refuse un état qui contiendrait une valeur ou l’étape santé', () => {
    expect(EtatFormulaire.safeParse({ manquantes: ['besoins'], erreurs: [] }).success).toBe(false);
    expect(EtatFormulaire.safeParse({ manquantes: [], erreurs: [], email: 'lea@example.org' }).success).toBe(false);
  });

  it('propose des réponses rapides selon ce qui manque', () => {
    expect(relancesFormulaire(VIDE)).toEqual(['Qu’est-ce qu’il me manque ?', 'Combien de nuits mettre ?', 'Que mettre dans mes envies ?']);
    expect(relancesFormulaire(COMPLET)).toEqual(['Qu’est-ce qu’il me manque ?', 'Que faire à Lyon ?']);
  });
});

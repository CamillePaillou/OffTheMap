# Definition of Done

Une issue est terminée quand :

- [ ] son résultat vérifiable est constaté et démontré, pas seulement codé ;
- [ ] la PR est relue par un autre membre, fusionnée dans `main`, et `CODEOWNERS` est respecté ;
- [ ] la CI est verte (lint, types, tests, build, détection de secrets) ;
- [ ] des tests couvrent le changement, au moins un par règle critique ;
- [ ] aucun secret ni donnée sensible dans le dépôt, les logs ou les traces ; `.env.example` à jour si une variable est ajoutée ;
- [ ] les contrats touchés (types, JSON, tables) sont à jour et la PR porte le label `contract` si besoin ;
- [ ] la documentation est à jour si une commande ou un comportement change ;
- [ ] pour un écran ou une route : déployé et vérifié sur Vercel ;
- [ ] pour l’agent : aucune permission d’écriture pour le modèle, test de non-écriture vert, jeton jamais dans son contexte ;
- [ ] la carte est en « Terminé » dans le tableau, liée à sa PR.

## Critères d’acceptation clés

```gherkin
Scénario : envoi bloqué
  Étant donné une proposition avec une ligne « à vérifier »
  Quand le conseiller clique sur « Envoyer »
  Alors l’envoi est refusé et le statut ne change pas

Scénario : option sans accord
  Étant donné une prestation vérifiée par l’agent
  Quand une option est demandée sans jeton d’approbation valide
  Alors rien n’est écrit et la tentative est tracée

Scénario : serveur en échec
  Étant donné un serveur de prestations qui répond par une erreur
  Quand l’agent conclut sa vérification
  Alors la réponse est « non vérifié », sans prix ni nombre de places
```

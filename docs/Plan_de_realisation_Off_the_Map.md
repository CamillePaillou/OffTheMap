# Off the Map — Plan de réalisation

> **Off the Map** : outil interne de l'agence Detour (voyages insolites) qui prépare les propositions sur mesure.
> Deux briefs cadrent la démonstration : **agent de vérification** et **option avec accord humain**. Cas de démonstration : un week-end créatif à Nantes, sans voiture.
> Plan opérationnel du MVP « agents IA » : 7 jours, équipe de 4 développeurs (P1 à P4) et un PO.
> Ce document sert de source pour créer le tableau GitHub Projects : chaque `Ex.y` est une issue, le bloc de l'annexe est lu par le script de création (E0.15).
>
> **Version à valider.** Une fois validé, ce document est figé au cadrage : les identifiants `Ex.y` ne sont plus renumérotés, sinon ils ne correspondraient plus aux cartes du tableau. Les changements passent par de nouvelles issues.

---

## Sommaire

- Objectif et priorités
- Décisions techniques (ADR résumés)
- Architecture Clean — couches et arborescence
- Modèle de données
- Contrats à figer le jour 1
- Organisation et méthode de travail
- Backlog par epics
- Planning J1 à J7
- Configuration GitHub Projects
- Tests et CI
- Livrables de fin de sprint
- Risques et parades
- Annexe — données pour le script de création des issues

---

## 1. Objectif et priorités

**Objectif :** réduire le temps de préparation d'une proposition sur mesure de **6 h à environ 2 h**, sans toucher au contact humain. Une proposition représente aujourd'hui 6 h de travail et une vingtaine de mails (5 de cadrage, 11 d'allers-retours, 4 de confirmation).

**Principe directeur :** l'IA rédige et propose, le code calcule, le conseiller décide. Aucun prix ne vient de l'IA et rien de généré par l'IA ne part au client sans validation du conseiller.

**Sprint Goal :** Un conseiller obtient une proposition chiffrée dont un prix est vérifié par l’agent, puis une option de 30 minutes posée seulement après son accord.

**Parcours principal, non négociable :** `demande → fiche IA → tri → brouillon chiffré → vérification par l'agent → accord du conseiller → option de 30 minutes → envoi → changement → dépôt`. L'agent consulte et propose ; il ne pose, ne confirme et n'annule rien. Le reste passe après un parcours principal fiable.

| Priorité | Sens | Contenu |
| --- | --- | --- |
| **Must** | Le MVP ne marche pas sans | Demande, fiche, tri, chiffrage, brouillon, vérification par l'agent, accord et option de 30 minutes, envoi, nouvelle version, dépôt |
| **Should** | Important, le parcours tourne sans | Mails automatiques (rendez-vous, proposition, confirmation), seconde validation avant confirmation, retour argumenté, formulaire prérempli par lien, rappels J+3 et J+7 |
| **Could** | Confort | Proposition d'abandon à J+14, préparation soignée de la démo |

**Simulé ou hors MVP :**

- Dépôt de garantie : un bouton « dépôt reçu » cliqué par le conseiller, sans connexion bancaire.
- Rendez-vous : un lien Cal.com ou Calendly, sans intégration (le système ne sait pas si le client a réservé).
- Serveur des prestataires : un serveur fictif qui répond en JSON et peut échouer (délai dépassé, erreur, indisponible).
- Mails : le conseiller les envoie à la main dans le MVP ; les envois automatiques sont des Should.
- Phase 2 : automatisations n8n (rappels, relances), transcription Notion de l'entretien (avec consentement), connexion à de vrais serveurs de prestataires, deuxième rendez-vous, réservation et documents de voyage après le dépôt.

> Un tarif absent ou trop ancien apparaît « à vérifier ». Il n'est jamais estimé par l'IA.

---

## 2. Décisions techniques (ADR résumés)

À committer dans `docs/adr/` le jour 1. Format court : contexte, décision, conséquences.

- **ADR-0001 — Stack.** Next.js (React, TypeScript) avec deux espaces, `/demande` (page publique) et `/conseiller` ; Supabase (PostgreSQL, région UE) ; Cal.com pour les rendez-vous ; Vercel pour l'hébergement ; les mails partent de l'application via un port `Mailer` (Resend ou Brevo, à trancher). **n8n est retiré du MVP** : un outil de plus à apprendre pour un bénéfice faible avec quatre développeurs ; il reste possible en phase 2 pour les automatisations. Si personne dans l'équipe ne connaît Next.js et Supabase, une stack déjà maîtrisée vaut mieux en 7 jours : à vérifier avant le J1.
- **ADR-0002 — Pas de framework d'agents.** Le besoin est un workflow fixe avec quatre étapes IA (fiche, présélection, brouillon, reformulation des écarts ; la quatrième est un Should). Des appels LLM bien cadrés sont plus prévisibles et plus faciles à tester. L'agent de vérification utilise une boucle d'outil écrite à la main (E8), sans framework. En démonstration, on les présente comme des « agents » spécialisés ; seul l'agent de vérification appelle un outil.
- **ADR-0003 — Clean Architecture allégée.** Le cœur métier (`domain`) ne dépend d'aucun outil. Les pages ne parlent jamais à Supabase directement : elles passent par un cas d'usage. Un port `LlmClient` permet de changer de fournisseur (Claude, Mistral ou OpenAI) en écrivant un adaptateur.
- **ADR-0004 — Chiffrage en fonction pure.** Un prix doit être exact et reproductible : c'est du calcul, avec tests unitaires, jamais de l'IA. Le LLM produit un JSON (prestataires, quantités, texte sans chiffre) ; le code calcule ; un gabarit assemble.
- **ADR-0005 — Chaîne de déclenchement asynchrone.** Insertion dans `demandes`, webhook Supabase, endpoint `/api/fiche`, LLM, validation du JSON, écriture dans `fiches`. Statuts visibles (`fiche_en_cours`, `fiche_prete`, `erreur`), un nouvel essai automatique, puis alerte. Secret partagé entre le webhook et l'endpoint. Raison : les fonctions serverless ont une durée maximale (timeouts Vercel).
- **ADR-0006 — Versions et immuabilité.** Une demande a plusieurs versions (une ligne par version, `dossier_id` stable). Une proposition envoyée n'est jamais modifiée : un changement crée la version suivante.
- **ADR-0007 — RGPD et minimisation.** Consentement et mention de l'IA dans le formulaire. Avant tout appel au LLM, seule la catégorie des données de santé et de régime est transmise, jamais l'identité ni le texte libre. Option : fournisseur européen (Mistral).
- **ADR-0008 — Journal unique.** Toute transition de statut passe par une fonction qui change le statut et écrit dans `historique_dossier` ensemble.
- **ADR-0009 — Agent de vérification.** Une boucle d'outil écrite à la main : le modèle propose un appel, le code le valide (outil autorisé, arguments conformes), le serveur répond, le code renvoie le résultat au modèle, qui conclut. Un seul outil est exposé : vérifier la disponibilité. L'agent ne pose, ne confirme et n'annule rien. Si le serveur échoue, aucun prix ni nombre de places n'est annoncé.
- **ADR-0010 — Option avec accord humain.** Une option dure 30 minutes et porte sur une prestation. Elle n'est posée qu'avec un jeton d'approbation créé côté serveur après l'accord identifiable du conseiller : jeton à usage unique, lié à la prestation, au prix et au conseiller, jamais transmis au modèle. Une seconde validation distincte précède toute confirmation.

---

## 3. Architecture Clean — couches et arborescence

Les dépendances pointent vers l'intérieur : `app/` et `infrastructure/` dépendent de `application/`, qui dépend de `domain/`, qui n'importe rien.

```
off-the-map/           # nom du dépôt
app/
  demande/            # P1, page publique
  conseiller/         # P2, back-office
  api/                # endpoints minces appelés par le webhook et le back-office
    mock/             # serveur fictif de prestations (disponibilité, option)
src/
  domain/             # règles pures : chiffrage, statuts, écarts, contrôles (zéro dépendance)
  application/        # cas d'usage : generateFiche, preselect, draftProposal, createVersion, verifyAvailability, placeOption…
  ports/              # interfaces : LlmClient, repositories, Mailer
  infrastructure/
    supabase/         # accès aux données
    llm/              # adaptateurs, prompts, schémas de validation
    mail/             # fournisseur de mails (Resend ou Brevo)
types/                # contrat de données figé au J1
supabase/migrations/  # schéma versionné
supabase/seed.sql     # catalogue de démo, dossier de Sophie
docs/adr/             # décisions
scripts/              # script de création des issues (Python)
docker-compose.yml, Makefile, .env.example, CODEOWNERS
```

Règles : les pages n'appellent jamais Supabase directement ; `domain/` n'importe rien d'extérieur ; chaque propriétaire correspond à un dossier (`CODEOWNERS`). La règle de dépendances est vérifiée en CI (en TypeScript, `eslint-plugin-boundaries` ou `dependency-cruiser`).

---

## 4. Modèle de données

Neuf tables, une demande au centre. Le détail des sept premières (type, qui écrit, qui lit, sensibilité) est dans le PDF `Workflow_v4_et_donnees_agence_de_voyage.pdf` ; `verifications` et `options` sont décrites plus bas. Noms de champs et de valeurs sans accent (convention base de données).

| Table | Une ligne représente… | Rattachement |
| --- | --- | --- |
| `demandes` | une version de la demande du client (le brut du formulaire) | `dossier_id` regroupe les versions |
| `fiches` | l'interprétation d'une version de demande (IA, corrigée par le conseiller) | `demande_id` (la version) ; une fiche par version |
| `retours` | un motif de correction renvoyé au client | `demande_id` (la version à corriger) |
| `propositions` | une version d'un devis | `dossier_id` |
| `proposition_lignes` | un poste d'une version de proposition (un prestataire, une quantité, un prix) | `proposition_id`, `prestataire_id` |
| `prestataires` | un hébergement, une activité, un guide ou un transport du catalogue | indépendant des dossiers |
| `historique_dossier` | un fait daté du dossier (statut, mail, rappel, dépôt, changement) | `dossier_id`, `proposition_id` optionnel |
| `verifications` | une vérification d'une ligne par l'agent (réponse du serveur, prix revérifié, trace expurgée) | `ligne_id` |
| `options` | une option de 30 minutes sur une prestation, après accord du conseiller | `ligne_id`, `verification_id` |

**Décisions de modélisation**

- `demandes` garde le brut, `fiches` l'interprétation : une correction du conseiller n'écrase jamais la demande.
- L'âge des voyageurs est collecté dans le formulaire (liste de voyageurs) ; `prestataires` porte un tarif enfant par tranche d'âge.
- Le tarif catalogue est copié dans `proposition_lignes` à la création : la proposition reste intacte si le catalogue change.
- Une limite d'âge ou de niveau physique d'un prestataire déclenche une alerte ; le conseiller tranche.
- Valeurs manquantes : jamais converties en 0. Montants en centimes (entiers) pour éviter les arrondis.

**Statuts**

| Table | Valeurs |
| --- | --- |
| `demandes.statut` | `nouvelle`, `fiche_en_cours`, `fiche_prete`, `erreur`, `go`, `a_corriger`, `refusee`, `rdv_propose`, `entretien_fait`, `en_proposition`, `gagnee`, `abandonnee`, `remplacee` |
| `propositions.statut` | `brouillon_en_cours`, `brouillon_pret`, `a_verifier`, `prete`, `envoyee`, `sans_reponse`, `changement_demande`, `remplacee`, `acceptee`, `depot_recu`, `erreur` |
| `proposition_lignes.statut` | `a_verifier`, `confirme`, `indisponible`, `remplacee` |
| `proposition_lignes.source` | `mail`, `telephone`, `lien`, `agent` |
| `verifications.statut` | `ok`, `echec`, `indisponible` |
| `options.statut` | `accord_donne`, `posee`, `expiree`, `echec`, `confirmee` |

Les transitions autorisées sont portées par la fonction de transition (E0.7) et la matrice des transitions (E0.8). Les autres énumérations (motifs de retour, types de prestataires, niveaux physiques, tranches d'âge…) sont en annexe du PDF de données.

**Nouvelles tables**

| Table | Champs principaux | Écrite par |
| --- | --- | --- |
| `verifications` | `id`, `ligne_id`, `demande_par`, `statut`, `prix_reverifie_cents`, `places`, `conditions`, `reponse_serveur` (JSON), `trace` (JSON expurgé), `modele`, `nb_tours`, `arret`, `cree_le` | le serveur (cas d'usage de l'agent) |
| `options` | `id`, `ligne_id`, `verification_id`, `statut`, `accord_par`, `accord_le`, `prix_accorde_cents`, `jeton_hash` (jamais le jeton), `expire_le`, `reponse_serveur` (JSON), `cree_le` | le serveur, après l'accord du conseiller |

La trace ne contient ni clé, ni jeton, ni donnée sensible. `historique_dossier.type` gagne `verification` et `option`. Un tarif accepté par le conseiller après vérification est enregistré avec la source `agent`. Seul le serveur écrit dans ces deux tables : le modèle n'y a aucun accès.

---

## 5. Contrats à figer le jour 1

Ces contrats permettent aux quatre développeurs de travailler en parallèle sans se bloquer. Ils sont figés le matin du J1, en réunion de 45 minutes, puis versionnés. Toute évolution passe par une PR étiquetée `contract`, relue par les personnes concernées.

### 5.1 Types et énumérations

Dossier `/types` : la forme exacte de chaque table (champs, types, obligatoire ou optionnel, valeurs autorisées). Supabase peut générer les types depuis le schéma : la base devient la source de vérité. Issue : E0.4.

### 5.2 Payloads du dashboard (proposition à valider par P2 et P3)

Principes : montants en centimes ; valeur indisponible = `null`, jamais `0` ; pagination par `limit` et `offset` ; dates en UTC ISO-8601. Issue : E0.12. Ces formats sont des fixtures construites sur les types TypeScript partagés : pas de spécification séparée.

**Liste des dossiers : `GET /api/dossiers`**

```json
{
  "items": [
    {
      "dossier_id": "uuid",
      "version": 2,
      "statut": "en_proposition",
      "cree_le": "2026-10-19T09:12:00Z",
      "voyageurs": 4,
      "budget_annonce": { "montant_cents": 900000, "ferme": false },
      "destination": null,
      "fiche": { "statut": "fiche_prete" },
      "proposition": { "version": 1, "statut": "a_verifier", "total_cents": 920000, "lignes_a_verifier": 2 }
    }
  ],
  "total": 12, "limit": 50, "offset": 0
}
```

**Détail d'un dossier : `GET /api/dossiers/{id}`**

```json
{
  "dossier_id": "uuid",
  "demande": { "version": 2, "statut": "en_proposition", "voyageurs": [{ "age": 40 }, { "age": 41 }], "dates": { "debut": "2027-02-20", "fin": "2027-02-27", "flexible": false } },
  "fiche": { "statut": "fiche_prete", "budget_reel_cents": 900000, "points_flous": [], "validee": true },
  "propositions": [ { "version": 1, "statut": "remplacee", "total_cents": 920000 } ],
  "historique": [ { "date": "2026-10-19T09:15:00Z", "type": "statut", "ancien_statut": "nouvelle", "nouveau_statut": "fiche_en_cours", "auteur": "systeme" } ]
}
```

**Proposition : `GET /api/propositions/{id}`**

```json
{
  "id": "uuid", "version": 2, "statut": "a_verifier",
  "lignes": [
    {
      "id": "uuid",
      "prestataire": { "id": "uuid", "nom": "Cabane chauffée", "type": "hebergement" },
      "date_debut": "2027-02-20", "date_fin": "2027-02-25", "quantite": 5, "unite": "par_nuit",
      "tarif_catalogue_cents": 25000, "tarif_confirme_cents": null,
      "statut": "a_verifier", "total_ligne_cents": 125000
    }
  ],
  "total_cents": 920000, "marge_cents": 90000,
  "alertes": [ { "code": "budget_depasse", "message": "Le total dépasse le budget réel de 200 €." } ],
  "ecarts": { "prix_cents": 40000, "resume": null }
}
```

### 5.3 Contrats IA (JSON attendus)

Cinq appels IA. Chacun a un JSON validé par un schéma avant écriture. Règles communes : aucun montant dans un champ texte ; tout `prestataire_id` existe au catalogue ; santé et régime en catégories seules ; une réponse non conforme produit une erreur explicite, jamais une écriture partielle.

| Appel | Entrée | Sortie JSON | Interdits |
| --- | --- | --- | --- |
| Fiche | demande (champs filtrés) | `envies`, `contraintes`, `regimes`, `mobilite`, `niveau_physique`, `budget_annonce`, `points_flous` | tout nom, tout texte libre sensible |
| Présélection | fiche validée + prestataires compatibles | `prestataires` [id, rôle, raison], `ecartes` [id, raison] | prestataire hors catalogue |
| Brouillon | fiche + présélection | `programme` [jour, titre, texte], `lignes` [prestataire_id, dates, quantité, unité] | montant dans le texte, prix |
| Écarts | écarts calculés par le code | `resume` (texte) | tout nombre ou montant |
| Vérification (agent avec outil) | une ligne de proposition | appel d'outil `verifier_disponibilite`, puis conclusion : `statut`, `prix_cents`, `places`, `conditions`, `resume` | poser une option, confirmer, annuler ; inventer un prix ou des places si le serveur échoue |

### 5.4 Endpoints internes

Appelés par le webhook Supabase ou par le back-office. Authentifiés par un secret partagé ou par la session du conseiller. Réponse immédiate puis statut consultable (asynchrone).

| Route | Rôle | Appelée par |
| --- | --- | --- |
| `POST /api/fiche` | génère la fiche d'une version de demande | webhook Supabase, bouton « relancer » |
| `POST /api/preselection` | présélectionne des prestataires | back-office |
| `POST /api/brouillon` | génère le brouillon et ses lignes | back-office |
| `POST /api/ecarts` | calcule et reformule les écarts entre deux versions | back-office |
| `POST /api/verification` | lance l'agent de vérification sur une ligne | back-office |
| `POST /api/options/{id}/accord` | enregistre l'accord du conseiller et crée le jeton côté serveur | back-office |
| `POST /api/options` | pose l'option de 30 minutes avec un jeton valide | back-office |
| `GET /api/mock/disponibilite`, `POST /api/mock/option` | serveur fictif des prestations | agent, cas d'usage |

### 5.5 Rôles et accès (à confirmer)

| Table | Visiteur (sans compte) | Conseiller | Administrateur |
| --- | --- | --- | --- |
| `demandes` | insertion seule | lecture, écriture du statut | idem |
| `fiches`, `proposition_lignes`, `propositions` | aucun | lecture, écriture | idem |
| `retours` | lecture via jeton, sur la version à corriger | écriture | idem |
| `prestataires` | aucun | lecture, contact inclus | écriture du catalogue |
| `historique_dossier` | aucun | lecture seule | lecture seule |
| `verifications` | aucun | lecture ; écriture par le serveur seul | lecture |
| `options` | aucun | lecture ; écriture par le serveur après accord | lecture |

L'historique n'est écrit que par la fonction de transition ; `verifications` et `options` ne sont écrites que par le serveur, jamais par le modèle, qui ne voit que les résultats renvoyés par le code. Le rôle administrateur est une hypothèse à confirmer.

### 5.6 Contrat de l'agent de vérification (une page)

| | |
| --- | --- |
| **Mission** | vérifier une prestation d'une ligne de proposition auprès du serveur et rendre une réponse contrôlable |
| **Outil unique** | `verifier_disponibilite(prestation_id, dates, voyageurs)`, en lecture seule |
| **Permissions** | lecture du catalogue par le code ; aucune écriture ; ni option, ni confirmation, ni annulation |
| **Arrêt** | conclusion rendue, ou 3 tours atteints, ou échec du serveur : réponse « non vérifié », sans prix ni places |
| **Validation par le code** | outil autorisé, arguments conformes au schéma, réponse du serveur conforme avant renvoi au modèle |
| **Secrets** | la clé d'approbation et le jeton n'entrent jamais dans le contexte du modèle |
| **Trace** | étapes, appels et résultat, sans clé ni donnée sensible ; un fait annoncé est comparé au JSON du serveur |

---

## 6. Organisation et méthode de travail

| Personne | Domaine | Label | Principales sorties |
| --- | --- | --- | --- |
| **P1** | Formulaire, chiffrage, écrans | `ws:formulaire` | `/demande`, fonction de chiffrage et contrôles du domain, écran de proposition, Docker, CI, Vercel, serveur fictif de prestations, comparaison de faits |
| **P2** | Back-office conseiller | `ws:backoffice` | connexion, liste et fiche, tri, saisie des tarifs, écrans de vérification et d'accord, envoi, dépôt |
| **P3** | Base et données | `ws:donnees` | migrations, règles d'accès, transitions, webhook, seeds, tables verifications et options, jeton d'approbation, trace, nouvelle version |
| **P4** | Services IA | `ws:ia` | prompts, port LLM avec outils, boucle d'agent, présélection, brouillon, pose de l'option, port Mailer |
| **PO** | Pilotage | `ws:po` | backlog, règles métier, catalogue de démo en CSV, textes des mails, script des issues |

**Règles de collaboration (reprises d'AgentScope) :**

- Branches courtes `type/domaine/identifiant-titre`, par exemple `feat/ia/E2.2-fiche-automatique`.
- Une PR = une issue (`Closes #N`), relue par un autre membre. Une PR étiquetée `contract` (types, payloads, JSON IA) est relue par chaque personne concernée.
- `main` protégée : pas de push direct, une approbation minimum, CI verte.
- Intégration sur `main` au moins deux fois par jour. Jamais de « big bang » le dernier jour.
- Les stubs sont livrés en priorité (payloads en fixtures, faux client LLM, seeds) pour que personne n'attende.
- Aucun secret dans le dépôt : `.env.example` sans valeur sensible, détection de secrets en CI.

### Rituels, Scrum Masters et Definition of Done

Les événements Scrum n’existent pas dans GitHub : le dépôt ne contient que ce que l’équipe écrit. Les notes sont donc des fichiers versionnés dans `docs/rituels/`, et chaque rituel est suivi par une issue (epic E10) pour apparaître dans le tableau.

| Événement | Quand | Durée | Sortie écrite | Où dans le dépôt |
| --- | --- | --- | --- | --- |
| Sprint Planning | J1, début de journée | 1 h | Sprint Goal confirmé, estimations de l’équipe | `docs/rituels/sprint-goal.md` |
| Daily Scrum | chaque jour | 15 min | note de 5 lignes : avancement, blocages, limite de travail en cours | `docs/rituels/daily/Jx.md` |
| Sprint Review | dernier jour | 30 à 45 min | démonstration du parcours et retours | `docs/rituels/review.md` |
| Rétrospective | après la review | 45 min | à garder, à arrêter, une action | `docs/rituels/retrospective.md` |

Le temps des rituels est pris sur les 20 % non productifs de l’estimation : il n’ajoute pas de charge au plan.

**Scrum Master du jour** (rotation ; le PO reste PO) : anime le daily, écrit la note, relève les blocages, vérifie la limite de travail en cours (2 cartes par personne) et passe le relais.

| Jour | J1 | J2 | J3 | J4 | J5 | J6 | J7 | J8 | J9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Scrum Master | P1 | P2 | P3 | P4 | P1 | P2 | P3 | P4 | P1 |

**Definition of Done.** Une issue est terminée quand :

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

**Critères d’acceptation clés**

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

**Hypothèse d'estimation :** toute l'équipe travaille avec un assistant IA. Les durées de codage sont réduites d'environ 30 % (facteur 0,7) ; les relectures, l'intégration, les décisions et les tâches du PO ne sont pas réduites. À valider après les deux premiers jours.

**Charge par personne** (jours de travail, estimations à plus ou moins 50 %, capacité par développeur : 5,6 jours sur 7 avec 80 % de temps productif) :

| | Must | Should | Could | Total |
| --- | ---: | ---: | ---: | ---: |
| P1 | 5,98 | 1,8 | 0 | **7,78** |
| P2 | 5,62 | 1,8 | 0,4 | **7,83** |
| P3 | 5,88 | 0,4 | 0 | **6,28** |
| P4 | 5,88 | 0,8 | 0 | **6,67** |
| PO | 2,6 | 0,1 | 0 | **2,7** |
| **Total** | **25,95** | **4,9** | **0,4** | **31,25** |

Capacité des quatre développeurs : 22,4 jours. Leurs Must (23,35 jours) atteignent la capacité ; les Should et les Could ne tiennent pas dans le sprint. Le PO porte 2,6 jours de Must (catalogue, règles, textes des mails).

---

## 7. Backlog par epics

Estimation : **S** ≈ ½ j · **M** ≈ 1 j · **L** > 1 j. « Dépend » = issues à terminer avant. « Résultat vérifiable » = Definition of Done. Charge en jours de travail. Priorité : M Must, S Should, C Could.

**Découpage.** Chaque issue est une **user story** (« En tant que… je veux… afin de… ») qui livre un petit bout de parcours utilisable, ou un **enabler** technique (epic E0). Les dépendances dures sont limitées aux enablers : types et énumérations (E0.4), migrations (E0.16), port LLM (E0.13), serveur fictif (E0.14). Les stories s’appuient sur des fixtures et des faux composants, donc peuvent avancer en parallèle et s’intégrer ensuite.

### E0 — Socle technique et méthode (6,9 j)

*Objectif : Cinq personnes travaillent sur la même base, avec les mêmes données et les mêmes règles.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E0.1 | **Dépôt, protection de branche, CODEOWNERS, templates**<br>En tant qu’équipe, je veux un dépôt protégé avec des propriétaires par dossier afin de relire ce qui touche chacun. | P3 | S | 0,4 | — | Un push direct sur main est refusé ; CODEOWNERS actif ; templates présents | M |
| E0.2 | **CI et déploiement continu (lint, types, tests, build, secrets, Vercel)**<br>En tant qu’équipe, je veux une CI et un déploiement automatiques afin de voir la même version et ne jamais fusionner une PR cassée. | P1 | S | 0,4 | E0.1 | Une PR rouge est bloquée ; un merge sur main déploie /demande et /conseiller | M |
| E0.3 | **Docker Compose, Makefile, .env.example et squelette Next.js**<br>En tant que développeur, je veux lancer l’application avec make up afin de travailler dans le même environnement. | P1 | M | 0,7 | E0.1 | git clone, cp .env.example .env, make up : l’application répond chez les 4 développeurs | M |
| E0.4 | **Types et énumérations figés dans /types (9 tables, annexe d’énumérations)**<br>En tant qu’équipe, je veux des types et des énumérations figés afin de que les briques s’accordent et avancent en parallèle avec des fixtures. | P3 | S | 0,5 | E0.1 | Types relus et approuvés par les trois autres développeurs (PR étiquetée contract) | M |
| E0.16 | **Migrations des 7 tables du noyau : clés étrangères, unicité d’une fiche par version**<br>En tant qu’équipe, je veux des tables créées par des migrations versionnées afin de que chacun ait la même base. | P3 | M | 0,7 | E0.4 | make migrate crée les 7 tables ; une 2e fiche pour la même version est refusée | M |
| E0.5 | **Tables de l’agent : migrations de verifications et options (accès)**<br>En tant qu’équipe, je veux les tables des vérifications et des options afin de que l’agent et l’accord humain laissent des traces séparées. | P3 | M | 0,7 | E0.16 | Les deux tables existent ; un visiteur sans compte ne les lit pas ; seul le serveur y écrit | M |
| E0.6 | **Règles d’accès par ligne (RLS) selon la matrice rôles par table**<br>En tant que direction, je veux que seuls les conseillers lisent les dossiers afin de protéger les données des voyageurs. | P2 | S | 0,5 | E0.16 | Sans compte conseiller, aucune lecture de demandes ; contact des prestataires réservé ; test automatisé | M |
| E0.7 | **Fonction de transition de statut : statut et historique_dossier écrits ensemble**<br>En tant que conseiller, je veux retrouver chaque changement de statut d’un dossier afin de retracer ce qui s’est passé. | P3 | S | 0,4 | E0.16, E0.8 | Une transition interdite est refusée ; chaque transition crée une ligne d’historique | M |
| E0.8 | **Matrice des transitions autorisées, rédigée comme spécification**<br>En tant qu’équipe, je veux une matrice écrite des transitions autorisées afin de coder la fonction de transition sans ambiguïté. | PO | S | 0,25 | — | Tous les statuts du workflow sont couverts ; relue par P3 | M |
| E0.9 | **Catalogue de démonstration en CSV : 15 à 20 prestataires**<br>En tant qu’équipe, je veux un catalogue de démonstration réaliste afin de tester sans vrais prestataires. | PO | S | 0,5 | E0.4 | CSV conforme aux types, relu par P3 | M |
| E0.10 | **Seeds : import du catalogue et dossier de Sophie à plusieurs statuts**<br>En tant que développeur, je veux des données de démonstration chargées par make seed afin de travailler sans attendre la chaîne complète. | P3 | S | 0,5 | E0.16, E0.9 | Après make seed, le back-office affiche un dossier à chaque étape clé | M |
| E0.11 | **Connexion du conseiller (Supabase Auth) et protection de /conseiller**<br>En tant que conseiller, je veux me connecter afin de accéder aux dossiers. | P2 | S | 0,2 | E0.3 | Sans connexion, /conseiller redirige vers la page de connexion | M |
| E0.12 | **Fixtures JSON du dashboard (liste, détail, proposition) sur les types partagés**<br>En tant que développeur, je veux des fixtures conformes aux types afin de construire un écran sans attendre le serveur. | P2 | S | 0,25 | E0.4 | Les écrans peuvent s’afficher sans la base ; fixtures conformes aux types | M |
| E0.13 | **Port LlmClient côté serveur, faux client, minimisation des données sensibles**<br>En tant qu’équipe, je veux un port LlmClient et un faux client afin de changer de fournisseur et tester sans payer d’appels. | P4 | S | 0,4 | E0.4 | Un test vérifie qu’aucun nom ni texte libre sensible n’est envoyé au LLM ; les tests utilisent le faux client | M |
| E0.14 | **Serveur fictif de prestations : disponibilité en JSON, échecs simulables**<br>En tant qu’équipe, je veux un serveur fictif qui peut échouer afin de éprouver l’agent sans vrai prestataire. | P1 | S | 0,4 | E0.3 | Le serveur répond en JSON ; un paramètre simule délai dépassé, erreur serveur et indisponibilité ; test automatisé | M |
| E0.15 | **Lancer le script create_issues.py (déjà écrit) et vérifier les issues créées**<br>En tant que PO, je veux créer toutes les issues d’un coup afin de gagner du temps. | PO | S | 0,1 | E0.1 | Le script crée labels, jalons et issues rattachées aux epics | S |

### E1 — Demande client (1,9 j)

*Objectif : Le client décrit son projet et peut le corriger sans compte.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E1.1 | **Déposer une demande**<br>En tant que client, je veux décrire mon voyage (voyageurs et âges, dates, budget, envies, contraintes) et consentir au traitement de mes données afin de que l’agence me réponde avec une proposition adaptée. | P1 | M | 0,9 | E0.3, E0.4, E0.16 | Soumission invalide refusée avec message ; consentement RGPD et mention de l’IA obligatoires ; la demande est enregistrée au statut nouvelle, version 1 ; un visiteur sans compte peut créer mais pas lire | M |
| E1.2 | **Corriger ma demande depuis un lien**<br>En tant que client, je veux corriger ma demande depuis un lien qui préremplit mes réponses afin de répondre à ce que l’agence me demande sans tout ressaisir. | P1 | M | 1 | E1.1 | Jeton à usage unique et expirant ; champs concernés surlignés ; le renvoi crée la version suivante ; alerte « champ inchangé » ; deux boucles maximum | S |

### E2 — Fiche de synthèse IA (2,5 j)

*Objectif : Le conseiller lit une fiche claire au lieu de relire des mails.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E2.1 | **Consulter et corriger la fiche d’un dossier**<br>En tant que conseiller, je veux voir mes dossiers, ouvrir une fiche claire et la corriger après l’entretien afin de gagner du temps sur la lecture des mails. | P2 | L | 1,3 | E0.4, E0.11, E0.12 | Le conseiller connecté voit les dossiers du seed et leur statut ; une fiche en erreur affiche « relancer » ; budget réel, dates fixes et notes enregistrés sans être écrasés par une régénération | M |
| E2.2 | **Obtenir la fiche automatiquement dès qu’une demande arrive**<br>En tant que conseiller, je veux qu’une fiche soit générée dès qu’une demande arrive afin de ne pas la rédiger moi-même. | P4 | L | 1,2 | E0.16, E0.7, E0.13 | Une insertion déclenche la génération ; secret partagé contrôlé ; deux appels simultanés ne créent qu’une fiche ; un échec simulé produit un nouvel essai puis le statut erreur ; JSON validé par un schéma | M |

### E3 — Qualification du client (1,8 j)

*Objectif : Ne pas investir 6 h sur une demande irréaliste, et expliquer au client ce qu'il doit corriger.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E3.1 | **Trier une demande : go, à corriger ou refusée**<br>En tant que conseiller, je veux décider go, à corriger ou refusée afin de ne pas investir 6 h sur une demande irréaliste. | P2 | S | 0,4 | E2.1, E0.7 | La décision est enregistrée et visible dans l’historique | M |
| E3.2 | **Recevoir le lien de rendez-vous après un go**<br>En tant que client, je veux recevoir un lien de rendez-vous après l’accord de l’agence afin de fixer l’entretien sans échanger plusieurs mails. | P4 | M | 0,6 | E3.1 | Un go envoie le mail avec le lien Cal.com ; le port Mailer a un faux Mailer pour les tests | S |
| E3.3 | **Comprendre ce que je dois corriger**<br>En tant que client, je veux comprendre précisément ce que je dois corriger afin de renvoyer une demande réaliste. | P2 | M | 0,8 | E3.1, E3.2, E1.2 | Motifs liés aux champs, mail prérempli relu avant envoi, encart d’explication sur le formulaire | S |

### E4 — Proposition chiffrée (4,55 j)

*Objectif : Un brouillon juste, produit en minutes plutôt qu'en 6 heures.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E4.1 | **Règles de chiffrage rédigées**<br>En tant que développeur, je veux des règles de prix écrites (formule, arrondis, marge, saison, seuil d’un tarif ancien) afin de coder le chiffrage sans deviner. | PO | S | 0,25 | — | Document relu par le développeur du chiffrage ; valeurs par défaut marquées à confirmer | M |
| E4.2 | **Voir un prix exact, contrôlé par le code**<br>En tant que conseiller, je veux que le prix soit calculé et contrôlé par le code (tarifs enfant, saison, marge, capacité, âges, budget) afin de ne jamais voir un prix inventé par l’IA. | P1 | L | 1,4 | E0.4, E4.1 | Les exemples du document de règles donnent le prix attendu ; un tarif absent ou ancien reste « à vérifier » ; capacité, âges, dates et budget contrôlés ; un montant dans le texte généré est refusé | M |
| E4.3 | **Recevoir des prestataires présélectionnés**<br>En tant que conseiller, je veux une présélection de prestataires compatibles avec le groupe afin de ne pas chercher dans le catalogue à la main. | P4 | M | 0,9 | E0.4, E0.13 | Seuls des prestataires du catalogue compatibles (capacité, régimes, niveau physique, saison) sont proposés | M |
| E4.4 | **Obtenir un brouillon de proposition**<br>En tant que conseiller, je veux un brouillon avec un programme sans montant et des lignes afin de ne plus partir d’une page blanche. | P4 | M | 0,9 | E0.13, E4.2 | JSON (prestataires, quantités, texte sans chiffres) ; lignes créées au statut a_verifier ; le total est calculé par le code | M |
| E4.5 | **Voir la proposition, son total et ses alertes**<br>En tant que conseiller, je veux voir les lignes, le total et les alertes d’une proposition afin de la relire avant l’envoi. | P1 | L | 1,1 | E0.3, E0.4, E0.12 | Les lignes du seed s’affichent avec prix catalogue, total et alertes ; depuis une fiche, le conseiller ouvre la proposition | M |

### E5 — Vérification et envoi (1,2 j)

*Objectif : Rien ne part avec un prix non vérifié.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E5.1 | **Confirmer les tarifs et n’envoyer que des prix vérifiés**<br>En tant que conseiller, je veux saisir les tarifs confirmés ligne par ligne et ne pouvoir envoyer que lorsque tout est vérifié afin de ne jamais promettre un prix incertain. | P2 | M | 0,8 | E4.5 | Tarif confirmé saisi avec date et source, total recalculé ; le bouton d’envoi est inactif tant qu’une ligne est à vérifier ; statut envoyee | M |
| E5.2 | **Remplacer une ligne indisponible**<br>En tant que conseiller, je veux remplacer une ligne indisponible sans tout régénérer afin de gagner du temps. | P2 | S | 0,2 | E5.1 | Les autres lignes et leurs tarifs confirmés restent intacts | S |
| E5.3 | **Envoyer la proposition par mail**<br>En tant que conseiller, je veux envoyer la proposition depuis l’outil afin de ne pas recopier à la main. | P2 | S | 0,2 | E5.1, E3.2 | Le mail contient la proposition ; l’envoi est journalisé | S |

### E6 — Suivi et changements (2 j)

*Objectif : Gérer les allers-retours sans tout refaire.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E6.1 | **Répondre à un changement sans perdre la version envoyée**<br>En tant que conseiller, je veux créer une nouvelle version après un changement du client afin de garder la trace de ce qui a été envoyé. | P3 | S | 0,2 | E4.4 | La version envoyée reste intacte (remplacee) ; la nouvelle porte le numéro suivant | M |
| E6.2 | **Voir ce qui a changé entre deux versions**<br>En tant que conseiller, je veux voir les écarts entre deux versions afin de expliquer le changement au client. | P1 | M | 0,8 | E6.1 | Les écarts d’un exemple connu correspondent au calcul manuel ; affichés dans /conseiller | S |
| E6.3 | **Résumer les écarts en mots**<br>En tant que conseiller, je veux un résumé des écarts écrit par l’IA, sans chiffres afin de l’utiliser dans ma réponse au client. | P4 | S | 0,2 | E6.2 | Le texte ne contient aucun montant ; test | S |
| E6.4 | **Être rappelé quand un client ne répond pas**<br>En tant que conseiller, je veux être rappelé à J+3 et J+7 afin de ne pas laisser un dossier s’endormir. | P3 | S | 0,4 | E5.1 | Rappels à J+3 et J+7 ; statut sans_reponse | S |
| E6.5 | **Abandonner un dossier sans réponse**<br>En tant que conseiller, je veux qu’on me propose d’abandonner un dossier à J+14 afin de garder un tableau propre. | P2 | S | 0,4 | E6.4 | Proposition d’abandon à J+14 ; le dossier passe à abandonnee après confirmation du conseiller | C |

### E7 — Clôture et démonstration (3,1 j)

*Objectif : Le parcours complet fonctionne devant le client.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E7.1 | **Enregistrer le dépôt reçu**<br>En tant que conseiller, je veux marquer le dépôt de garantie comme reçu afin de clôturer le dossier. | P2 | S | 0,4 | E5.1 | Un clic passe le dossier à gagnee ; journalisé | M |
| E7.2 | **Envoyer la confirmation au client**<br>En tant que client, je veux recevoir une confirmation de mon dépôt afin de être rassuré. | P2 | S | 0,2 | E7.1, E3.2 | Le mail part au clic ; modèle fixe, aucun texte généré par l’IA | S |
| E7.3 | **Rejouer le cas de Sophie de bout en bout**<br>En tant qu’équipe, je veux rejouer un dossier complet de bout en bout afin de révéler les écarts entre les briques. | P1 | S | 0,4 | E6.1, E7.1 | Le scénario se déroule du formulaire au dépôt sans intervention technique | M |
| E7.4 | **Correctifs d’intégration sur son périmètre**<br>En tant qu’équipe, je veux du temps pour corriger ce que l’intégration révèle afin de livrer un parcours qui tient. | Tous | L | 1,3 | E7.3, E9.4, E8.6 | Aucune anomalie bloquante sur le scénario | M |
| E7.5 | **Passe sécurité : aucune clé dans le dépôt ni le bundle**<br>En tant qu’équipe, je veux vérifier qu’aucune clé ne fuite afin de protéger les accès. | P3 | S | 0,2 | E0.13 | Détection de secrets verte ; revue manuelle du bundle | M |
| E7.6 | **Sprint Review : démonstration du parcours avec note de retours**<br>En tant qu’équipe, je veux démontrer le parcours devant le client afin de recueillir ses retours. | Tous | M | 0,6 | E7.4 | Répétition faite une fois de bout en bout ; retours notés dans docs/rituels/review.md | M |

### E8 — Agent de vérification (3,8 j)

*Objectif : Un agent consulte une source et rend une réponse contrôlable ; le conseiller garde la décision.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E8.1 | **Catalogue de démonstration nantais (week-end créatif sans voiture)**<br>En tant qu’équipe, je veux un catalogue nantais pour la démonstration afin de rejouer le cas des briefs. | PO | S | 0,3 | E0.4 | 10 à 15 prestations avec prix, places et conditions, conformes aux types | M |
| E8.2 | **Contrat d’une page de l’agent**<br>En tant qu’équipe, je veux un contrat d’une page pour l’agent afin de savoir ce qu’il peut faire, ne peut pas faire, et quand il s’arrête. | PO | S | 0,4 | — | Une page relue par le développeur de l’agent : outil unique, permissions, conditions d’arrêt | M |
| E8.3 | **Faire vérifier le prix d’une prestation par un agent**<br>En tant que conseiller, je veux qu’un agent vérifie le prix et les places d’une prestation auprès du serveur afin de décider sur des chiffres frais. | P4 | L | 1,5 | E0.5, E0.13, E0.14, E8.2 | Un appel réel au serveur fictif aboutit à une conclusion (prix, places, conditions) ; un outil non autorisé est refusé par le code ; 3 tours maximum ; serveur en échec : « non vérifié » sans prix ni places ; modèle OpenRouter gratuit testé | M |
| E8.4 | **Voir l’écart de prix et la réponse du serveur**<br>En tant que conseiller, je veux voir le prix revérifié, l’écart avec le prix proposé et la réponse brute afin de décider en connaissance de cause. | P2 | M | 0,7 | E0.5, E0.11, E0.12 | Le conseiller voit le prix revérifié, l’écart avec le prix proposé et la réponse brute du serveur | M |
| E8.5 | **Garder une trace et comparer les faits au JSON du serveur**<br>En tant que relecteur, je veux une trace expurgée de chaque vérification et la comparaison de ses faits au JSON du serveur afin de contrôler l’agent. | P3 | M | 0,7 | E0.5 | La trace d’un essai est relisible, sans clé ni donnée sensible ; un fait faux est détecté, un fait exact est validé | M |
| E8.6 | **Comparer deux essais (une réussite, un échec)**<br>En tant qu’équipe, je veux comparer un essai réussi et un échec observé afin de montrer la limite de l’agent. | P1 | S | 0,2 | E8.3, E8.5 | Deux traces expurgées et un fait comparé au JSON du serveur, dans un document d’une page | M |

### E9 — Option avec accord humain (3,2 j)

*Objectif : Une option de 30 minutes n'est posée qu'après un accord identifiable du conseiller ; la clé d'approbation reste hors du modèle.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E9.1 | **Schéma des permissions : qui peut lire, proposer, poser, confirmer**<br>En tant qu’équipe, je veux un schéma des permissions afin de défendre qui peut faire quoi. | PO | S | 0,3 | E8.2 | Un schéma d’une page ; l’agent n’a aucune permission d’écriture | M |
| E9.2 | **Enregistrer l’accord du conseiller et créer le jeton d’approbation**<br>En tant que conseiller, je veux que mon accord soit enregistré avec un jeton lié à une prestation et à un prix afin de que rien ne soit écrit sans moi. | P3 | M | 0,7 | E0.5, E9.1 | Jeton créé côté serveur, à usage unique, lié à la prestation, au prix et au conseiller ; jamais transmis au modèle ; réutilisé, expiré ou pour une autre prestation : refusé | M |
| E9.3 | **Écran d’accord : prestations, prix revérifié et conditions**<br>En tant que conseiller, je veux voir les prestations, le prix revérifié et les conditions, puis autoriser une écriture précise afin de décider avant toute option. | P2 | M | 0,6 | E0.5, E0.11, E0.12 | Le conseiller autorise une écriture précise (prestation, prix) ; l’accord enregistre le conseiller, la prestation et le prix | M |
| E9.4 | **Poser une option de 30 minutes après accord**<br>En tant que conseiller, je veux qu’une option de 30 minutes soit posée sur la prestation après mon accord afin de la garder pendant que je décide. | P4 | S | 0,5 | E9.2, E0.14 | L’option est posée avec la réponse réelle du serveur ; sans jeton valide, rien n’est écrit ; elle expire après 30 minutes | M |
| E9.5 | **Seconde validation avant confirmation**<br>En tant que conseiller, je veux une seconde validation distincte avant toute confirmation afin de éviter une confirmation par erreur. | P2 | S | 0,4 | E9.4 | Sans seconde validation distincte, aucune confirmation n’est possible ; nouveau prix revérifié si l’option a expiré | S |
| E9.6 | **Garantir que l’agent ne peut rien écrire**<br>En tant qu’équipe, je veux des tests qui prouvent que l’agent ne peut rien écrire afin de défendre la frontière d’action. | P3 | S | 0,4 | E8.3, E9.4 | L’agent ne peut ni poser une option, ni confirmer, ni annuler ; le modèle ne voit jamais la clé ; tests automatisés | M |
| E9.7 | **Note d’une page : un échec observé, la décision humaine, le choix de conception révisé**<br>En tant qu’équipe, je veux une note sur un échec observé et le choix de conception révisé afin de démontrer ce qu’on a appris. | PO | S | 0,3 | E8.6, E9.6 | Une page relue par l’équipe | M |

### E10 — Méthode et rituels (0,3 j)

*Objectif : L'équipe applique Scrum de façon visible : objectif de sprint, rituels écrits, Definition of Done.*

| ID | Issue | Resp. | Estim. | Charge | Dépend | Résultat vérifiable | Prio |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| E10.1 | **Sprint Goal et Definition of Done écrits dans le dépôt (docs/rituels/)**<br>En tant qu’équipe, je veux un objectif de sprint et une définition de terminé écrits afin de savoir quand on a fini. | PO | S | 0,2 | E0.1 | Les deux fichiers sont dans le dépôt et relus par l’équipe au planning | M |
| E10.2 | **Modèle de daily, rota des Scrum Masters, modèles de review et de rétrospective**<br>En tant qu’équipe, je veux des modèles de rituels et une rota de Scrum Master afin de tenir les rituels sans y perdre de temps. | PO | S | 0,1 | E0.1 | Les modèles sont dans docs/rituels/ ; la rota couvre chaque jour du sprint | M |
| E10.3 | **Sprint Planning : estimation par l’équipe et engagement sur le Sprint Goal (temps pris sur les 20 % non productifs)**<br>En tant que développeur, je veux estimer moi-même mes issues et m’engager sur le Sprint Goal afin de tenir un plan qui est le mien. | Tous | S | 0 | E10.1 | Estimations confirmées ou corrigées par les développeurs ; Sprint Goal accepté | M |
| E10.4 | **Daily écrit chaque jour : 5 lignes par le Scrum Master du jour (temps pris sur les 20 % non productifs)**<br>En tant qu’équipe, je veux une note de daily de cinq lignes chaque jour afin de garder la trace des blocages et passer le relais. | Tous | S | 0 | E10.2 | Un fichier docs/rituels/daily/Jx.md par jour : avancement, blocages, limite de travail en cours | M |
| E10.5 | **Rétrospective écrite en fin de sprint : à garder, à arrêter, une action (temps pris sur les 20 % non productifs)**<br>En tant qu’équipe, je veux une rétrospective écrite afin de améliorer la façon de travailler. | Tous | S | 0 | E7.4 | docs/rituels/retrospective.md complété, avec une action et son responsable | M |

### Scénarios Gherkin des stories clés

**E1.1 — Déposer une demande**

```gherkin
Scénario : consentement obligatoire
  Étant donné un formulaire rempli sans consentement
  Quand le client envoie la demande
  Alors la demande est refusée et rien n’est enregistré
```

**E2.2 — Obtenir la fiche automatiquement dès qu’une demande arrive**

```gherkin
Scénario : aucune donnée sensible vers le modèle
  Étant donné une demande avec un régime et un nom
  Quand la fiche est générée
  Alors le modèle ne reçoit que la catégorie du régime, jamais le nom ni le texte libre
```

**E4.2 — Voir un prix exact, contrôlé par le code**

```gherkin
Scénario : tarif ancien
  Étant donné un prestataire dont le tarif dépasse le seuil d’ancienneté
  Quand le prix est calculé
  Alors la ligne est « à vérifier » et aucun montant n’est estimé
```

**E5.1 — Confirmer les tarifs et n’envoyer que des prix vérifiés**

```gherkin
Scénario : envoi bloqué
  Étant donné une proposition avec une ligne « à vérifier »
  Quand le conseiller clique sur « Envoyer »
  Alors l’envoi est refusé et le statut ne change pas
```

**E6.1 — Répondre à un changement sans perdre la version envoyée**

```gherkin
Scénario : version envoyée intacte
  Étant donné une proposition envoyée en version 1
  Quand le client demande un changement
  Alors la version 2 est créée et la version 1 reste inchangée
```

**E8.3 — Faire vérifier le prix d’une prestation par un agent**

```gherkin
Scénario : serveur en échec
  Étant donné un serveur de prestations qui répond par une erreur
  Quand l’agent conclut sa vérification
  Alors la réponse est « non vérifié », sans prix ni nombre de places

Scénario : outil non autorisé
  Étant donné un modèle qui demande de poser une option
  Quand le code valide l’appel
  Alors l’appel est refusé et la tentative est tracée
```

**E8.5 — Garder une trace et comparer les faits au JSON du serveur**

```gherkin
Scénario : fait faux détecté
  Étant donné une conclusion qui annonce 4 places alors que le serveur en annonce 2
  Quand les faits sont comparés au JSON du serveur
  Alors l’écart est signalé
```

**E9.2 — Enregistrer l’accord du conseiller et créer le jeton d’approbation**

```gherkin
Scénario : jeton à usage unique
  Étant donné un jeton déjà utilisé pour une option
  Quand il est présenté une seconde fois
  Alors l’option est refusée
```

**E9.4 — Poser une option de 30 minutes après accord**

```gherkin
Scénario : option sans accord
  Étant donné une prestation vérifiée par l’agent
  Quand une option est demandée sans jeton d’approbation valide
  Alors rien n’est écrit et la tentative est tracée
```

**E9.6 — Garantir que l’agent ne peut rien écrire**

```gherkin
Scénario : l’agent ne peut rien écrire
  Étant donné un agent avec le seul outil de vérification
  Quand il tente de poser, de confirmer ou d’annuler
  Alors le code refuse et la tentative est tracée
```

---

## 8. Planning J1 à J7

**Sprint Goal :** Un conseiller obtient une proposition chiffrée dont un prix est vérifié par l’agent, puis une option de 30 minutes posée seulement après son accord.

Chaque issue a un jour cible : le jour où elle doit être terminée. Les Should et les Could sont hors sprint (jalon « Hors sprint »).

### J1 — Cadrage

Cadrer et démarrer : Sprint Planning d’une heure, estimations par l’équipe. **Objectif : dépôt, squelette Next.js, connexion du conseiller ; le PO livre le catalogue, le contrat de l'agent et la matrice des transitions.**

- **P3** : E0.1
- **PO** : E0.8, E0.9, E4.1, E8.1, E8.2, E9.1, E9.7, E10.1, E10.2

### J2 — Socle

**Objectif : types figés, migrations, Docker (`make up`), chiffrage lancé.**

- **P1** : E0.3, E0.14
- **P2** : E0.11, E0.12
- **P3** : E0.4, E0.16
- **P4** : E0.13

### J3 — De la demande à la fiche

**Objectif : fonction de transition, CI, liste des dossiers, port LLM avec outils.**

- **P1** : E0.2
- **P3** : E0.5
- **P4** : E4.3

### J4 — Qualification et présélection

**Objectif : formulaire, endpoint de la fiche, tri du dossier, seeds.**

- **P2** : E0.6, E2.1
- **P3** : E9.2

### J5 — Proposition chiffrée

**Objectif : une demande produit une fiche de bout en bout ; présélection, écran de proposition, serveur fictif.**

- **P1** : E4.2
- **P2** : E8.4
- **P3** : E0.7
- **P4** : E8.3

### J6 — Vérification, envoi, changements

**Objectif : contrôles du domain, saisie des tarifs, envoi bloqué, tables des options.**

- **P1** : E4.5
- **P2** : E9.3
- **P3** : E0.10, E8.5
- **P4** : E9.4

### J7 — Clôture et démonstration

**Objectif : boucle d'agent, échec géré, trace, dépôt reçu.** Si le sprint dure 7 jours, gel des fonctionnalités à midi. Sprint Review, puis rétrospective.

- **P1** : E1.1, E8.6
- **P2** : E5.1
- **P3** : E6.1, E7.5, E9.6
- **P4** : E4.4
- **Tous** : E10.3, E10.4

### J8 — Débordement

Débordement : écran de vérification, accord du conseiller, option, comparaison des faits.

- **P1** : E7.3
- **P2** : E3.1, E7.1
- **P4** : E2.2

### J9 — Débordement

Débordement : correctifs d'intégration.

- **Tous** : E7.4, E7.6, E10.5

### Hors sprint

Should : E0.15, E1.2, E3.2, E3.3, E5.2, E5.3, E6.2, E6.3, E6.4, E7.2, E9.5. Could : E6.5.

**Estimation de fin des Must :** environ **8,6 jours** en tenant compte des dépendances et de 80 % de temps productif, soit environ 1,6 jour(s) de plus que les 7 jours prévus. Leviers : prévoir 9 jours, ou sortir du Must des issues moins utiles à la démonstration (E9.6, E8.6, E6.1, E0.10) et réduire les correctifs (E7.4). Les jours cibles ci-dessous suivent un ordre logique (squelette de bout en bout tôt, agent ensuite) : ils sont indicatifs. Les tâches du PO (E0.8, E0.9, E4.1, E8.1, E8.2, E9.1, E9.7, E10.1, E10.2) sont supposées livrées à temps.

**Chemin critique :** E0.1, E0.4, E0.16, E0.5, E8.3, E8.6, E7.4, E7.6. À elle seule, cette chaîne représente environ 5,59 jours. Le chiffrage (E4.2) ne dépend que des types : P1 le démarre dès le J2 avec des données fictives.

**Si le retard se creuse**, première issue à sortir du Must : E6.1 (nouvelle version). Le MVP prouverait alors le parcours d'une première proposition, sans la boucle de versions.

---

## 9. Configuration GitHub Projects

**Colonnes :** `Backlog` → `Prêt` → `En cours` → `En revue` → `Terminé`.

- **Prêt** : dépendances levées, contrat connu, responsable assigné.
- **En cours** : une seule par personne idéalement (limite WIP = 2).
- **En revue** : PR ouverte, liée à l'issue.
- **Terminé** : PR fusionnée, résultat vérifiable constaté.

| Champ | Type | Valeurs |
| --- | --- | --- |
| Epic | Single select | E0 à E7 |
| Priorité | Single select | Must, Should, Could |
| Estimation | Single select | S, M, L |
| Jour cible | Single select | J1 à J7, Hors sprint |
| Responsable | Assignee | P1 à P4, PO |

**Labels :** `epic:E0` à `epic:E7` · `ws:formulaire` `ws:backoffice` `ws:donnees` `ws:ia` `ws:po` `ws:equipe` · `type:feat` `type:test` `type:docs` `type:infra` · `prio:must` `prio:should` `prio:could` · `contract` (touche une interface partagée) · `blocked`.

**Jalons :** `J1 — Cadrage` · `J2 — Socle` · `J3 — De la demande à la fiche` · `J4 — Qualification et présélection` · `J5 — Proposition chiffrée` · `J6 — Vérification, envoi, changements` · `J7 — Clôture et démonstration` · `J8 — Débordement` · `J9 — Débordement` · `Hors sprint`.

**Template d'issue**

```markdown
## Contexte
<pourquoi, lien vers l'epic>

## Résultat attendu (Definition of Done)
- [ ] <critère vérifiable>
- [ ] Tests ajoutés ou mis à jour
- [ ] Documentation mise à jour si un contrat est impacté

## Dépendances
Bloquée par : #… · Bloque : #…

## Interface impactée
<types, payload, JSON IA, migration — ou « aucune »>
```

**Template de PR**

```markdown
Closes #<numéro>

## Ce que fait cette PR
…

## Comment vérifier
…

## Checklist
- [ ] CI verte
- [ ] Tests couvrant le changement
- [ ] Aucun secret ni clé
- [ ] Relecteur concerné si label `contract`
```

---

## 10. Tests et CI

| Niveau | Portée | Sans IA réelle |
| --- | --- | --- |
| Unitaire | chiffrage, contrôles du domain, transitions, calcul des écarts | oui |
| Intégration | base Supabase locale avec seeds, règles d'accès, cas d'usage | oui (faux client LLM) |
| Contrat | un JSON IA non conforme est refusé | oui |
| Bout en bout | le cas de Sophie, du formulaire au dépôt | oui |

**Tests bloquants pour la fin de sprint**

- Le chiffrage donne le prix attendu sur les exemples du document de règles ; un tarif absent ou ancien reste « à vérifier ».
- L'envoi est impossible tant qu'une ligne est « à vérifier ».
- Une version envoyée reste intacte après la création de la version suivante.
- Un brouillon avec un montant dans le texte ou un prestataire inventé est refusé.
- Sans compte conseiller, aucune lecture de `demandes` ; le contact des prestataires est réservé.
- Aucune donnée sensible (nom, texte libre de santé ou de régime) n'est envoyée au LLM.
- L'agent ne peut ni poser une option, ni confirmer, ni annuler : l'outil n'existe pas pour lui et le code refuse tout autre appel.
- Un jeton d'approbation réutilisé, expiré ou lié à une autre prestation est refusé ; le modèle n'en reçoit jamais.
- Si le serveur échoue, la conclusion de l'agent ne contient ni prix ni nombre de places.
- Un fait annoncé par l'agent (prix, places) est comparé au JSON du serveur.
- Une transition de statut interdite est refusée et chaque transition est journalisée.

**Pipeline CI (dès le J2, E0.2) :** lint · types · règle de dépendances · tests unitaires et d'intégration · build · détection de secrets. Obligatoire verte pour fusionner. Les appels réels au LLM restent hors CI.

---

## 11. Livrables de fin de sprint

- [ ] Application déployée (formulaire public et back-office) et dépôt GitHub à jour.
- [ ] Tableau GitHub Projects reflétant le travail réel, pas rempli à la fin.
- [ ] `make up`, `make migrate`, `make seed` documentés dans le README ; `.env.example` sans secret.
- [ ] Le cas de Sophie rejouable de bout en bout avec les données de démonstration.
- [ ] Document de règles de chiffrage et contrats IA à jour.
- [ ] Cas de Sophie déroulé devant le client.
- [ ] Sprint Goal, Definition of Done, dailies, review et rétrospective écrits dans `docs/rituels/`.
- [ ] Contrat d'une page de l'agent, schéma des permissions, note sur un échec observé et le choix de conception révisé.
- [ ] Deux traces expurgées (une réussite, un échec) et un fait comparé au JSON du serveur.
- [ ] Option posée avec la réponse réelle du serveur fictif, après un accord identifiable du conseiller.
- [ ] Liste des limites connues : Should et Could non livrés, phase 2.

---

## 12. Risques et parades

| Risque | Impact | Parade |
| --- | --- | --- |
| Capacité : les Must remplissent la capacité, sans marge | Le MVP déborde de quelques heures | Geler le périmètre ; sortir E6.1 en premier si le retard se creuse ; refaire les estimations avec l'équipe |
| Modèle gratuit qui n'appelle pas d'outils ou limité en débit | Agent inutilisable en démonstration | Choisir et tester le modèle dès le J1 ; garder le faux client pour les tests ; prévoir un second modèle |
| Écriture involontaire par l'agent | Option ou confirmation non voulue | Aucun outil d'écriture exposé ; écriture seulement avec un jeton créé après l'accord du conseiller ; tests de non-écriture (E9.6) |
| Serveur fictif trop simple | Échecs non éprouvés | Délai dépassé, erreur serveur et indisponibilité simulables dès E0.14 |
| Estimations optimistes liées à l'IA | Retard sur les Must | Mesurer la vitesse réelle après deux jours et recaler le plan |
| Rituels abandonnés en cours de sprint | Pas de trace de la méthode | Scrum Master du jour qui écrit la note ; daily de 15 minutes ; issues E10.x dans le tableau |
| Types et énumérations qui bougent | Blocage entre les quatre développeurs | Les figer le J1 ; toute évolution par PR `contract` |
| Timeouts des fonctions Vercel sur les appels LLM | Fiche non écrite, erreur côté appelant | Appels asynchrones, statut visible, `maxDuration`, bouton « relancer », réponses JSON courtes |
| Données sensibles envoyées à un LLM américain | Non-conformité RGPD | Catégories seules, jamais d'identité ; option Mistral ; consentement et mention de l'IA dans le formulaire |
| Incohérence entre texte généré et prix | Proposition fausse | Le LLM ne produit aucun montant ; le code calcule ; contrôle automatique du texte |
| Catalogue de démonstration incomplet ou périmé | Brouillons faux ou vides | Seed de 15 à 20 prestataires avec date de mise à jour ; tarif ancien = « à vérifier » |
| Valeurs métier manquantes (marge, budget plancher, seuil d'un tarif ancien, tranches d'âge) | Règles de chiffrage bloquées | Valeurs par défaut marquées « à confirmer » ; questions au client avant le J1 |
| Stack inconnue de l'équipe (Next.js, Supabase) | Retard général | Vérifier avant le J1 ; sinon une stack déjà maîtrisée |
| Intégration en fin de sprint | Rendu cassé | Fusion sur `main` au moins deux fois par jour ; squelette de bout en bout dès le J3 |

**Points encore ouverts :** le formulaire remplace-t-il les 3 à 4 mails de cadrage (à confirmer avec le client) ; fournisseur LLM (position du client sur le RGPD) ; fournisseur de mails (Resend ou Brevo) ; rôle administrateur ; les deux briefs sont-ils le cœur du livrable (traités ici comme Must) ; nombre maximum de boucles de correction (2 proposé) ; harmonisation des noms avec ou sans accent.

---

## 13. Annexe — données pour le script de création des issues

Une ligne par issue, séparateur `|` : `ID|Titre|labels|jalon|responsable|charge en jours|dépend de|user story|scénarios` (les retours à la ligne des scénarios sont écrits `\n`). Le script (E0.15) crée d'abord les labels et les jalons, puis les issues, avec `gh` authentifié ou l'API GitHub. Adapter `OWNER/REPO`.

```text
ID|Titre|labels|jalon|responsable|charge|depend|story|gherkin
E0.1|Dépôt, protection de branche, CODEOWNERS, templates|epic:E0,ws:donnees,type:infra,prio:must|J1 — Cadrage|P3|0.4||En tant qu’équipe, je veux un dépôt protégé avec des propriétaires par dossier afin de relire ce qui touche chacun.|
E0.2|CI et déploiement continu (lint, types, tests, build, secrets, Vercel)|epic:E0,ws:formulaire,type:infra,prio:must|J3 — De la demande à la fiche|P1|0.4|E0.1|En tant qu’équipe, je veux une CI et un déploiement automatiques afin de voir la même version et ne jamais fusionner une PR cassée.|
E0.3|Docker Compose, Makefile, .env.example et squelette Next.js|epic:E0,ws:formulaire,type:infra,prio:must|J2 — Socle|P1|0.7|E0.1|En tant que développeur, je veux lancer l’application avec make up afin de travailler dans le même environnement.|
E0.4|Types et énumérations figés dans /types (9 tables, annexe d’énumérations)|epic:E0,ws:donnees,type:docs,prio:must|J2 — Socle|P3|0.5|E0.1|En tant qu’équipe, je veux des types et des énumérations figés afin de que les briques s’accordent et avancent en parallèle avec des fixtures.|
E0.16|Migrations des 7 tables du noyau : clés étrangères, unicité d’une fiche par version|epic:E0,ws:donnees,type:feat,prio:must|J2 — Socle|P3|0.7|E0.4|En tant qu’équipe, je veux des tables créées par des migrations versionnées afin de que chacun ait la même base.|
E0.5|Tables de l’agent : migrations de verifications et options (accès)|epic:E0,ws:donnees,type:feat,prio:must|J3 — De la demande à la fiche|P3|0.7|E0.16|En tant qu’équipe, je veux les tables des vérifications et des options afin de que l’agent et l’accord humain laissent des traces séparées.|
E0.6|Règles d’accès par ligne (RLS) selon la matrice rôles par table|epic:E0,ws:backoffice,type:feat,prio:must|J4 — Qualification et présélection|P2|0.5|E0.16|En tant que direction, je veux que seuls les conseillers lisent les dossiers afin de protéger les données des voyageurs.|
E0.7|Fonction de transition de statut : statut et historique_dossier écrits ensemble|epic:E0,ws:donnees,type:feat,prio:must|J5 — Proposition chiffrée|P3|0.4|E0.16,E0.8|En tant que conseiller, je veux retrouver chaque changement de statut d’un dossier afin de retracer ce qui s’est passé.|
E0.8|Matrice des transitions autorisées, rédigée comme spécification|epic:E0,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.25||En tant qu’équipe, je veux une matrice écrite des transitions autorisées afin de coder la fonction de transition sans ambiguïté.|
E0.9|Catalogue de démonstration en CSV : 15 à 20 prestataires|epic:E0,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.5|E0.4|En tant qu’équipe, je veux un catalogue de démonstration réaliste afin de tester sans vrais prestataires.|
E0.10|Seeds : import du catalogue et dossier de Sophie à plusieurs statuts|epic:E0,ws:donnees,type:feat,prio:must|J6 — Vérification, envoi, changements|P3|0.5|E0.16,E0.9|En tant que développeur, je veux des données de démonstration chargées par make seed afin de travailler sans attendre la chaîne complète.|
E0.11|Connexion du conseiller (Supabase Auth) et protection de /conseiller|epic:E0,ws:backoffice,type:feat,prio:must|J2 — Socle|P2|0.2|E0.3|En tant que conseiller, je veux me connecter afin de accéder aux dossiers.|
E0.12|Fixtures JSON du dashboard (liste, détail, proposition) sur les types partagés|epic:E0,ws:backoffice,type:docs,prio:must|J2 — Socle|P2|0.25|E0.4|En tant que développeur, je veux des fixtures conformes aux types afin de construire un écran sans attendre le serveur.|
E0.13|Port LlmClient côté serveur, faux client, minimisation des données sensibles|epic:E0,ws:ia,type:feat,prio:must|J2 — Socle|P4|0.4|E0.4|En tant qu’équipe, je veux un port LlmClient et un faux client afin de changer de fournisseur et tester sans payer d’appels.|
E0.14|Serveur fictif de prestations : disponibilité en JSON, échecs simulables|epic:E0,ws:formulaire,type:feat,prio:must|J2 — Socle|P1|0.4|E0.3|En tant qu’équipe, je veux un serveur fictif qui peut échouer afin de éprouver l’agent sans vrai prestataire.|
E0.15|Lancer le script create_issues.py (déjà écrit) et vérifier les issues créées|epic:E0,ws:po,type:infra,prio:should|Hors sprint|PO|0.1|E0.1|En tant que PO, je veux créer toutes les issues d’un coup afin de gagner du temps.|
E1.1|Déposer une demande|epic:E1,ws:formulaire,type:feat,prio:must|J7 — Clôture et démonstration|P1|0.9|E0.3,E0.4,E0.16|En tant que client, je veux décrire mon voyage (voyageurs et âges, dates, budget, envies, contraintes) et consentir au traitement de mes données afin de que l’agence me réponde avec une proposition adaptée.|Scénario : consentement obligatoire\n  Étant donné un formulaire rempli sans consentement\n  Quand le client envoie la demande\n  Alors la demande est refusée et rien n’est enregistré
E1.2|Corriger ma demande depuis un lien|epic:E1,ws:formulaire,type:feat,prio:should|Hors sprint|P1|1|E1.1|En tant que client, je veux corriger ma demande depuis un lien qui préremplit mes réponses afin de répondre à ce que l’agence me demande sans tout ressaisir.|
E2.1|Consulter et corriger la fiche d’un dossier|epic:E2,ws:backoffice,type:feat,prio:must|J4 — Qualification et présélection|P2|1.3|E0.4,E0.11,E0.12|En tant que conseiller, je veux voir mes dossiers, ouvrir une fiche claire et la corriger après l’entretien afin de gagner du temps sur la lecture des mails.|
E2.2|Obtenir la fiche automatiquement dès qu’une demande arrive|epic:E2,ws:ia,type:feat,prio:must|J8 — Débordement|P4|1.2|E0.16,E0.7,E0.13|En tant que conseiller, je veux qu’une fiche soit générée dès qu’une demande arrive afin de ne pas la rédiger moi-même.|Scénario : aucune donnée sensible vers le modèle\n  Étant donné une demande avec un régime et un nom\n  Quand la fiche est générée\n  Alors le modèle ne reçoit que la catégorie du régime, jamais le nom ni le texte libre
E3.1|Trier une demande : go, à corriger ou refusée|epic:E3,ws:backoffice,type:feat,prio:must|J8 — Débordement|P2|0.4|E2.1,E0.7|En tant que conseiller, je veux décider go, à corriger ou refusée afin de ne pas investir 6 h sur une demande irréaliste.|
E3.2|Recevoir le lien de rendez-vous après un go|epic:E3,ws:ia,type:feat,prio:should|Hors sprint|P4|0.6|E3.1|En tant que client, je veux recevoir un lien de rendez-vous après l’accord de l’agence afin de fixer l’entretien sans échanger plusieurs mails.|
E3.3|Comprendre ce que je dois corriger|epic:E3,ws:backoffice,type:feat,prio:should|Hors sprint|P2|0.8|E3.1,E3.2,E1.2|En tant que client, je veux comprendre précisément ce que je dois corriger afin de renvoyer une demande réaliste.|
E4.1|Règles de chiffrage rédigées|epic:E4,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.25||En tant que développeur, je veux des règles de prix écrites (formule, arrondis, marge, saison, seuil d’un tarif ancien) afin de coder le chiffrage sans deviner.|
E4.2|Voir un prix exact, contrôlé par le code|epic:E4,ws:formulaire,type:feat,prio:must|J5 — Proposition chiffrée|P1|1.4|E0.4,E4.1|En tant que conseiller, je veux que le prix soit calculé et contrôlé par le code (tarifs enfant, saison, marge, capacité, âges, budget) afin de ne jamais voir un prix inventé par l’IA.|Scénario : tarif ancien\n  Étant donné un prestataire dont le tarif dépasse le seuil d’ancienneté\n  Quand le prix est calculé\n  Alors la ligne est « à vérifier » et aucun montant n’est estimé
E4.3|Recevoir des prestataires présélectionnés|epic:E4,ws:ia,type:feat,prio:must|J3 — De la demande à la fiche|P4|0.9|E0.4,E0.13|En tant que conseiller, je veux une présélection de prestataires compatibles avec le groupe afin de ne pas chercher dans le catalogue à la main.|
E4.4|Obtenir un brouillon de proposition|epic:E4,ws:ia,type:feat,prio:must|J7 — Clôture et démonstration|P4|0.9|E0.13,E4.2|En tant que conseiller, je veux un brouillon avec un programme sans montant et des lignes afin de ne plus partir d’une page blanche.|
E4.5|Voir la proposition, son total et ses alertes|epic:E4,ws:formulaire,type:feat,prio:must|J6 — Vérification, envoi, changements|P1|1.1|E0.3,E0.4,E0.12|En tant que conseiller, je veux voir les lignes, le total et les alertes d’une proposition afin de la relire avant l’envoi.|
E5.1|Confirmer les tarifs et n’envoyer que des prix vérifiés|epic:E5,ws:backoffice,type:feat,prio:must|J7 — Clôture et démonstration|P2|0.8|E4.5|En tant que conseiller, je veux saisir les tarifs confirmés ligne par ligne et ne pouvoir envoyer que lorsque tout est vérifié afin de ne jamais promettre un prix incertain.|Scénario : envoi bloqué\n  Étant donné une proposition avec une ligne « à vérifier »\n  Quand le conseiller clique sur « Envoyer »\n  Alors l’envoi est refusé et le statut ne change pas
E5.2|Remplacer une ligne indisponible|epic:E5,ws:backoffice,type:feat,prio:should|Hors sprint|P2|0.2|E5.1|En tant que conseiller, je veux remplacer une ligne indisponible sans tout régénérer afin de gagner du temps.|
E5.3|Envoyer la proposition par mail|epic:E5,ws:backoffice,type:feat,prio:should|Hors sprint|P2|0.2|E5.1,E3.2|En tant que conseiller, je veux envoyer la proposition depuis l’outil afin de ne pas recopier à la main.|
E6.1|Répondre à un changement sans perdre la version envoyée|epic:E6,ws:donnees,type:feat,prio:must|J7 — Clôture et démonstration|P3|0.2|E4.4|En tant que conseiller, je veux créer une nouvelle version après un changement du client afin de garder la trace de ce qui a été envoyé.|Scénario : version envoyée intacte\n  Étant donné une proposition envoyée en version 1\n  Quand le client demande un changement\n  Alors la version 2 est créée et la version 1 reste inchangée
E6.2|Voir ce qui a changé entre deux versions|epic:E6,ws:formulaire,type:feat,prio:should|Hors sprint|P1|0.8|E6.1|En tant que conseiller, je veux voir les écarts entre deux versions afin de expliquer le changement au client.|
E6.3|Résumer les écarts en mots|epic:E6,ws:ia,type:feat,prio:should|Hors sprint|P4|0.2|E6.2|En tant que conseiller, je veux un résumé des écarts écrit par l’IA, sans chiffres afin de l’utiliser dans ma réponse au client.|
E6.4|Être rappelé quand un client ne répond pas|epic:E6,ws:donnees,type:feat,prio:should|Hors sprint|P3|0.4|E5.1|En tant que conseiller, je veux être rappelé à J+3 et J+7 afin de ne pas laisser un dossier s’endormir.|
E6.5|Abandonner un dossier sans réponse|epic:E6,ws:backoffice,type:feat,prio:could|Hors sprint|P2|0.4|E6.4|En tant que conseiller, je veux qu’on me propose d’abandonner un dossier à J+14 afin de garder un tableau propre.|
E7.1|Enregistrer le dépôt reçu|epic:E7,ws:backoffice,type:feat,prio:must|J8 — Débordement|P2|0.4|E5.1|En tant que conseiller, je veux marquer le dépôt de garantie comme reçu afin de clôturer le dossier.|
E7.2|Envoyer la confirmation au client|epic:E7,ws:backoffice,type:feat,prio:should|Hors sprint|P2|0.2|E7.1,E3.2|En tant que client, je veux recevoir une confirmation de mon dépôt afin de être rassuré.|
E7.3|Rejouer le cas de Sophie de bout en bout|epic:E7,ws:formulaire,type:test,prio:must|J8 — Débordement|P1|0.4|E6.1,E7.1|En tant qu’équipe, je veux rejouer un dossier complet de bout en bout afin de révéler les écarts entre les briques.|
E7.4|Correctifs d’intégration sur son périmètre|epic:E7,ws:equipe,type:feat,prio:must|J9 — Débordement|Tous|1.3|E7.3,E9.4,E8.6|En tant qu’équipe, je veux du temps pour corriger ce que l’intégration révèle afin de livrer un parcours qui tient.|
E7.5|Passe sécurité : aucune clé dans le dépôt ni le bundle|epic:E7,ws:donnees,type:test,prio:must|J7 — Clôture et démonstration|P3|0.2|E0.13|En tant qu’équipe, je veux vérifier qu’aucune clé ne fuite afin de protéger les accès.|
E7.6|Sprint Review : démonstration du parcours avec note de retours|epic:E7,ws:equipe,type:docs,prio:must|J9 — Débordement|Tous|0.6|E7.4|En tant qu’équipe, je veux démontrer le parcours devant le client afin de recueillir ses retours.|
E8.1|Catalogue de démonstration nantais (week-end créatif sans voiture)|epic:E8,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.3|E0.4|En tant qu’équipe, je veux un catalogue nantais pour la démonstration afin de rejouer le cas des briefs.|
E8.2|Contrat d’une page de l’agent|epic:E8,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.4||En tant qu’équipe, je veux un contrat d’une page pour l’agent afin de savoir ce qu’il peut faire, ne peut pas faire, et quand il s’arrête.|
E8.3|Faire vérifier le prix d’une prestation par un agent|epic:E8,ws:ia,type:feat,prio:must|J5 — Proposition chiffrée|P4|1.5|E0.5,E0.13,E0.14,E8.2|En tant que conseiller, je veux qu’un agent vérifie le prix et les places d’une prestation auprès du serveur afin de décider sur des chiffres frais.|Scénario : serveur en échec\n  Étant donné un serveur de prestations qui répond par une erreur\n  Quand l’agent conclut sa vérification\n  Alors la réponse est « non vérifié », sans prix ni nombre de places\n\nScénario : outil non autorisé\n  Étant donné un modèle qui demande de poser une option\n  Quand le code valide l’appel\n  Alors l’appel est refusé et la tentative est tracée
E8.4|Voir l’écart de prix et la réponse du serveur|epic:E8,ws:backoffice,type:feat,prio:must|J5 — Proposition chiffrée|P2|0.7|E0.5,E0.11,E0.12|En tant que conseiller, je veux voir le prix revérifié, l’écart avec le prix proposé et la réponse brute afin de décider en connaissance de cause.|
E8.5|Garder une trace et comparer les faits au JSON du serveur|epic:E8,ws:donnees,type:feat,prio:must|J6 — Vérification, envoi, changements|P3|0.7|E0.5|En tant que relecteur, je veux une trace expurgée de chaque vérification et la comparaison de ses faits au JSON du serveur afin de contrôler l’agent.|Scénario : fait faux détecté\n  Étant donné une conclusion qui annonce 4 places alors que le serveur en annonce 2\n  Quand les faits sont comparés au JSON du serveur\n  Alors l’écart est signalé
E8.6|Comparer deux essais (une réussite, un échec)|epic:E8,ws:formulaire,type:test,prio:must|J7 — Clôture et démonstration|P1|0.2|E8.3,E8.5|En tant qu’équipe, je veux comparer un essai réussi et un échec observé afin de montrer la limite de l’agent.|
E9.1|Schéma des permissions : qui peut lire, proposer, poser, confirmer|epic:E9,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.3|E8.2|En tant qu’équipe, je veux un schéma des permissions afin de défendre qui peut faire quoi.|
E9.2|Enregistrer l’accord du conseiller et créer le jeton d’approbation|epic:E9,ws:donnees,type:feat,prio:must|J4 — Qualification et présélection|P3|0.7|E0.5,E9.1|En tant que conseiller, je veux que mon accord soit enregistré avec un jeton lié à une prestation et à un prix afin de que rien ne soit écrit sans moi.|Scénario : jeton à usage unique\n  Étant donné un jeton déjà utilisé pour une option\n  Quand il est présenté une seconde fois\n  Alors l’option est refusée
E9.3|Écran d’accord : prestations, prix revérifié et conditions|epic:E9,ws:backoffice,type:feat,prio:must|J6 — Vérification, envoi, changements|P2|0.6|E0.5,E0.11,E0.12|En tant que conseiller, je veux voir les prestations, le prix revérifié et les conditions, puis autoriser une écriture précise afin de décider avant toute option.|
E9.4|Poser une option de 30 minutes après accord|epic:E9,ws:ia,type:feat,prio:must|J6 — Vérification, envoi, changements|P4|0.5|E9.2,E0.14|En tant que conseiller, je veux qu’une option de 30 minutes soit posée sur la prestation après mon accord afin de la garder pendant que je décide.|Scénario : option sans accord\n  Étant donné une prestation vérifiée par l’agent\n  Quand une option est demandée sans jeton d’approbation valide\n  Alors rien n’est écrit et la tentative est tracée
E9.5|Seconde validation avant confirmation|epic:E9,ws:backoffice,type:feat,prio:should|Hors sprint|P2|0.4|E9.4|En tant que conseiller, je veux une seconde validation distincte avant toute confirmation afin de éviter une confirmation par erreur.|
E9.6|Garantir que l’agent ne peut rien écrire|epic:E9,ws:donnees,type:test,prio:must|J7 — Clôture et démonstration|P3|0.4|E8.3,E9.4|En tant qu’équipe, je veux des tests qui prouvent que l’agent ne peut rien écrire afin de défendre la frontière d’action.|Scénario : l’agent ne peut rien écrire\n  Étant donné un agent avec le seul outil de vérification\n  Quand il tente de poser, de confirmer ou d’annuler\n  Alors le code refuse et la tentative est tracée
E9.7|Note d’une page : un échec observé, la décision humaine, le choix de conception révisé|epic:E9,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.3|E8.6,E9.6|En tant qu’équipe, je veux une note sur un échec observé et le choix de conception révisé afin de démontrer ce qu’on a appris.|
E10.1|Sprint Goal et Definition of Done écrits dans le dépôt (docs/rituels/)|epic:E10,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.2|E0.1|En tant qu’équipe, je veux un objectif de sprint et une définition de terminé écrits afin de savoir quand on a fini.|
E10.2|Modèle de daily, rota des Scrum Masters, modèles de review et de rétrospective|epic:E10,ws:po,type:docs,prio:must|J1 — Cadrage|PO|0.1|E0.1|En tant qu’équipe, je veux des modèles de rituels et une rota de Scrum Master afin de tenir les rituels sans y perdre de temps.|
E10.3|Sprint Planning : estimation par l’équipe et engagement sur le Sprint Goal (temps pris sur les 20 % non productifs)|epic:E10,ws:equipe,type:docs,prio:must|J7 — Clôture et démonstration|Tous|0|E10.1|En tant que développeur, je veux estimer moi-même mes issues et m’engager sur le Sprint Goal afin de tenir un plan qui est le mien.|
E10.4|Daily écrit chaque jour : 5 lignes par le Scrum Master du jour (temps pris sur les 20 % non productifs)|epic:E10,ws:equipe,type:docs,prio:must|J7 — Clôture et démonstration|Tous|0|E10.2|En tant qu’équipe, je veux une note de daily de cinq lignes chaque jour afin de garder la trace des blocages et passer le relais.|
E10.5|Rétrospective écrite en fin de sprint : à garder, à arrêter, une action (temps pris sur les 20 % non productifs)|epic:E10,ws:equipe,type:docs,prio:must|J9 — Débordement|Tous|0|E7.4|En tant qu’équipe, je veux une rétrospective écrite afin de améliorer la façon de travailler.|
```

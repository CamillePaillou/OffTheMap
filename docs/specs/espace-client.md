# Espace client : suivre sa demande

**Règle** : le client suit son voyage **sans compte**, avec le numéro de dossier donné à l'envoi de sa demande, comme un colis. Un **compte facultatif** (e-mail et mot de passe, adresse confirmée) lui montre en plus ses demandes, la proposition envoyée et lui permet d'y **répondre en ligne**. Une réponse en ligne ne change aucun statut : le conseiller la lit et l'enregistre (E7.1, E6.1), la matrice des transitions ne change pas.

Base : `supabase/migrations/20261023090000_espace_client.sql`, testée par `supabase/scripts/test_espace_client.sql` (make test-db, CI). Étapes montrées au client : `src/domain/suiviClient.ts`. Lecture : `src/infrastructure/db/espaceClientSupabase.ts`. Écrans : `/suivi`, `/compte/*`, page « Merci » de la demande, page de la proposition du conseiller.

```gherkin
Scénario : suivre sa demande sans compte
  Étant donné Jade, qui a envoyé sa demande et noté le numéro DT-JADE-NANT affiché sur la page « Merci »
  Quand elle saisit « dt jade nant » sur /suivi
  Alors elle voit l'étape « Proposition envoyée » et la date de la dernière mise à jour
  Et ni son nom, ni la destination, ni aucun prix

Scénario : répondre en ligne à la proposition
  Étant donné Jade, inscrite avec l'adresse de sa demande, qu'elle a confirmée par le lien du mail
  Quand elle ouvre sa demande dans « Mon espace » et demande un changement : « Plutôt un hôtel près de la gare »
  Alors sa réponse est enregistrée, une seule fois, et la proposition reste envoyee
  Et le conseiller la voit sur la page de la proposition, puis prépare une nouvelle version (E6.1)

Scénario : un inscrit ne voit pas la demande d'un autre
  Étant donné Tom, qui s'inscrit avec l'adresse d'une demande mais ne la confirme pas
  Alors « Mon espace » ne montre aucune demande et toute réponse est refusée (OT020)
```

## Numéro de dossier

`dossiers.reference` : `DT-` puis deux groupes de 4 caractères tirés au hasard (`generer_reference()`, à partir de `gen_random_uuid()`), dans un alphabet sans 0, O, 1, I ni L, lisible au téléphone. Unique, au format vérifié par la base. Environ 10¹² numéros : un numéro ne se devine pas. Donné au client sur la page « Merci » (lu après `deposer_demande`), avec un lien vers le suivi. Le seed fixe les numéros des dossiers de démonstration (`DT-JADE-NANT` pour la proposition envoyée de Jade, `DT-SEED-…` pour les autres).

La saisie est libre : casse, espaces et tirets (`normaliser_reference`, même règle que `normaliserReference` côté serveur).

## Suivi public (`suivi_public`, ouvert aux visiteurs)

Renvoie le numéro, le statut du dossier, celui de la dernière version de la proposition et la date du dernier événement du journal. **Rien d'autre** : un numéro peut circuler (capture d'écran, mail transféré). Numéro inconnu : rien, sans dire pourquoi.

## Étapes montrées au client (`suiviClient`)

| Étape | Statuts |
| --- | --- |
| Demande reçue | `nouvelle` |
| Étude par un conseiller | `fiche_en_cours`, `fiche_prete`, `erreur`, `validee`, `rdv_propose`, `entretien_fait` |
| Proposition en préparation | `en_proposition` avec une proposition `brouillon_*`, `a_verifier`, `prete`, `changement_demande`, `remplacee`, `erreur` ou pas encore créée |
| Proposition envoyée | proposition `envoyee`, `sans_reponse` |
| Acceptée | proposition `acceptee`, `depot_recu` |
| Réservé | proposition `reservee`, dossier `gagnee` |

Hors ligne : `a_corriger` (« À compléter », le lien de correction est dans le mail du conseiller), `refusee` (« Demande non retenue »), `abandonnee` (« Dossier clos »). Le vocabulaire interne (fiche, IA, brouillon, alerte, erreur) n'apparaît jamais : une fiche en erreur se lit « Étude par un conseiller ».

## Compte client

- **Facultatif** : la demande se fait toujours sans compte ; le formulaire préremplit l'adresse d'un client connecté.
- **Propriété par l'adresse confirmée** : un client voit les dossiers dont une version de la demande porte son adresse, seulement si `auth.users.email_confirmed_at` est posé (`email_client()`, `est_mon_dossier()`). S'inscrire avec l'adresse d'un autre ne donne rien sans accès à sa boîte mail. Un changement d'adresse est confirmé sur l'ancienne et la nouvelle (`double_confirm_changes`).
- **Aucune table ouverte au client** : il passe par `mes_demandes()`, `ma_demande(dossier)` et `repondre_proposition(...)`, en `security definer`, qui contrôlent la propriété. Un dossier d'un autre client se lit comme un dossier inexistant (404).
- **Pages** : `/compte/inscription`, `/compte/connexion`, `/compte/mot-de-passe-oublie`, `/compte/nouveau-mot-de-passe`, `/compte` (mes demandes), `/compte/demandes/[id]`. Le proxy renvoie vers la connexion sans session ; `exigerClient()` refait le contrôle auprès de Supabase Auth.
- **Liens des mails** : `/compte/confirmer` accepte `token_hash` (modèles `supabase/templates/`, le lien marche ouvert sur un autre appareil) ou `code` (PKCE). Il ne redirige que vers une page du compte (`suiteClientSure`). Lien expiré ou déjà servi : retour à la connexion avec un message.
- **Mot de passe** : 8 caractères au moins (`minimum_password_length`, et le même contrôle côté serveur). Mot de passe oublié : lien valable une heure, à usage unique.
- **Pas d'énumération** : inscription, renvoi de confirmation et mot de passe oublié répondent la même chose que l'adresse ait un compte ou non.

## Ce que montre le détail d'une demande

La dernière version **envoyée** de la proposition : programme jour par jour, lignes hors `remplacee`, `indisponible` et `retiree`, chaque prix **avec la date et l'heure de sa vérification**, signée du prénom du conseiller. Une ligne sans prix confirmé et daté (ne devrait pas arriver après E5.1) s'affiche sans montant, et le total n'est alors pas affiché : jamais de prix non vérifié.

## Réponse en ligne (`repondre_proposition`, table `reponses_client`)

| Réponse | Condition | Ce qui s'écrit |
| --- | --- | --- |
| Accepter | case « J'ai lu le programme et les prix » cochée | `reponses_client` (`acceptee`, auteur = le client) |
| Demander un changement | message de 1 à 1000 caractères | `reponses_client` (`changement`, message) |

Refus, rien n'est écrit : proposition pas au client ou adresse non confirmée (`OT020`) ; proposition plus `envoyee` ni `sans_reponse`, ou pas la dernière version (`OT021`) ; une réponse déjà donnée pour cette version (`23505`) ; changement sans message (`23514`). Le statut de la proposition ne bouge pas : sur la page de la proposition, le conseiller voit « Le client accepte en ligne » ou « Le client demande un changement en ligne », puis enregistre avec les panneaux existants. Le client lit « Votre réponse est transmise au conseiller ». Lecture de `reponses_client` : conseiller seulement (RLS).

## Configuration de Supabase Auth

`supabase/config.toml` : `enable_confirmations = true`, `minimum_password_length = 8`, `max_frequency = "60s"` entre deux mails, `additional_redirect_urls` avec `/**`, modèles français `confirmation` et `recovery`. En local, les mails arrivent dans Mailpit : http://localhost:54324. Sur un projet hébergé, reporter les modèles et la liste des adresses de redirection dans le tableau de bord, et brancher un SMTP (la limite par défaut est de 2 mails par heure).

## Limites

- Le numéro n'apparaît pas encore dans les mails du conseiller (E5.4) : le client le retrouve sur la page « Merci » ou dans son espace.
- Une demande faite avec une autre adresse que celle du compte ne s'y rattache pas ; elle se suit avec son numéro.
- Pas de notification au conseiller quand une réponse en ligne arrive : elle s'affiche à l'ouverture de la proposition.

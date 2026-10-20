# Formulaire de demande (E1.1)

Règle : **chaque champ a un usage**. Un champ qui ne sert à rien n'est pas demandé au client. Le test `src/application/deposerDemande.test.ts` vérifie que ce tableau et le schéma `types/demande.ts` listent exactement les mêmes champs.

| Champ | Obligatoire | Où il sert |
| --- | --- | --- |
| `nom` | oui | Identifie le client dans le dossier ; jamais envoyé à l'IA |
| `email` | oui | Le conseiller écrit au client (rendez-vous, proposition, confirmation) ; jamais envoyé à l'IA |
| `destination` | non | Filtre du catalogue pour le brouillon (E4.4) ; vide = « aucune idée », signalé dans la fiche |
| `date_debut`, `date_fin` | oui | Séjour de référence du chiffrage, dates des lignes et des vérifications auprès du simulateur |
| `nb_nuits` | oui | Nuits de référence : nombre de lignes d'hébergement, alerte `nuits_incoherentes` |
| `adultes` | oui (au moins 1) | Nombre de participants envoyé au simulateur ; capacité et alertes |
| `enfants` | non | Participants (même prix qu'un adulte) ; la fiche et le brouillon savent que le groupe compte des enfants |
| `budget_euros` | non | Budget total du groupe, en centimes : alertes `budget_depasse` et `budget_proche` |
| `envies` | non | Matière de la fiche IA, puis du brouillon |
| `contraintes` | non | Fiche IA : ce que le brouillon doit éviter |
| `regimes` | non | Catégories seulement : fiche IA, choix des repas et des activités culinaires |
| `mobilite` | non | Fiche IA : le brouillon et le conseiller écartent les activités inadaptées |
| `consentement_rgpd` | oui | Obligation légale : sans accord, rien n'est enregistré |
| `consentement_ia` | oui | Information sur l'usage de l'IA : sans accord, rien n'est enregistré |

## Retirés du formulaire, et pourquoi

| Champ | Raison |
| --- | --- |
| Téléphone | Le conseiller écrit par e-mail ; aucun code ne l'utilisait |
| Dates flexibles | Le simulateur raisonne à une date précise |
| Budget ferme | Les alertes de budget n'en tenaient pas compte ; le budget réel est fixé à l'entretien |
| Niveau d'effort physique | Déduit des envies par la fiche IA ; le catalogue n'a pas d'activité sportive |
| Précisions de régime et de santé | Données de santé que rien n'exploitait : minimisation RGPD |
| Âges par tranche | Remplacés par adultes et enfants : les enfants paient le prix adulte |

Les colonnes correspondantes sont retirées de `demandes` par `supabase/migrations/20261020090000_formulaire_demande.sql`.

## Correction depuis un lien (E1.2)

Le même formulaire sert à corriger une demande : prérempli avec la version à corriger, champs signalés surlignés, consentements à recocher. Règles : `docs/specs/correction-demande.md`.

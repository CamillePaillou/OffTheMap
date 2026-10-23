# Acceptation du client et dépôt reçu (E7.1)

Cas d'usage : `src/application/reponseClient.ts`. Base : `supabase/migrations/20261020210000_acceptation_depot.sql`. Écran : page de la proposition, panneau sous l'envoi.

| Clic | De | Vers | Garde |
| --- | --- | --- | --- |
| « Enregistrer l'acceptation » | `envoyee` (ou `sans_reponse`) | `acceptee` | case « Le client m'a confirmé son acceptation » ; aucune autre proposition du dossier déjà acceptée |
| « Enregistrer le dépôt reçu » | `acceptee` | `depot_recu` | case « J'ai vérifié la réception du dépôt » |

- Chaque clic passe par `changer_statut` (E0.7) : statut et ligne d'historique au nom du conseiller, ensemble.
- Le dossier est verrouillé pendant l'écriture : **une seule proposition acceptée par dossier** (OT011) ; un double clic ou un statut changé entre-temps est refusé (OT002).
- Une fois le dépôt reçu, le panneau mène à l'écran d'accord pour les options (E9.3) : la réservation commence.
- Prix de l'accord : le plus récent entre la dernière vérification de l'agent et le tarif confirmé de la ligne (prix de l'agent accepté, ou saisi à la main par téléphone, mail ou lien). Une vérification en échec ne compte pas ; « indisponible » plus récent que le tarif bloque (`verification_non_ok`). L'écran d'accord dit d'où vient le prix (« Tarif saisi · téléphone · date »), le journal aussi (`source_prix`). À la pose, si le simulateur annonce un autre prix, l'option est refusée et les deux prix sont affichés. Base : `20261023090000_accord_tarif_saisi.sql` (`options.verification_id` facultatif).
- Le dossier devient **gagné** quand toutes les lignes sont réservées : transition du système `en_proposition → gagnee` (E9.5), pas un clic du conseiller.

Le texte de l'issue #115 (« un clic passe le dossier à gagnée ») date d'avant le plan v6 : ce document suit le plan (« deux clics enregistrent l'acceptation puis le dépôt ; la proposition passe à depot_recu ; journalisé »).

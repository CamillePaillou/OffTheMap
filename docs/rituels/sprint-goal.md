# Sprint Goal

Un conseiller obtient une proposition chiffrée dont les prix sont vérifiés par l’agent, puis réserve une prestation : option de 2 jours ouvrés seulement après son accord, confirmation seulement après une seconde validation.

## Ce que cela veut dire

- Le conseiller voit une proposition chiffrée par le code, jamais par l’IA (`docs/specs/chiffrage.md`).
- L’agent vérifie chaque prix auprès du simulateur du formateur ; il ne pose, ne confirme et n’annule rien (`docs/agent/contrat-agent.md`).
- Rien n’est envoyé au client tant qu’une ligne reste « à vérifier ».
- Après l’acceptation du client et le dépôt, une option n’est posée qu’avec un accord identifiable du conseiller, à usage unique.
- La réservation n’est confirmée qu’après une seconde validation : le conseiller saisit la clé d’approbation, qui n’est jamais stockée ni vue par le modèle.

## Comment on saura qu’il est atteint

Le cas de Nantes (deux voyageurs, week-end créatif sans voiture) se déroule de bout en bout devant le client, du formulaire à la réservation confirmée, en mode réel ou en rejeu annoncé (E7.3, E7.6).

## Confirmé au planning

- Date : …
- Équipe présente : …
- Estimations revues par les développeurs : oui / non
- Durée de l’option : le simulateur du cours pose 30 minutes ; les 2 jours ouvrés sont à confirmer avec le formateur.

-- Ligne « retiree » (E7.4) : une prestation devenue indisponible après le dépôt peut être retirée de la proposition,
-- avec l'accord du client, sans être remplacée. Seule dans sa migration : une valeur d'énumération ajoutée ne peut
-- pas servir dans la transaction qui l'ajoute. Les règles qui l'utilisent sont dans la migration suivante.
alter type statut_ligne add value 'retiree';

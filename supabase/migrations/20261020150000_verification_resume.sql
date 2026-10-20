-- Phrase de l'agent pour l'écran du conseiller (E8.4) : rendue par verifierPrestation (E8.3, champ `resume`).
-- Sans montant (consignes de l'agent) ; null quand la vérification n'a pas abouti (« non vérifié »).
alter table verifications add column resume text check (resume is null or char_length(resume) <= 500);

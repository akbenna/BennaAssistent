-- EIGEN AANTEKENINGEN TIJDENS DE OPNAME
--
-- Wat de eigenaar tijdens een vergadering zelf typt ("dit navragen bij de
-- accountant", "belangrijk: termijn 1 december") weegt zwaarder dan wat het
-- taalmodel uit het gesprek oppikt. Elke aantekening krijgt het moment in de
-- opname mee: [{ "moment": 754, "tekst": "..." }].
--
-- Alleen toevoegen: één kolom.

alter table notities add column if not exists aantekeningen jsonb not null default '[]';

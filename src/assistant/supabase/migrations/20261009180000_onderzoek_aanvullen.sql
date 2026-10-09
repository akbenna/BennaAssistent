-- DE TWEEDE RONDE VAN DE CONGRES-AGENT
--
-- Na de brede verkenning zoekt de agent gericht per aandachtsgebied (lipiden
-- en Lp(a), hypertensie, diabetes, obesitas, nierschade, hartfalen, AF).
-- Dat is een eigen stap, 'aanvullen', zodat elke stap binnen één ronde past.
alter table onderzoeken drop constraint if exists onderzoeken_werk_check;
alter table onderzoeken add constraint onderzoeken_werk_check check (werk in ('verkennen','aanvullen','antwoorden','uitwerken'));

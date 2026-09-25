-- HET PORTAAL LEEST DE RAPPORTEN IN, NIET DEZE APP
--
-- Rapport 05 en 25 gingen twee keer ergens in: op het portaal bij Import én
-- hier bij Declaraties. Dat is dubbel werk in een ronde waarvan het portaal
-- zelf zegt dat twee bestanden per maand het maximum is, en het zou op den duur
-- erger worden dan dubbel werk: een tweede maandstaat die niemand meer vult,
-- laat na een paar maanden verouderde cijfers zien alsof ze actueel zijn.
--
-- De praktijkhouder heeft gekozen: het portaal doet het. Deze app blijft de
-- cockpit die op tijd zegt wat er opgehaald moet worden en waar het heen moet,
-- maar leest zelf niets meer in. De taken wijzen daarom naar de praktijkanalyse
-- op het portaal, het scherm Declaraties verdwijnt, en de tabellen erachter
-- gaan weg.

-- ----------------------------------------------------- de taken omleiden --

update terugkerend set
  link = 'https://hetroosendael.nl/admin-praktijkanalyse.html',
  toelichting =
    'Twee bestanden, twee systemen. VIPLive: 05. Overzicht gedeclareerde prestaties per maand, '
    || 'periode 1 januari van het lopende jaar tot en met de laatste dag van de vorige maand, nooit over de '
    || 'jaargrens heen, alle prestatiecodes mee. Bricks: [0025] Verrichtingen per medewerker, precies één '
    || 'kalendermaand per bestand — Bricks kan dit rapport niet per maand groeperen en zet de periode niet in '
    || 'het bestand. Beide in de praktijkanalyse op het portaal inlezen, tabblad Import.'
where titel = 'Rapportenronde: 05 uit VIPLive en 25 uit Bricks';

update terugkerend set
  link = 'https://hetroosendael.nl/admin-praktijkanalyse.html',
  toelichting =
    'Uit VIPLive: 09. Totaal overzicht facturen voor accountant of boekhouding, met factuurdatum van '
    || '1 januari tot en met 31 december van het afgelopen jaar. VIPLive selecteert op factuurdatum en niet op '
    || 'behandeldatum, dus de december van het jaar ervoor staat er altijd in; dat is doorloop en geen inhaal. '
    || 'Lege kolommen Betaald en Afgeboekt zijn normaal: die vult VIPLive alleen als je er zelf afboekt. Er '
    || 'bestaat geen variant mét betaalstatus. In de praktijkanalyse op het portaal inlezen, tabblad Import.'
where titel = 'Rapport 09 over het afgelopen jaar ophalen';

-- Een taak die al gepland staat, draagt de oude tekst en het oude adres mee
-- (plan_terugkerend zet de link onder de toelichting). Alleen open taken van
-- de assistent met precies die titel en een verwijzing naar /declaraties
-- krijgen de nieuwe tekst; aan een taak waar iemand iets aan heeft gedaan,
-- komt deze migratie niet.
update tasks t set toelichting = r.toelichting || chr(10) || chr(10) || r.link
from terugkerend r
where r.owner_id = t.owner_id
  and r.titel = t.titel
  and t.aangemaakt_door = 'assistent'
  and t.status = 'open'
  and t.gearchiveerd_op is null
  and t.toelichting like '%/declaraties%'
  and not exists (select 1 from task_notes n where n.task_id = t.id)
  and t.titel in ('Rapportenronde: 05 uit VIPLive en 25 uit Bricks', 'Rapport 09 over het afgelopen jaar ophalen');

-- De tegel op de cockpit wees naar het scherm dat nu verdwijnt. De tegel
-- Praktijkanalyse naar het portaal bestaat al.
delete from koppelingen where url = '/declaraties';

-- ----------------------------------------------------- de tabellen weg --
--
-- Er is in deze app nooit een rapport ingelezen: de tabellen zijn leeg. Voor
-- de zekerheid staat dat hier niet als aanname maar als voorwaarde. Staat er
-- toch iets in, dan stopt de migratie en blijft alles staan, zodat er nooit
-- ongemerkt declaratiedata verdwijnt.

do $$
begin
  if exists (select 1 from declaratie_import)
     or exists (select 1 from declaratie_prestatie)
     or exists (select 1 from declaratie_factuur) then
    raise exception 'Er staat declaratiedata in deze app; niets verwijderd. Zet die eerst veilig.';
  end if;
end $$;

drop view if exists declaratie_maand;
drop table if exists declaratie_factuur;
drop table if exists declaratie_prestatie;
drop table if exists declaratie_import;

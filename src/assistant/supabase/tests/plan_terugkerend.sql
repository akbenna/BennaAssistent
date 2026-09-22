-- Toets op de planner van het terugkerende onderhoud.
--
-- Draai dit tegen een database met het schema erop. Hij maakt zijn eigen
-- proefrijen aan, herkenbaar aan het voorvoegsel ZZTOETS, en ruimt ze aan het
-- eind weer op — ook als een toets faalt.
--
-- De reden dat dit bestaat: de eerste versie van de planner sloeg een hele
-- periode over zodra de verschijndatum in het weekend viel. De maandafsluiting
-- verdween dan in elke maand die op zaterdag begon, en dat merk je pas als je
-- hem mist. Zulke fouten horen door een toets te worden gevangen en niet door
-- de gebruiker.

do $toets$
declare
  o uuid;
  fouten text[] := '{}';
  n integer;
  gevonden date;
begin
  select id into o from auth.users order by created_at limit 1;
  if o is null then raise exception 'Geen gebruiker om mee te toetsen'; end if;

  delete from tasks where titel like 'ZZTOETS%';
  delete from terugkerend where titel like 'ZZTOETS%';

  -- 3 oktober 2026 is een zaterdag. Een maandelijks ritme op de derde hoort
  -- dan door te schuiven naar maandag de vijfde, niet de maand over te slaan.
  insert into terugkerend (owner_id, titel, ritme, dag_van_maand, alleen_werkdagen, laatst_gepland)
  values (o, 'ZZTOETS maandelijks op de derde', 'maandelijks', 3, true, date '2026-09-30');

  perform plan_terugkerend(date '2026-10-03');
  select count(*) into n from tasks where titel = 'ZZTOETS maandelijks op de derde';
  if n <> 0 then fouten := fouten || 'op zaterdag zelf mag er nog niets gepland zijn'; end if;

  perform plan_terugkerend(date '2026-10-05');
  select deadline into gevonden from tasks where titel = 'ZZTOETS maandelijks op de derde';
  if gevonden is distinct from date '2026-10-05' then
    fouten := fouten || format('verwacht 2026-10-05, kreeg %s', coalesce(gevonden::text, 'niets'));
  end if;

  -- Tweemaal dezelfde dag mag geen tweede taak opleveren.
  perform plan_terugkerend(date '2026-10-06');
  select count(*) into n from tasks where titel = 'ZZTOETS maandelijks op de derde';
  if n <> 1 then fouten := fouten || format('na een tweede ronde staan er %s taken in plaats van 1', n); end if;

  -- Een dagelijks ritme met alleen_werkdagen slaat het weekend gewoon over.
  insert into terugkerend (owner_id, titel, ritme, alleen_werkdagen, laatst_gepland)
  values (o, 'ZZTOETS dagelijks', 'dagelijks', true, date '2026-10-09');
  perform plan_terugkerend(date '2026-10-10');  -- zaterdag
  select count(*) into n from tasks where titel = 'ZZTOETS dagelijks';
  if n <> 0 then fouten := fouten || 'een werkdagritme hoort in het weekend niets te plannen'; end if;
  perform plan_terugkerend(date '2026-10-12');  -- maandag
  select count(*) into n from tasks where titel = 'ZZTOETS dagelijks';
  if n <> 1 then fouten := fouten || 'op maandag hoort het werkdagritme wel te plannen'; end if;

  -- Een jaarlijks ritme verschijnt niet buiten zijn maand.
  insert into terugkerend (owner_id, titel, ritme, maand, dag_van_maand, alleen_werkdagen, laatst_gepland)
  values (o, 'ZZTOETS jaarlijks in januari', 'jaarlijks', 1, 15, true, date '2026-09-22');
  perform plan_terugkerend(date '2026-10-15');
  select count(*) into n from tasks where titel = 'ZZTOETS jaarlijks in januari';
  if n <> 0 then fouten := fouten || 'een jaarritme in januari hoort in oktober niets te doen'; end if;
  perform plan_terugkerend(date '2027-01-15');
  select count(*) into n from tasks where titel = 'ZZTOETS jaarlijks in januari';
  if n <> 1 then fouten := fouten || 'een jaarritme hoort in januari wél te plannen'; end if;

  delete from tasks where titel like 'ZZTOETS%';
  delete from terugkerend where titel like 'ZZTOETS%';

  if array_length(fouten, 1) is not null then
    raise exception 'plan_terugkerend faalt: %', array_to_string(fouten, ' | ');
  end if;
  raise notice 'plan_terugkerend: alle toetsen goed';
end $toets$;

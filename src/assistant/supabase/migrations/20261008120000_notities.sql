-- NOTITIES: VERGADERINGEN OPNEMEN, UITSCHRIJVEN EN OMZETTEN IN WERK
--
-- De assistent kende tot nu toe twee ingangen: mail en Drive. Dit is de derde:
-- een vergadering, een overleg of een telefoongesprek. De app neemt op, een
-- serverfunctie schrijft uit en vat samen, en wat eruit komt gaat dezelfde
-- weg als een mail: wat jij moet doen wordt een taakvoorstel, en pas als jij
-- het accepteert staat het op je lijst.
--
-- Alleen toevoegen. Geen bestaande tabel, rij of regel wordt hier veranderd,
-- op twee na die met name genoemd worden: de soort bron krijgt er een waarde
-- bij, en de tellingen voor de tabbalk krijgen een vijfde getal.
--
-- Er gaan geen patiëntgegevens doorheen. Consulten lopen via SmartVoice; een
-- MDO of casuïstiek neem je hier niet op. Het privacyfilter draait vóór de
-- samenvatting over het transcript, net zoals het bij mail vóór de triage draait.

-- Een opgenomen gesprek is een bron zoals een mailbox dat is. Zo kan een
-- taakvoorstel via task_links naar zijn vergadering wijzen en toont het
-- taakpaneel die vergadering als herkomst, zonder dat daar iets aan verandert.
alter type source_kind add value if not exists 'opname';

-- ------------------------------------------------------------- tabellen --

create table if not exists notities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'opname' check (status in (
    'opname',        -- de app neemt op en zet delen klaar
    'verwerken',     -- opname gestopt; delen worden uitgeschreven
    'samenvatten',   -- alle delen zijn uit; wacht op het taalmodel
    'bezig',         -- een ronde is aan het samenvatten
    'gereed',        -- klaar om na te lezen
    'goedgekeurd',   -- nagelezen; de bewaartermijn van de audio loopt
    'geweigerd',     -- het privacyfilter sloeg aan; er is niets samengevat
    'fout')),
  bron text not null default 'app' check (bron in ('app','upload')),
  project_id uuid references projects(id) on delete set null,
  -- Door de eigenaar gekozen: de samenvatting mag het project dan niet meer
  -- verzetten. Zonder deze vlag zou een correctie bij opnieuw samenvatten
  -- stilletjes worden teruggedraaid.
  project_vast boolean not null default false,
  titel text,
  gestart_op timestamptz not null default now(),
  duur_sec integer,
  agenda_event_id text,
  agenda_titel text,
  deelnemers text[] not null default '{}',
  samenvatting jsonb,
  transcript text,
  drive_doc_id text,
  modellen jsonb not null default '{}',
  fout text,
  -- Sloeg het filter aan, dan staat hier waarom. Na nalezen kan de eigenaar
  -- bevestigen dat het een vals alarm was; dat moment wordt vastgelegd en
  -- gelogd. Zonder die bevestiging gaat het transcript nergens heen.
  privacy_reden text,
  privacy_bevestigd_op timestamptz,
  item_id uuid references items(id) on delete set null,
  audio_verwijderen_na timestamptz,
  audio_verwijderd boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Een samenvatting naast een openstaande privacyweigering kan niet bestaan;
  -- de database weigert het, niet alleen de code. Dezelfde grendel als bij
  -- uitgesloten mailitems.
  constraint geen_samenvatting_bij_weigering
    check (privacy_reden is null or privacy_bevestigd_op is not null or samenvatting is null)
);

-- Een opname bestaat uit delen van hooguit vijf minuten. Elk deel is een
-- zelfstandig geluidsbestand, opgeslagen in blokken van dertig seconden. Zo kan
-- de serverfunctie een deel uitschrijven zonder ffmpeg, en kost een
-- vastgelopen telefoon hooguit dertig seconden.
create table if not exists notitie_delen (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notitie_id uuid not null references notities(id) on delete cascade,
  volgnummer integer not null check (volgnummer >= 1),
  status text not null default 'opname' check (status in ('opname','klaar','bezig','gereed','fout')),
  mime text not null,
  -- Hoeveel seconden na het begin van de opname dit deel begint. Daarmee
  -- krijgen de tijden in het transcript hun plek in het hele gesprek.
  begin_sec real not null default 0,
  duur_sec real,
  segmenten jsonb,
  dienst text,
  pogingen integer not null default 0,
  fout text,
  bijgewerkt timestamptz not null default now(),
  unique (notitie_id, volgnummer)
);

create table if not exists notitie_instellingen (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  mijn_naam text not null default 'Abdelkader',
  stemreferentie_pad text,
  bewaartermijn_audio_dagen integer not null default 30 check (bewaartermijn_audio_dagen between 0 and 365),
  drive_map_id text
);

create index if not exists notities_eigenaar_idx on notities (owner_id, gestart_op desc);
create index if not exists notities_status_idx   on notities (status);
create index if not exists notities_project      on notities (project_id);
create index if not exists notities_item         on notities (item_id);
create index if not exists notitie_delen_status  on notitie_delen (status, bijgewerkt);
create index if not exists notitie_delen_eigenaar on notitie_delen (owner_id);

drop trigger if exists notities_updated on notities;
create trigger notities_updated before update on notities for each row execute function set_updated_at();

create or replace function notitie_delen_bijgewerkt() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
begin
  new.bijgewerkt := now();
  return new;
end $fn$;
drop trigger if exists notitie_delen_touch on notitie_delen;
create trigger notitie_delen_touch before update on notitie_delen for each row execute function notitie_delen_bijgewerkt();

-- ------------------------------------------------------- rijbeveiliging ---

alter table notities             enable row level security;
alter table notitie_delen        enable row level security;
alter table notitie_instellingen enable row level security;

-- Een notitie mag de eigenaar ook wissen, anders dan een taak: het is een
-- opname van een gesprek, en wie hem niet meer wil hebben moet hem kwijt kunnen.
do $$
declare t text;
begin
  foreach t in array array['notities','notitie_delen','notitie_instellingen'] loop
    execute format('drop policy if exists eigenaar_alles on %I', t);
    execute format($p$create policy eigenaar_alles on %I for all to authenticated
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ------------------------------------------------------------- opslag ----

insert into storage.buckets (id, name, public) values ('opnames', 'opnames', false)
on conflict (id) do nothing;

-- Eén map per eigenaar: {owner_id}/{notitie_id}/deel-001/blok-00001.webm
drop policy if exists opnames_eigenaar on storage.objects;
create policy opnames_eigenaar on storage.objects for all to authenticated
  using (bucket_id = 'opnames' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'opnames' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ------------------------------------------------------------- functies --

/*
 * EÉN DEEL OPPAKKEN, ZONDER DAT TWEE RONDES HETZELFDE DEEL PAKKEN
 *
 * De verwerkingsfunctie wordt door de planner aangeroepen en door de app zodra
 * een opname stopt. Die twee kunnen elkaar kruisen. `skip locked` laat de
 * tweede het volgende deel nemen in plaats van op het eerste te wachten.
 *
 * Een deel dat al tien minuten 'bezig' staat is van een ronde die is
 * omgevallen (een time-out, een herstart); dat mag opnieuw, tot drie keer.
 */
create or replace function pak_notitie_deel(p_eigenaar uuid default null)
returns setof notitie_delen
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_id uuid;
begin
  select d.id into v_id
  from notitie_delen d
  where (d.status = 'klaar' or (d.status = 'bezig' and d.bijgewerkt < now() - interval '10 minutes'))
    and d.pogingen < 3
    and (p_eigenaar is null or d.owner_id = p_eigenaar)
  order by d.bijgewerkt
  limit 1
  for update skip locked;
  if v_id is null then return; end if;
  return query
    update notitie_delen set status = 'bezig', pogingen = pogingen + 1, fout = null
    where id = v_id returning *;
end $fn$;

revoke execute on function pak_notitie_deel(uuid) from public, anon, authenticated;

/* De tabbalk krijgt er één getal bij: notities die klaarstaan om na te lezen.
   Verder ongewijzigd; zie de grondslag voor de rest van de uitleg. */
create or replace function tellingen() returns json
language sql stable security invoker set search_path to 'public','pg_temp' as $fn$
  select json_build_object(
    'voorstellen', count(*) filter (where status = 'voorstel'),
    'vandaag',     count(*) filter (where status in ('open','antwoord_binnen')
                                      and deadline <= (now() at time zone 'Europe/Amsterdam')::date),
    'wachten',     count(*) filter (where status = 'wacht_op_antwoord'),
    'antwoord',    count(*) filter (where status = 'antwoord_binnen'),
    'notities',    (select count(*) from notities n where n.status in ('gereed','geweigerd'))
  )
  from tasks where gearchiveerd_op is null;
$fn$;

revoke execute on function tellingen() from anon;

-- ---------------------------------------------------------- nachtploeg ---

-- Elke twee minuten een vangnet. De app stoot de verwerking zelf aan zodra een
-- opname stopt; dit is voor als dat niet lukt (geen bereik, app gesloten) en
-- voor het opruimen van audio na de bewaartermijn. Een ronde zonder werk kost
-- een paar milliseconden.
select cron.schedule('bennaassistent-notities', '*/2 * * * *', 'select public.roep_functie(''notitie-verwerk'');');

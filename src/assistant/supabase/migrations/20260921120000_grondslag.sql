-- BennaAssistent — het volledige schema zoals het op 22 september 2026 draait.
--
-- Tot nu toe bestond dit alleen in Supabase: de tabellen, de regels en de
-- functies waren met de hand aangemaakt en nergens vastgelegd. De code stond
-- in Git, het gebouw niet. Dit bestand is dat gebouw. Vanaf hier gaat elke
-- schemawijziging als migratie de repo in en nooit meer alleen via het
-- beheerscherm.
--
-- Het is met opzet herhaalbaar geschreven (if not exists, or replace), zodat
-- het ook op een database draait waar al iets van staat.

create extension if not exists pg_cron    with schema extensions;
create extension if not exists pg_net     with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ------------------------------------------------------------------ typen --

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('voorstel','open','wacht_op_antwoord','antwoord_binnen','afgerond','vervallen');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type task_priority as enum ('laag','normaal','hoog');
  end if;
  if not exists (select 1 from pg_type where typname = 'draft_status') then
    create type draft_status as enum ('klaar','aangepast','goedgekeurd','verstuurd','weggegooid');
  end if;
  if not exists (select 1 from pg_type where typname = 'source_kind') then
    create type source_kind as enum ('gmail','calendar','drive','whatsapp_share','handmatig');
  end if;
  if not exists (select 1 from pg_type where typname = 'filter_kind') then
    create type filter_kind as enum ('afzender','domein','label','patroon');
  end if;
  if not exists (select 1 from pg_type where typname = 'note_kind') then
    create type note_kind as enum ('notitie','onderzoek');
  end if;
end $$;

-- --------------------------------------------------------------- tabellen --

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  naam text not null,
  kleur text,
  trefwoorden text[] not null default '{}',
  afzenders text[] not null default '{}',
  gearchiveerd boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, naam)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  titel text not null,
  toelichting text,
  status task_status not null default 'open',
  prioriteit task_priority not null default 'normaal',
  deadline date,
  -- Wie de taak heeft bedacht. De app laat dit zien, zodat een voorstel van de
  -- assistent nooit voor een eigen aantekening kan doorgaan.
  aangemaakt_door text not null default 'eigenaar' check (aangemaakt_door in ('eigenaar','assistent')),
  afgerond_op timestamptz,
  gearchiveerd_op timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind source_kind not null,
  account text,
  sync_cursor text,
  -- Alleen de verwijzing naar het geheim staat hier; het token zelf zit in de
  -- Vault en is uitsluitend via lees_token() te benaderen.
  token_secret_id uuid,
  actief boolean not null default true,
  laatst_gesynct timestamptz,
  laatste_fout text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, account)
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  extern_id text not null,
  thread_id text,
  deeplink text,
  afzender text,
  onderwerp text,
  samenvatting text,
  ontvangen_op timestamptz,
  uitgesloten boolean not null default false,
  uitsluitreden text,
  created_at timestamptz not null default now(),
  unique (source_id, extern_id),
  -- Van een uitgesloten bericht mag nooit een samenvatting bestaan: die zou
  -- door een taalmodel gemaakt moeten zijn, en daar is het juist buiten
  -- gehouden. De database weigert het, niet alleen de code.
  constraint geen_samenvatting_bij_uitsluiting check (not uitgesloten or samenvatting is null)
);

create table if not exists task_links (
  task_id uuid not null references tasks(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rol text not null default 'bron',
  created_at timestamptz not null default now(),
  primary key (task_id, item_id)
);

create table if not exists task_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  soort note_kind not null default 'notitie',
  inhoud text not null,
  bronnen jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  gmail_draft_id text,
  thread_id text,
  status draft_status not null default 'klaar',
  goedgekeurd_op timestamptz,
  verstuurd_op timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Verstuurd zonder goedkeuring kan niet bestaan. Dit is de laatste grendel
  -- onder de regel dat er nooit een mail uitgaat die niemand heeft gezien.
  constraint verstuurd_vereist_goedkeuring check (status <> 'verstuurd' or goedgekeurd_op is not null)
);

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  thread_id text not null,
  verstuurd_op timestamptz not null default now(),
  herinner_na_werkdagen integer not null default 5 check (herinner_na_werkdagen between 1 and 60),
  beantwoord_op timestamptz,
  laatste_herinnering_op timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists filters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  soort filter_kind not null,
  waarde text not null,
  omschrijving text,
  actief boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, soort, waarde)
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  naam text not null,
  wanneer text,
  inhoud text not null,
  actief boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null,
  inhoud jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_id, datum)
);

create table if not exists audit_log (
  id bigint primary key generated always as identity,
  owner_id uuid not null references auth.users(id) on delete cascade,
  actie text not null,
  object_type text,
  object_id text,
  model text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  verloopt_op timestamptz not null default now() + interval '10 minutes'
);

create table if not exists koppelingen (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  naam text not null,
  url text not null,
  omschrijving text,
  groep text,
  -- Per groep een eigen honderdtal, zodat één sortering zowel de groepen als
  -- de tegels erbinnen ordent.
  volgorde integer not null default 100,
  actief boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists terugkerend (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  titel text not null,
  toelichting text,
  link text,
  ritme text not null check (ritme in ('dagelijks','wekelijks','maandelijks','kwartaal','jaarlijks')),
  dag_van_week smallint check (dag_van_week between 1 and 7),
  -- Hoogstens 28: een ritme dat op de 31e valt zou in februari verdwijnen.
  dag_van_maand smallint check (dag_van_maand between 1 and 28),
  maand smallint check (maand between 1 and 12),
  alleen_werkdagen boolean not null default true,
  prioriteit task_priority not null default 'normaal',
  actief boolean not null default true,
  laatst_gepland date,
  created_at timestamptz not null default now()
);

create table if not exists declaratie_import (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rapport text not null check (rapport in ('05','09','25')),
  bestandsnaam text,
  praktijknummer text,
  periode text,
  stand_database text,
  aantal_regels integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists declaratie_prestatie (
  id bigint primary key generated always as identity,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id uuid not null references declaratie_import(id) on delete cascade,
  maand date not null,
  code text,
  omschrijving text not null,
  aantal numeric,
  man numeric,
  vrouw numeric,
  gedeclareerd numeric,
  toegezegd numeric,
  eenheden numeric,
  -- Gevuld bij rapport 25 (per medewerker), leeg bij rapport 05. De maandstaat
  -- telt alleen de lege, anders staat elke verrichting er dubbel in.
  medewerker text
);

create table if not exists declaratie_factuur (
  id bigint primary key generated always as identity,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id uuid not null references declaratie_import(id) on delete cascade,
  blok smallint not null check (blok in (1,2,3)),
  factuurnummer text,
  factuurdatum date,
  behandeling_van date,
  behandeling_tot date,
  gedeclareerd numeric,
  akkoord numeric,
  afgeboekt numeric,
  betaald numeric,
  uzovi text,
  verzekeraar text
);

-- ---------------------------------------------------------------- indexen --

create index if not exists tasks_deadline_idx on tasks (owner_id, deadline) where gearchiveerd_op is null;
create index if not exists tasks_status_idx   on tasks (owner_id, status)   where gearchiveerd_op is null;
create index if not exists tasks_project      on tasks (project_id);
create index if not exists items_ontvangen_idx on items (owner_id, ontvangen_op desc);
create index if not exists items_thread_idx    on items (owner_id, thread_id);
create index if not exists task_links_eigenaar on task_links (owner_id);
create index if not exists task_links_item     on task_links (item_id);
create index if not exists task_notes_eigenaar on task_notes (owner_id);
create index if not exists task_notes_taak     on task_notes (task_id);
create index if not exists drafts_eigenaar     on drafts (owner_id);
create index if not exists drafts_taak         on drafts (task_id);
create index if not exists followups_open_idx  on followups (owner_id) where beantwoord_op is null;
create index if not exists followups_taak      on followups (task_id);
create index if not exists templates_eigenaar  on templates (owner_id);
create index if not exists koppelingen_eigenaar on koppelingen (owner_id);
create index if not exists oauth_states_eigenaar on oauth_states (owner_id);
create index if not exists terugkerend_actief  on terugkerend (owner_id, actief);
create index if not exists terugkerend_project on terugkerend (project_id);
create index if not exists audit_log_tijd_idx  on audit_log (owner_id, created_at desc);
create index if not exists declaratie_import_eigenaar  on declaratie_import (owner_id);
create index if not exists declaratie_prestatie_import on declaratie_prestatie (import_id);
create index if not exists declaratie_prestatie_maand  on declaratie_prestatie (owner_id, maand);
create index if not exists declaratie_prestatie_code   on declaratie_prestatie (owner_id, code);
create index if not exists declaratie_factuur_import   on declaratie_factuur (import_id);
create index if not exists declaratie_factuur_datum    on declaratie_factuur (owner_id, factuurdatum);

-- ------------------------------------------------------- rijbeveiliging ---
--
-- Elke tabel draagt de eigenaar en elke regel kijkt daarnaar. `auth.uid()`
-- staat tussen haakjes met een select ervoor: dan rekent de planner het één
-- keer uit in plaats van per rij.

alter table projects              enable row level security;
alter table tasks                 enable row level security;
alter table sources               enable row level security;
alter table items                 enable row level security;
alter table task_links            enable row level security;
alter table task_notes            enable row level security;
alter table drafts                enable row level security;
alter table followups             enable row level security;
alter table filters               enable row level security;
alter table templates             enable row level security;
alter table briefs                enable row level security;
alter table audit_log             enable row level security;
alter table oauth_states          enable row level security;
alter table koppelingen           enable row level security;
alter table terugkerend           enable row level security;
alter table declaratie_import     enable row level security;
alter table declaratie_prestatie  enable row level security;
alter table declaratie_factuur    enable row level security;

do $$
declare t text;
begin
  -- Tabellen die de eigenaar volledig zelf beheert.
  foreach t in array array['projects','task_links','task_notes','filters','followups','templates',
                           'koppelingen','terugkerend','declaratie_import','declaratie_prestatie',
                           'declaratie_factuur']
  loop
    execute format('drop policy if exists eigenaar_alles on %I', t);
    execute format($p$create policy eigenaar_alles on %I for all
      using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Taken: lezen, maken en wijzigen mag; verwijderen niet. Wat weg moet wordt
-- gearchiveerd, zodat een verkeerde tik geen geschiedenis wist.
drop policy if exists eigenaar_lezen    on tasks;
drop policy if exists eigenaar_maken    on tasks;
drop policy if exists eigenaar_wijzigen on tasks;
create policy eigenaar_lezen    on tasks for select using (owner_id = (select auth.uid()));
create policy eigenaar_maken    on tasks for insert with check (owner_id = (select auth.uid()));
create policy eigenaar_wijzigen on tasks for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Bronnen: lezen en aan/uit zetten. Aanmaken gebeurt uitsluitend door de
-- OAuth-terugkeer met de servicesleutel; de browser mag dat niet.
drop policy if exists eigenaar_lezen    on sources;
drop policy if exists eigenaar_wijzigen on sources;
create policy eigenaar_lezen    on sources for select using (owner_id = (select auth.uid()));
create policy eigenaar_wijzigen on sources for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Items: lezen en wissen. Schrijven doet alleen de ophaalfunctie.
drop policy if exists eigenaar_lezen  on items;
drop policy if exists eigenaar_wissen on items;
create policy eigenaar_lezen  on items for select using (owner_id = (select auth.uid()));
create policy eigenaar_wissen on items for delete using (owner_id = (select auth.uid()));

-- Concepten: lezen en bijwerken. Aanmaken en versturen loopt via de functies,
-- zodat er geen concept kan bestaan dat Gmail niet kent.
drop policy if exists eigenaar_lezen    on drafts;
drop policy if exists eigenaar_wijzigen on drafts;
create policy eigenaar_lezen    on drafts for select using (owner_id = (select auth.uid()));
create policy eigenaar_wijzigen on drafts for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Alleen lezen: deze schrijft de assistent.
drop policy if exists eigenaar_lezen on briefs;
drop policy if exists eigenaar_lezen on audit_log;
create policy eigenaar_lezen on briefs    for select using (owner_id = (select auth.uid()));
create policy eigenaar_lezen on audit_log for select using (owner_id = (select auth.uid()));

-- oauth_states heeft met opzet géén beleid: alleen de servicesleutel komt
-- erbij, en die gaat om het beleid heen. Een ingelogde gebruiker hoort de
-- staat van een lopende koppelpoging niet te kunnen lezen of vervalsen.

-- --------------------------------------------------------------- functies --

create or replace function set_updated_at() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;

/* Afronden zet de datum, heropenen wist hem. Zo kan het scherm nooit een
   afgeronde taak zonder datum tonen, of andersom. */
create or replace function tasks_set_afgerond() returns trigger
language plpgsql set search_path to 'public','pg_temp' as $fn$
begin
  if new.status = 'afgerond' and old.status is distinct from 'afgerond' then
    new.afgerond_op := now();
  elsif new.status <> 'afgerond' then
    new.afgerond_op := null;
  end if;
  return new;
end $fn$;

/* Het vernieuwingstoken van Google gaat de Vault in en komt er alleen uit via
   lees_token. Beide zijn definer en beide zijn ingetrokken voor anon en
   authenticated: alleen de serverfuncties mogen erbij. */
create or replace function bewaar_token(p_source uuid, p_token text) returns void
language plpgsql security definer set search_path to 'public','vault' as $fn$
declare v_id uuid;
begin
  select token_secret_id into v_id from sources where id = p_source;
  if v_id is null then
    v_id := vault.create_secret(p_token, 'google_refresh_' || p_source::text);
    update sources set token_secret_id = v_id where id = p_source;
  else
    perform vault.update_secret(v_id, p_token);
  end if;
end $fn$;

create or replace function lees_token(p_source uuid) returns text
language sql security definer set search_path to 'public','vault' as $fn$
  select ds.decrypted_secret
  from sources s join vault.decrypted_secrets ds on ds.id = s.token_secret_id
  where s.id = p_source;
$fn$;

revoke execute on function bewaar_token(uuid, text) from public, anon, authenticated;
revoke execute on function lees_token(uuid)          from public, anon, authenticated;

create or replace function wis_bron(p_source uuid) returns void
language plpgsql set search_path to 'public','pg_temp' as $fn$
begin
  delete from items where source_id = p_source and owner_id = auth.uid();
end $fn$;

/* Vier tellingen in één query. De tabbalk vraagt ze bij elke navigatie en elke
   minuut; vier losse verzoeken was daar verspilling. Invoker, zodat het
   rijbeveiligingsbeleid gewoon geldt. */
create or replace function tellingen() returns json
language sql stable security invoker set search_path to 'public','pg_temp' as $fn$
  select json_build_object(
    'voorstellen', count(*) filter (where status = 'voorstel'),
    'vandaag',     count(*) filter (where status in ('open','antwoord_binnen')
                                      and deadline <= (now() at time zone 'Europe/Amsterdam')::date),
    'wachten',     count(*) filter (where status = 'wacht_op_antwoord'),
    'antwoord',    count(*) filter (where status = 'antwoord_binnen')
  )
  from tasks where gearchiveerd_op is null;
$fn$;

revoke execute on function tellingen() from anon;

/*
 * DE PLANNER VAN HET TERUGKERENDE ONDERHOUD
 *
 * Elke nacht kijkt hij welk onderhoud aan de beurt is en maakt er een taak
 * van. Twee dingen zijn met opzet zo gebouwd.
 *
 * Hij rekent met een verschijndatum per periode in plaats van met "is het
 * vandaag de derde?". Een eerste versie deed dat wel, en die sloeg de
 * maandafsluiting over in elke maand die op zaterdag begon: de dag kwam niet
 * terug en de periode was voorbij. Nu schuift een datum in het weekend door
 * naar de eerstvolgende werkdag.
 *
 * En hij is definer, want hij loopt langs de rijen van alle eigenaren. Juist
 * daarom is het aanroeprecht ingetrokken voor anon en authenticated: via de
 * REST-API zou één ingelogde gebruiker anders het onderhoud van iedereen
 * kunnen laten plannen, of met een verzonnen datum een lijst kunnen volschrijven.
 */
create or replace function plan_terugkerend(p_datum date default null) returns integer
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare
  d date := coalesce(p_datum, (now() at time zone 'Europe/Amsterdam')::date);
  r record;
  n integer := 0;
  basis date;
  verschijnt date;
  laatste_dag integer;
begin
  for r in select * from terugkerend where actief loop
    if r.ritme = 'dagelijks' then
      basis := d;
    elsif r.ritme = 'wekelijks' then
      basis := (date_trunc('week', d)::date) + (coalesce(r.dag_van_week, 1) - 1);
    elsif r.ritme in ('maandelijks','kwartaal') then
      basis := case when r.ritme = 'maandelijks'
                    then date_trunc('month', d)::date
                    else date_trunc('quarter', d)::date end;
      laatste_dag := extract(day from (date_trunc('month', basis) + interval '1 month - 1 day'))::int;
      basis := basis + (least(coalesce(r.dag_van_maand, 1), laatste_dag) - 1);
    elsif r.ritme = 'jaarlijks' then
      basis := make_date(extract(year from d)::int, coalesce(r.maand, 1), 1);
      laatste_dag := extract(day from (basis + interval '1 month - 1 day'))::int;
      basis := basis + (least(coalesce(r.dag_van_maand, 1), laatste_dag) - 1);
    else
      continue;
    end if;

    verschijnt := basis;
    if r.alleen_werkdagen then
      while extract(isodow from verschijnt) > 5 loop
        verschijnt := verschijnt + 1;
      end loop;
    end if;

    if d < verschijnt then continue; end if;
    if r.laatst_gepland is not null and r.laatst_gepland >= verschijnt then continue; end if;

    insert into tasks (owner_id, project_id, titel, toelichting, status, prioriteit, deadline, aangemaakt_door)
    values (r.owner_id, r.project_id, r.titel,
      case when r.link is null then r.toelichting
           else coalesce(r.toelichting || chr(10) || chr(10), '') || r.link end,
      'open', r.prioriteit, verschijnt, 'assistent');

    update terugkerend set laatst_gepland = d where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $fn$;

revoke execute on function plan_terugkerend(date) from public, anon, authenticated;

-- --------------------------------------------------------------- triggers --

drop trigger if exists projects_updated  on projects;
drop trigger if exists tasks_updated     on tasks;
drop trigger if exists tasks_afgerond    on tasks;
drop trigger if exists sources_updated   on sources;
drop trigger if exists drafts_updated    on drafts;
drop trigger if exists templates_updated on templates;
create trigger projects_updated  before update on projects  for each row execute function set_updated_at();
create trigger tasks_updated     before update on tasks     for each row execute function set_updated_at();
create trigger tasks_afgerond    before update on tasks     for each row execute function tasks_set_afgerond();
create trigger sources_updated   before update on sources   for each row execute function set_updated_at();
create trigger drafts_updated    before update on drafts    for each row execute function set_updated_at();
create trigger templates_updated before update on templates for each row execute function set_updated_at();

-- ------------------------------------------------------------ maandstaat --
--
-- De telregels van de praktijk staan hier en niet in de app, zodat geen enkele
-- latere query eromheen kan. Code 11119 is de opslag achterstandswijk: een
-- toeslag op bestaande inschrijvingen, geen aparte patiënt, en dus apart
-- geteld. Rijen mét medewerker komen uit rapport 25 en zouden alles dubbel
-- tellen naast rapport 05.

create or replace view declaratie_maand
with (security_invoker = on) as
select owner_id, maand,
  sum(gedeclareerd) as omzet,
  sum(aantal) filter (where code in ('11115','11116','11117','11118')) as ingeschreven,
  sum(aantal) filter (where code = '11119') as opslagwijk,
  sum(aantal) filter (where code in ('12001','12002','12003')) as consult_lang,
  sum(aantal) filter (where code = '12011') as consult_middel,
  sum(aantal) filter (where code = '12010') as consult_kort,
  sum(gedeclareerd) filter (where code like '13%') as mi_omzet,
  sum(aantal) filter (where code in ('12111','12118')) as poh_ggz,
  sum(gedeclareerd) filter (where code = '13012') as chirurgie,
  sum(gedeclareerd) filter (where code in ('13034','13036')) as intensieve_zorg
from declaratie_prestatie
where medewerker is null
group by owner_id, maand;

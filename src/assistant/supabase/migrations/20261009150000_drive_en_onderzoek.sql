-- WAT GOOGLE TOESTOND, EN DE CONGRES-AGENT
--
-- 1. sources.scopes: de toestemmingen die Google bij het koppelen werkelijk
--    gaf. Google laat elk vinkje apart aan- of uitzetten, en een koppeling van
--    vóór de notities had de toestemming om Docs te maken nog niet. Zonder
--    deze kolom is dat pas te zien als een document mislukt.
--
-- 2. onderzoeken: een congres dat de agent voor je uitzoekt. Eerst verkent hij
--    het programma en de berichtgeving en legt hij thema's voor; jij kiest,
--    vraagt door en geeft aan wat je wilt weten; dan werkt hij de gekozen
--    thema's uit, elk tot een eigen notitie in Wetenschap/<congres> in Drive.
--    Het werk staat in `werk` (wat er nog moet gebeuren) en wordt door
--    onderzoek-verwerk opgepakt, zoals notitie-verwerk dat met opnames doet.
--
-- Alleen toevoegend.

alter table sources add column if not exists scopes text[];

alter table notities drop constraint if exists notities_bron_check;
alter table notities add constraint notities_bron_check check (bron in ('app','upload','tekst','onderzoek'));

create table if not exists onderzoeken (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  onderwerp text not null check (length(onderwerp) between 3 and 300),
  url text,
  focus text,
  fase text not null default 'verkennen' check (fase in ('verkennen','kiezen','uitwerken','gereed','fout')),
  -- Wat er nog moet gebeuren; leeg als de agent op jou wacht.
  werk text check (werk in ('verkennen','antwoorden','uitwerken')),
  werk_sinds timestamptz,
  pogingen int not null default 0,
  overzicht text,
  themas jsonb not null default '[]',
  bronnen jsonb not null default '[]',
  gesprek jsonb not null default '[]',
  modellen jsonb not null default '{}',
  fout text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onderzoeken_werk_idx on onderzoeken (werk) where werk is not null;
create index if not exists onderzoeken_eigenaar_idx on onderzoeken (owner_id, created_at desc);

drop trigger if exists onderzoeken_updated on onderzoeken;
create trigger onderzoeken_updated before update on onderzoeken for each row execute function set_updated_at();

alter table onderzoeken enable row level security;
drop policy if exists eigenaar_alles on onderzoeken;
create policy eigenaar_alles on onderzoeken for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Elke twee minuten, net als de notities. De app roept hem ook direct aan.
select cron.unschedule('bennaassistent-onderzoek') where exists (select 1 from cron.job where jobname = 'bennaassistent-onderzoek');
select cron.schedule('bennaassistent-onderzoek', '*/2 * * * *', 'select public.roep_functie(''onderzoek-verwerk'');');

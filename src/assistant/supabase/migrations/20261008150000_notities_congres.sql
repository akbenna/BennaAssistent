-- NOTITIES VOOR CONGRESSEN: SOORT, SLIDES, MARKERINGEN EN NAGEZOCHTE BRONNEN
--
-- Als kaderarts bezoekt de eigenaar congressen, symposia en webinars. Daar is
-- een notitie iets anders dan bij een vergadering: per spreker wat er werd
-- beweerd en waarop, met de slides erbij, en desgewenst nagezocht in PubMed.
--
-- Alleen toevoegen: drie kolommen op notities, één nieuwe tabel en één functie.

alter table notities add column if not exists soort text not null default 'vergadering';
alter table notities drop constraint if exists notities_soort_check;
alter table notities add constraint notities_soort_check check (soort in ('vergadering','congres','telefoon'));

-- Seconden vanaf het begin van de opname waarop de eigenaar op "markeer" tikte.
alter table notities add column if not exists markeringen jsonb not null default '[]';

-- Het nazoeken van bronnen gebeurt alleen op verzoek; tot die tijd is dit leeg.
alter table notities add column if not exists verdieping jsonb;
alter table notities add column if not exists verdieping_status text;
alter table notities drop constraint if exists notities_verdieping_status_check;
alter table notities add constraint notities_verdieping_status_check
  check (verdieping_status is null or verdieping_status in ('gevraagd','bezig','gereed','fout'));

-- Foto's van slides, posters of documenten, gemaakt tijdens of na de opname.
create table if not exists notitie_fotos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notitie_id uuid not null references notities(id) on delete cascade,
  volgnummer integer not null check (volgnummer >= 1),
  pad text not null,
  -- Seconden vanaf het begin van de opname; leeg als hij achteraf is toegevoegd.
  moment_sec real,
  status text not null default 'klaar' check (status in ('klaar','bezig','gereed','geweigerd','fout')),
  lezing jsonb,          -- wat het model op de foto las (tekst, cijfers, bronnen)
  dienst text,
  pogingen integer not null default 0,
  fout text,
  bijgewerkt timestamptz not null default now(),
  unique (notitie_id, volgnummer),
  -- Een foto die het privacyfilter tegenhield draagt geen lezing.
  constraint geen_lezing_bij_weigering check (status <> 'geweigerd' or lezing is null)
);
create index if not exists notitie_fotos_status on notitie_fotos (status, bijgewerkt);
create index if not exists notitie_fotos_notitie on notitie_fotos (notitie_id, volgnummer);
create index if not exists notitie_fotos_eigenaar on notitie_fotos (owner_id);

drop trigger if exists notitie_fotos_touch on notitie_fotos;
create trigger notitie_fotos_touch before update on notitie_fotos for each row execute function notitie_delen_bijgewerkt();

alter table notitie_fotos enable row level security;
drop policy if exists eigenaar_alles on notitie_fotos;
create policy eigenaar_alles on notitie_fotos for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

/* Zelfde opzet als pak_notitie_deel: één foto per keer, en twee rondes pakken
   nooit dezelfde. */
create or replace function pak_notitie_foto(p_eigenaar uuid default null)
returns setof notitie_fotos
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_id uuid;
begin
  select f.id into v_id
  from notitie_fotos f
  where (f.status = 'klaar' or (f.status = 'bezig' and f.bijgewerkt < now() - interval '10 minutes'))
    and f.pogingen < 3
    and (p_eigenaar is null or f.owner_id = p_eigenaar)
  order by f.bijgewerkt
  limit 1
  for update skip locked;
  if v_id is null then return; end if;
  return query
    update notitie_fotos set status = 'bezig', pogingen = pogingen + 1, fout = null
    where id = v_id returning *;
end $fn$;

revoke execute on function pak_notitie_foto(uuid) from public, anon, authenticated;

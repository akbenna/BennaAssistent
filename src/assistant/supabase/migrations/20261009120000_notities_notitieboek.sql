-- VAN NOTETAKER NAAR NOTITIEBOEK
--
-- Drie uitbreidingen, alle drie alleen toevoegend:
--
-- 1. Een snelle notitie zonder opname: getypte tekst, foto's (een whiteboard,
--    een flipover) en eventueel een link naar een artikel. Bron 'tekst', soort
--    'notitie'. Wat je typt staat in `invoer`; de tekst van het artikel komt na
--    het ophalen in `transcript`, net als bij een opname. Labels ordenen
--    notities los van het project.
-- 2. Vragen stellen aan je notities: een zoekvector over titel, samenvatting,
--    transcript, eigen tekst en aantekeningen, en een functie die met jouw
--    rechten (security invoker, dus RLS) de best passende notities teruggeeft.
-- 3. Een nascholingslogboek: per congresnotitie de organisator en de
--    accreditatiepunten zoals ze in GAIA staan.

alter table notities drop constraint if exists notities_bron_check;
alter table notities add constraint notities_bron_check check (bron in ('app','upload','tekst'));
alter table notities drop constraint if exists notities_soort_check;
alter table notities add constraint notities_soort_check check (soort in ('vergadering','congres','telefoon','notitie'));

alter table notities add column if not exists invoer text;
alter table notities add column if not exists link text;
alter table notities add column if not exists labels text[] not null default '{}';
alter table notities add column if not exists nascholing_punten numeric(5,1);
alter table notities add column if not exists nascholing_organisator text;

create index if not exists notities_labels_idx on notities using gin (labels);

-- 'dutch' voor stammen en stopwoorden, zodat "besluiten" ook "besluit" vindt.
-- Gewicht A voor de titel, B voor de samenvatting en wat je zelf schreef, C
-- voor het transcript.
alter table notities add column if not exists zoekvector tsvector generated always as (
  setweight(to_tsvector('dutch', coalesce(titel, '')), 'A') ||
  setweight(to_tsvector('dutch', coalesce(samenvatting::text, '') || ' ' || coalesce(invoer, '') || ' ' || coalesce(aantekeningen::text, '')), 'B') ||
  setweight(to_tsvector('dutch', coalesce(transcript, '')), 'C')
) stored;
create index if not exists notities_zoekvector_idx on notities using gin (zoekvector);

/* Een vraag is geen zoekopdracht: "wat spraken we af over de POH-uren" moet
   ook notities vinden waar niet elk woord van de vraag in staat. Daarom de
   gestamde woorden van de vraag met OF ertussen, en de rangorde doet de rest.
   Stopwoorden vallen er in 'dutch' vanzelf uit; blijft er niets over, dan
   komt er niets terug. De woorden zijn al genormaliseerd, dus de cast naar
   tsquery stamt ze niet nog eens.

   De eigenaar staat er expliciet bij: de Edge Function roept dit aan met de
   service-rol, en die ziet langs RLS heen. Vanuit de app is het auth.uid(), en
   wie daar een ander id meegeeft, krijgt door RLS niets terug. */
create or replace function zoek_notities(vraag text, aantal int default 8, eigenaar uuid default null)
returns table (id uuid, rang real)
language sql stable security invoker set search_path to 'public','pg_temp' as $fn$
  with q as (
    select (select string_agg(quote_literal(w), ' | ')
            from unnest(tsvector_to_array(to_tsvector('dutch', left(coalesce(vraag, ''), 500)))) w)::tsquery as tq
  )
  select n.id, ts_rank_cd(n.zoekvector, q.tq) as rang
  from notities n, q
  where q.tq is not null and n.owner_id = coalesce(eigenaar, auth.uid()) and n.status in ('gereed', 'goedgekeurd') and n.zoekvector @@ q.tq
  order by rang desc, n.gestart_op desc
  limit least(greatest(coalesce(aantal, 8), 1), 20);
$fn$;

revoke execute on function zoek_notities(text, int, uuid) from public, anon;
grant execute on function zoek_notities(text, int, uuid) to authenticated, service_role;

-- GEZONDHEID VAN DE NACHTPLOEG EN HET WEEKOVERZICHT
--
-- Deze twee stonden al in de databank, maar in geen enkel migratiebestand: ze
-- zijn in september 2026 rechtstreeks toegepast. Een databank die opnieuw
-- wordt opgebouwd uit deze map zou ze dus missen, en dan faalt het
-- weekoverzicht op een ontbrekende kolom en blijft de gezondheidstegel op
-- Instellingen leeg. Dit bestand legt ze vast zoals ze live draaien. Alles is
-- herhaalbaar: op de bestaande databank verandert er niets.

-- Een weekoverzicht is een ander soort stuk dan een dagoverzicht, maar hoort
-- in dezelfde tabel: het is dezelfde soort momentopname. Bestaande rijen zijn
-- allemaal dagoverzichten, vandaar de standaardwaarde.
alter table briefs add column if not exists soort text not null default 'dag';
alter table briefs drop constraint if exists briefs_soort_check;
alter table briefs add constraint briefs_soort_check check (soort in ('dag','week'));

-- Eén datum kan nu een dag- én een weekoverzicht dragen (maandag).
alter table briefs drop constraint if exists briefs_owner_id_datum_key;
drop index if exists briefs_owner_datum_soort;
create unique index if not exists briefs_owner_datum_soort on briefs (owner_id, datum, soort);

/*
 * HOE HET DE NACHTPLOEG VERGAAT
 *
 * De 404 op de mailkoppeling stond twintig rondes in de database voordat hij
 * op een telefoon werd opgemerkt. Dit is het antwoord daarop: één blik op
 * Instellingen zegt of alles nog draait.
 *
 * Definer, want `cron.job_run_details` is van postgres en een gewone gebruiker
 * mag daar niet bij. De opdracht zelf gaat met opzet niet mee terug — daar
 * staat weliswaar niets geheims meer in sinds de URL uit de Vault komt, maar
 * een gezondheidsoverzicht hoeft geen binnenwerk te tonen.
 */
create or replace function cron_gezondheid()
returns table (taak text, rooster text, laatste timestamptz, status text, fout text, mislukt_24u bigint)
language sql stable security definer set search_path to 'public','cron','pg_temp' as $fn$
  select j.jobname::text,
         j.schedule::text,
         d.start_time,
         d.status::text,
         left(coalesce(d.return_message, ''), 200),
         (select count(*) from cron.job_run_details x
           where x.jobid = j.jobid and x.status <> 'succeeded'
             and x.start_time > now() - interval '24 hours')
  from cron.job j
  left join lateral (
    select * from cron.job_run_details r
    where r.jobid = j.jobid order by r.start_time desc limit 1
  ) d on true
  where j.jobname like 'bennaassistent-%'
  order by j.jobname;
$fn$;

revoke execute on function cron_gezondheid() from public, anon;
grant execute on function cron_gezondheid() to authenticated;

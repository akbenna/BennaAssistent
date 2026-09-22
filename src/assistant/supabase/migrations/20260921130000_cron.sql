-- De nachtploeg: welke serverfunctie wanneer wordt aangeroepen.
--
-- De URL stond eerder met de projectnaam hard in elke opdracht, ingevuld met
-- de hand. Eén keer is dat vergeten en bleef er `<PROJECT_REF>` staan: twintig
-- mislukte ophaalrondes voordat iemand het zag. De URL komt nu uit de Vault,
-- net als het geheim, zodat er niets meer in te vullen valt. Wie dit schema
-- op een ander project zet, maakt daar één geheim aan:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
--   select vault.create_secret('<lange willekeurige reeks>', 'cron_secret');
--
-- Dezelfde waarde als `CRON_SECRET` hoort bij de Edge Functions te staan.

create or replace function roep_functie(p_naam text) returns bigint
language plpgsql security definer set search_path to 'public','vault','extensions' as $fn$
declare v_url text; v_geheim text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_geheim from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_geheim is null then
    raise exception 'Vault mist functions_url of cron_secret';
  end if;
  -- Twee minuten: een ophaalronde met tientallen berichten en evenzoveel
  -- modelaanroepen haalt de standaard vijf seconden nooit.
  return net.http_post(
    url := v_url || '/' || p_naam,
    headers := jsonb_build_object('x-cron-secret', v_geheim),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $fn$;

revoke execute on function roep_functie(text) from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('bennaassistent-gmail',       '*/10 * * * *', 'gmail-ingest'),
      ('bennaassistent-followup',    '5 * * * *',    'followup-check'),
      ('bennaassistent-drive',       '20 * * * *',   'drive-ingest'),
      -- Twee keer, omdat 06:00 in Amsterdam 's winters 05:00 UTC is en
      -- 's zomers 04:00; de functie zelf slaat de verkeerde over.
      ('bennaassistent-brief',       '30 4,5 * * 1-5', 'daily-brief'),
      ('bennaassistent-week',        '0 5 * * 1',    'week-brief'),
      ('bennaassistent-hertriage',   '30 3 * * *',   'retriage')
    ) as v(naam, rooster, functie)
  loop
    perform cron.schedule(r.naam, r.rooster, format('select public.roep_functie(%L);', r.functie));
  end loop;
end $$;

-- Deze twee draaien in de database zelf en hoeven dus geen functie aan te roepen.
select cron.schedule('bennaassistent-terugkerend', '5 4 * * *',  'select public.plan_terugkerend();');
select cron.schedule('bennaassistent-opruimen',    '15 3 * * *', 'select public.ruim_op();');

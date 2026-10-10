-- De hertriage draaide elke nacht om 03:30 en kost bij elke ronde modelaanroepen.
-- Eén keer per week (zondag 03:30 UTC) is genoeg. Herhaalbaar: de oude opdracht
-- wordt alleen afgemeld als hij bestaat.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bennaassistent-hertriage') then
    perform cron.unschedule('bennaassistent-hertriage');
  end if;
  perform cron.schedule('bennaassistent-hertriage', '30 3 * * 0',
    format('select public.roep_functie(%L);', 'retriage'));
end $$;

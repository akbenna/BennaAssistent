-- Wat we bewaren, en hoe lang.
--
-- Tot nu toe groeide alles eeuwig door: elk onderwerp en elke afzender die ooit
-- langskwam, elk dagoverzicht, elke logregel. "We bewaren het tot het misgaat"
-- is voor een praktijk die onder de AVG valt geen beleid. Dit zijn de termijnen,
-- en ze staan in de database zodat ze ook echt gebeuren.
--
-- Een mail die aan een taak hangt blijft staan zolang de taak bestaat: dat is
-- de onderbouwing van waaróm die taak er is, en die hoort bij het dossier.
-- Een mail die nergens toe leidde is na drie maanden niets meer waard.

create or replace function ruim_op() returns json
language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare
  n_items integer; n_briefs integer; n_log integer; n_states integer;
begin
  with weg as (
    delete from items i
    where i.created_at < now() - interval '90 days'
      and not exists (select 1 from task_links l where l.item_id = i.id)
    returning 1
  ) select count(*) into n_items from weg;

  with weg as (
    delete from briefs where datum < (current_date - 30) returning 1
  ) select count(*) into n_briefs from weg;

  with weg as (
    delete from audit_log where created_at < now() - interval '365 days' returning 1
  ) select count(*) into n_log from weg;

  with weg as (
    delete from oauth_states where verloopt_op < now() - interval '1 day' returning 1
  ) select count(*) into n_states from weg;

  return json_build_object('items', n_items, 'briefs', n_briefs,
                           'logregels', n_log, 'koppelpogingen', n_states);
end $fn$;

revoke execute on function ruim_op() from public, anon, authenticated;

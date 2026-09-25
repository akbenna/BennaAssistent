-- DE RAPPORTENRONDE VOLGT HET PORTAAL
--
-- Het Roosendael-portaal heeft in september 2026 zijn rapportenkalender
-- vastgelegd op de echte exports, en daar schuift een aanname mee die hier nog
-- verkeerd stond: rapport 05, 09 en 23 komen uit VIPLive, en alleen rapport 25
-- uit Bricks. VIPLive is de geldbron — daar staat wat er is ingediend,
-- goedgekeurd en betaald — en Bricks de registratiebron. Een taak die zegt dat
-- 05 uit Bricks komt stuurt je in het verkeerde systeem op zoek, en dat is
-- precies wat een takenlijst niet hoort te doen.
--
-- Het ritme is daar ook op herzien. Twee bestanden per maand houden de
-- vroegsignalering draaiend (05 en 25); per kwartaal komen er twee bij die de
-- geldstroom buiten de declaraties vullen (23 en de betaalspecificatie
-- ketenzorg); rapport 09 verandert traag en is één keer per jaar genoeg. Dat
-- laatste is een verschuiving: 09 stond hier als maandtaak. De reden dat hij
-- terugvalt naar jaarlijks is dat zijn kolommen Betaald en Afgeboekt leeg
-- blijven zolang de praktijk niet in VIPLive afboekt, en wat er dan overblijft
-- — verzekeraarsmix, afkeur, inhaal uit oude jaren — beweegt traag. Of het geld
-- binnen is laat de bankcontrole zien.
--
-- De grens van twee bestanden per maand en hooguit vier per kwartaal is geen
-- detail: een ronde van tien exports gebeurt in de praktijk niet, en een
-- dashboard dat niet gevuld wordt is nutteloos.

-- ------------------------------------------------ de maandelijkse ronde --

update terugkerend set
  titel = 'Rapportenronde: 05 uit VIPLive en 25 uit Bricks',
  toelichting =
    'Twee bestanden, twee systemen. VIPLive: 05. Overzicht gedeclareerde prestaties per maand, '
    || 'periode 1 januari van het lopende jaar tot en met de laatste dag van de vorige maand, nooit over de '
    || 'jaargrens heen, alle prestatiecodes mee. Bricks: [0025] Verrichtingen per medewerker, precies één '
    || 'kalendermaand per bestand — Bricks kan dit rapport niet per maand groeperen en zet de periode niet in '
    || 'het bestand. Beide hier inlezen bij Declaraties, en op het portaal bij Import.',
  ritme = 'maandelijks',
  dag_van_maand = 6,
  maand = null
where titel in ('Bricks 05, 09 en 25 in BennaAssistent inlezen',
                'Rapportenronde: 05 uit VIPLive en 25 uit Bricks');

-- ------------------------------------------------ de kwartaalronde erbij --

insert into terugkerend (owner_id, project_id, titel, toelichting, link, ritme, dag_van_maand, alleen_werkdagen)
select t.owner_id, t.project_id,
  'Kwartaalronde: 23 en de betaalspecificatie ketenzorg',
  'Beide uit VIPLive, en beide op hetzelfde moment: de zorggroep betaalt ze op dezelfde dagen. '
  || '23. Betalingen via Zorggroepen over het lopende jaar, uit het rapportenoverzicht. De '
  || 'Betaalspecificatie ketenzorg staat onder de betaalspecificaties en is een pdf met één pagina per '
  || 'zorgstraat; sleep die zoals hij is naar Import op het portaal, dat leest hem zelf. Draai ze ongeveer '
  || 'een maand na het kwartaaleinde, dan staat de betaling erin. Zonder deze twee leest de praktijkanalyse '
  || 'een module die naar de zorggroep verhuisde als verlies.',
  'https://hetroosendael.nl/admin-praktijkanalyse.html',
  'kwartaal', 28, true
from terugkerend t
where t.titel = 'Rapportenronde: 05 uit VIPLive en 25 uit Bricks'
  and not exists (
    select 1 from terugkerend b
    where b.owner_id = t.owner_id and b.titel = 'Kwartaalronde: 23 en de betaalspecificatie ketenzorg');

-- ------------------------------------------------- rapport 09 jaarlijks --

insert into terugkerend (owner_id, project_id, titel, toelichting, link, ritme, maand, dag_van_maand, alleen_werkdagen)
select t.owner_id, t.project_id,
  'Rapport 09 over het afgelopen jaar ophalen',
  'Uit VIPLive: 09. Totaal overzicht facturen voor accountant of boekhouding, met factuurdatum van '
  || '1 januari tot en met 31 december van het afgelopen jaar. VIPLive selecteert op factuurdatum en niet op '
  || 'behandeldatum, dus de december van het jaar ervoor staat er altijd in; dat is doorloop en geen inhaal. '
  || 'Lege kolommen Betaald en Afgeboekt zijn normaal: die vult VIPLive alleen als je er zelf afboekt. Er '
  || 'bestaat geen variant mét betaalstatus. Hier inlezen bij Declaraties.',
  '/declaraties',
  'jaarlijks', 1, 25, true
from terugkerend t
where t.titel = 'Rapportenronde: 05 uit VIPLive en 25 uit Bricks'
  and not exists (
    select 1 from terugkerend b
    where b.owner_id = t.owner_id and b.titel = 'Rapport 09 over het afgelopen jaar ophalen');

-- --------------------------------------------------- wat ernaar verwijst --

update terugkerend set
  toelichting = 'Kwartaalronde langs omzet, consultmix, fair tarief per arts en de omslagpunten. Kijk of het '
    || 'praktijkprofiel nog klopt met de laatste rapportenronde. Welke rapporten binnen moeten zijn en of ze bij '
    || 'zijn, staat in de bestuursagenda op de cockpit van de praktijkanalyse.'
where titel = 'Praktijkanalyse doorlopen en duiden';

update koppelingen set
  omschrijving = 'Maandstaat uit 05 en 09 (VIPLive) en 25 (Bricks)'
where url = '/declaraties';

-- ------------------------------------------------------------ reparatie --
--
-- Bij het beproeven van plan_terugkerend is er met toekomstige datums gerekend,
-- en die functie schrijft `laatst_gepland` op de dag waarop ze draait. Daardoor
-- staat er op een deel van de regels een datum die nog moet komen, en omdat de
-- functie alles overslaat wat al gepland heet, zou de hele terugkerende planning
-- tot die dag stilliggen. Alles wat in de toekomst staat gaat daarom terug naar
-- leeg; de eerstvolgende nachtronde pakt de draad dan gewoon weer op.

update terugkerend set laatst_gepland = null
where laatst_gepland > (now() at time zone 'Europe/Amsterdam')::date
  and ritme in ('dagelijks', 'wekelijks', 'maandelijks', 'kwartaal');

-- Bij een jaartaak ligt dat anders. Leegmaken zou daar een taak opleveren met
-- een deadline in januari van dit jaar, negen maanden terug, en dat is geen
-- herinnering maar ruis. Een jaartaak waarvan de dag dit jaar al voorbij is
-- krijgt daarom vandaag als stand: hij komt vanzelf terug op zijn eigen datum in
-- het nieuwe jaar. Datzelfde geldt voor de zojuist toegevoegde jaarregel voor
-- rapport 09, die nog nooit is gepland.
update terugkerend set laatst_gepland = (now() at time zone 'Europe/Amsterdam')::date
where ritme = 'jaarlijks'
  and (laatst_gepland is null or laatst_gepland > (now() at time zone 'Europe/Amsterdam')::date)
  and make_date(
        extract(year from (now() at time zone 'Europe/Amsterdam'))::int,
        coalesce(maand, 1), coalesce(dag_van_maand, 1)
      ) < (now() at time zone 'Europe/Amsterdam')::date;

-- Diezelfde proefronde heeft ook taken achtergelaten: hij plande elke
-- terugkerende taak alvast tot ver in 2027 vooruit, en die staan sindsdien in de
-- lijst alsof ze echt zijn. Weg ermee, maar met een nauwe zeef: alleen open
-- taken van de assistent, van de dag van de proef, met een deadline die nog moet
-- komen, met een titel die letterlijk uit `terugkerend` komt, en zonder notitie,
-- koppeling of concept eraan. Alles waar ook maar iets aan gedaan is blijft
-- staan. Na het leegmaken van `laatst_gepland` hierboven plant de nachtronde er
-- vanzelf weer één per regel, op de juiste dag.

delete from tasks t
where t.aangemaakt_door = 'assistent'
  and t.gearchiveerd_op is null
  and t.status = 'open'
  and t.deadline > (now() at time zone 'Europe/Amsterdam')::date
  and t.created_at::date = date '2026-09-22'
  -- De maandtaak is hierboven hernoemd, dus zijn eigen proeftaken dragen nog de
  -- oude titel en zouden anders als enige blijven staan.
  and (exists (select 1 from terugkerend r where r.titel = t.titel and r.owner_id = t.owner_id)
       or t.titel = 'Bricks 05, 09 en 25 in BennaAssistent inlezen')
  and not exists (select 1 from task_notes n where n.task_id = t.id)
  and not exists (select 1 from task_links l where l.task_id = t.id)
  and not exists (select 1 from drafts d where d.task_id = t.id);

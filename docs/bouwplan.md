# Bouwplan na de audit van 22 september 2026

De audit staat in het gesprek van die dag; dit is het uitvoeringsdeel. De
beslissingen hieronder zijn genomen. Wie dit bouwt hoeft ze niet opnieuw te
wegen — alleen uit te voeren, te testen en te committen. Waar nog wél een
keuze openstaat, staat dat er uitdrukkelijk bij.

Werkwijze voor elk punt: kleine commit, Nederlandse commit-tekst die het
waarom uitlegt, typecheck en tests groen vóór de push. Serverfuncties na
wijziging opnieuw uitrollen met álle vier `_shared`-bestanden erbij.

## Blok 1 — continuïteit (eerst)

### 1.1 Schema in de repo
Doel: `src/assistant/supabase/migrations/` bestaat en bevat het volledige
huidige schema als eerste migratie.

Beslissing: dump via een GitHub Action, niet met de hand. De eigenaar maakt
één keer een Supabase access token (Account → Access Tokens) en zet die als
repo-secret `SUPABASE_ACCESS_TOKEN`, plus `SUPABASE_DB_PASSWORD`. De Action
draait `supabase db dump --schema public,cron,vault --file …` op verzoek en
opent daar een PR mee. Daarna gaat élke schemawijziging als bestand in
`migrations/`, nooit meer via de beheerinterface.

### 1.2 Nachtelijke back-up
Beslissing: dezelfde Action, dagelijks 03:00 UTC, `supabase db dump --data-only`
gecomprimeerd naar een privé GitHub Release met datum als tag; dertig
releases bewaren, oudere verwijderen. Los van het Supabase-plan.

### 1.3 Tweede factor
Beslissing: TOTP via Supabase Auth MFA. In `Instellingen → Account` een
onderdeel "Tweestapsverificatie": `supabase.auth.mfa.enroll({factorType:"totp"})`
toont de QR, een veld voor de zes cijfers verifieert, daarna staat het aan.
`Login.tsx`: na een geslaagde wachtwoord- of Google-login controleren op
`getAuthenticatorAssuranceLevel()`; is `nextLevel === "aal2"`, dan een
cijferveld tonen en `mfa.challengeAndVerify`. Zonder aal2 geen toegang tot de
app. Herstelcodes hoeven niet: de inloglink is het vangnet.

### 1.4 Uitrolverschil weg
`config.toml` aanvullen met `drive-ingest` (verify_jwt = false) en
`task-assist` (verify_jwt = true). GitHub Action `uitrol.yml`: bij push naar
`main` → `npm ci`, `npx tsc --noEmit`, `deno test supabase/functions/_shared`,
`supabase functions deploy` (alle functies), `supabase db push`. Faalt een
stap, dan wordt er niets uitgerold.

## Blok 2 — robuustheid

### 2.1 Vangnet per bericht in gmail-ingest
Beslissing: rond `triage(m)` en de daaropvolgende inserts een `try`. Bij een
fout: het item wél opslaan met `samenvatting: null`, een auditregel
`triage_fout` met de foutmelding (max 300 tekens), teller `mislukt++`,
doorgaan. De cursor schuift dus altijd door. Nieuwe cron `bennaassistent-
hertriage`, dagelijks 03:30 UTC, roept een nieuwe functie `retriage` aan die
items van de laatste zeven dagen met `samenvatting is null and uitgesloten =
false` opnieuw triageert (zelfde code als in gmail-ingest — verhuis dat stuk
naar `_shared/verwerk.ts` zodat het maar één keer bestaat).

### 2.2 De juiste bron bij versturen en opvolgen
`send-draft`: de bron niet met `limit(1)` kiezen maar via
draft → task_id → task_links → items.source_id (zoals `task-assist` al doet).
`followup-check`: hetzelfde via `followups.task_id`. Geen gedrag verandert
met één account; het voorkomt versturen vanuit een verkeerd account zodra er
een tweede komt.

### 2.3 OAuth-terugkeer
`google-oauth-callback`: `exchangeCode` en het profiel-verzoek in een `try`;
bij fout `terug("tokenfout")` en een regel in `GOOGLE_MELDING` in
Instellingen.tsx. Nooit meer een kale 500.

### 2.4 Bewaartermijnen
Eén SQL-functie `ruim_op()` (security definer, alleen postgres/service_role),
cron `bennaassistent-opruimen` dagelijks 03:15 UTC:
- `items` zonder rij in `task_links`, ouder dan 90 dagen → weg
- `briefs` ouder dan 30 dagen → weg
- `audit_log` ouder dan 365 dagen → weg
- `oauth_states` verlopen → weg
Vastleggen in `docs/beheer.md` en in het verwerkingsregister van de praktijk.

### 2.5 Tests
- `src/lib/tabel.test.ts` (Vitest toevoegen als devDependency): csv met
  puntkomma en aanhalingstekens; xlsx gemaakt met `scripts/maakxlsx.mjs` uit
  de scratchmap van de audit-sessie (kopieer dat script naar `scripts/`),
  lege cellen die kolommen niet mogen verschuiven, gedeelde tekst, inlineStr.
- `src/lib/bricks.test.ts`: rapport 05 met twee maandblokken en jaarwissel,
  rapport 09 drie blokken, Excel-serieel datum.
- SQL-test in de Action: `select plan_terugkerend('2026-10-03')` op een
  testdatabase (`supabase start`) moet de zaterdag naar maandag schuiven.

### 2.6 Kleine punten
- `index.html` theme-color → `#07785c`; manifest `background_color` → `#f3f6f5`,
  `theme_color` → `#07785c`.
- `vercel.json` `headers`: `Content-Security-Policy` (default-src 'self';
  connect-src 'self' https://cohgbocslfgxfshelsts.supabase.co
  https://accounts.google.com; img-src 'self' data:; style-src 'self'
  'unsafe-inline'), `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy: camera=(),
  microphone=(), geolocation=()`.
- Deelmenu: `share_target.method` → `POST`, `enctype`
  `application/x-www-form-urlencoded`; de service worker vangt de POST op
  `/delen`, zet de velden om naar een GET met querystring en antwoordt met
  een redirect (standaardpatroon). Zo komt gedeelde tekst niet in Vercel-logs.
- gmail-ingest: `EERSTE_RONDE` en de terugval na een verlopen cursor beide op
  `newer_than:7d`, `maxResults=200` met paginering. Eén constante bovenaan,
  met de reden.

## Blok 3 — slim (denkwerk deels nog open)

### 3.1 Gezondheidstegel — beslist, bouwen
SQL-functie `cron_gezondheid()` (security definer, alleen authenticated)
geeft per job: naam, laatste starttijd, laatste status, laatste foutmelding
(max 200 tekens), aantal mislukt in 24 uur. Géén `command`-kolom (bevat de
URL). Op Instellingen bovenaan een kaart: groen als alles in 24 uur is
geslaagd, amber bij één misser, rood bij twee of meer achter elkaar, met de
foutregel eronder. Plus `laatste_fout` van de drie bronnen in dezelfde kaart.

### 3.2 Weekstart — beslist, bouwen
Functie `week-brief`, cron maandag 05:00 UTC, zelfde opbouw als `daily-brief`,
schrijft `briefs` met `datum` = maandag en `soort = 'week'` (kolom toevoegen,
default `'dag'`). Inhoud: deadlines deze week, terugkerend onderhoud dat
deze week verschijnt (uit `terugkerend`, zelfde datumlogica als de planner),
opvolgingen zonder antwoord gegroepeerd per afzender, projecten zonder
taak- of itembeweging in 14 dagen. Op Vandaag op maandag een blok
"Deze week" boven de agenda.

### 3.3 Kostenbewaking — beslist, bouwen
`_shared/claude.ts` `call()`: `usage.input_tokens` en `output_tokens` uit
het antwoord teruggeven; elke auditregel met `model` krijgt ze in `details`.
Instellingen → Logboek: maandtotaal tokens per model, bovenaan.

### 3.4 Wie is mij iets schuldig — beslist, bouwen
Pagina-onderdeel op Taken, tab "Wacht op antwoord": groeperen op het
e-mailadres uit de gekoppelde bron, oudste eerst, met dagen wachtend.

### 3.5 Bricks-export via mail — DENKWERK NOG NODIG
Open vragen: bijlagen ophalen vergt `attachments.get`; de bijlage gaat door
`leesBestand` (browsercode) — die moet naar Deno of het bestand moet
onverwerkt in Storage en de app verwerkt hem bij openen. En het
privacyfilter kent geen bijlagen. Niet bouwen voor dit is uitgedacht.

### 3.6 Portaalstatus in de cockpit — DENKWERK NOG NODIG
Vergt een afspraak met het Roosendael-project: welke statusvelden, welk
endpoint, welke sleutel. Eerst ontwerpen in dat repo, dan hier ophalen.

### 3.7 Nieuwsbrieven-digest, agenda-voorbereiding, Outlook
Later; geen open ontwerpvragen van betekenis, maar ook geen haast.

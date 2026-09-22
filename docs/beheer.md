# Beheer van BennaAssistent

Wat er draait, waar het staat, en wat je doet als er iets misgaat. Geschreven
voor het moment waarop dit gesprek er niet meer is.

## Waar alles staat

De webapp draait op Vercel (project `benna-assistent`), de rest op het
Supabase-project `cohgbocslfgxfshelsts` in eu-west-1. De code staat in deze
repository; het schema staat als migratie in `src/assistant/supabase/migrations`
en niet meer alleen in Supabase.

## Geheimen

Bij de Edge Functions (Supabase → Edge Functions → Secrets):

| Naam | Waarvoor |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | de functies praten met de database |
| `ANTHROPIC_API_KEY` | triage, concepten, meedenken |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | de koppeling met Gmail, Agenda en Drive |
| `CRON_SECRET` | wat de nachtploeg meestuurt om binnen te komen |
| `APP_URL` | waar de OAuth-terugkeer je heen stuurt |

In de Vault van de database (`vault.secrets`):

| Naam | Waarvoor |
|---|---|
| `cron_secret` | dezelfde waarde als `CRON_SECRET` hierboven — lopen ze uiteen, dan geeft elke nachtelijke aanroep 401 |
| `functions_url` | `https://<ref>.supabase.co/functions/v1`, zodat er in geen enkele cronopdracht meer een projectnaam met de hand hoeft |

Bijwerken gaat met `select vault.update_secret(<id>, '<waarde>')`.

In GitHub (Settings → Secrets → Actions): `SUPABASE_ACCESS_TOKEN` en
`SUPABASE_DB_PASSWORD`. Zonder die twee kunnen de Actions niet uitrollen en
geen back-up maken.

## De nachtploeg

| Wanneer | Wat |
|---|---|
| elke tien minuten | mail ophalen, triageren, voorstellen maken |
| elk uur (:05) | kijken of er antwoord kwam op wat je hebt verstuurd |
| elk uur (:20) | gewijzigde documenten in Drive vastleggen |
| elke werkdag 06.30 | dagoverzicht maken |
| maandag 07.00 | weekoverzicht maken |
| elke nacht 03.15 | oude gegevens wissen (zie hieronder) |
| elke nacht 03.30 | mislukte triage inhalen |
| elke nacht 05.05 | terugkerend onderhoud inplannen |

De tijden in de tabel zijn Amsterdams; in `cron.job` staan ze in UTC. Hoe het
ze vergaat zie je op Instellingen onder *Nachtploeg* — dat blokje leest
`cron_gezondheid()`.

## Wat we bewaren, en hoe lang

`ruim_op()` draait elke nacht en wist: mailitems zonder gekoppelde taak ouder
dan negentig dagen, dagoverzichten ouder dan dertig dagen, logregels ouder dan
een jaar, en verlopen koppelpogingen. Dit hoort ook in het verwerkingsregister
van de praktijk te staan.

## Als er iets misgaat

**Een bron staat op rood op Instellingen.** De foutmelding staat erbij. Bij
"Geen token voor bron" is de Google-koppeling vervallen: opnieuw koppelen via
de knop. Bij een 401 van een Edge Function lopen `CRON_SECRET` en het
Vault-geheim `cron_secret` uiteen.

**Een ronde faalt herhaaldelijk.** Kijk in de logs van de betreffende functie
in Supabase. Eén losse mislukte ronde is geen ramp: de ophaalronde slaat een
bericht dat niet te verwerken is over en `retriage` haalt het 's nachts in.

**De app laadt niet na een uitrol.** De service worker bewaart alleen bestanden
met een hash in de naam; de pagina komt altijd vers van het net. Een harde
verversing helpt dus zelden — kijk eerst naar de uitrol in Vercel.

**Terugzetten uit een back-up.** De nachtelijke Action zet een `schema.sql.gz`
en een `gegevens.sql.gz` als privérelease in deze repository. Terugzetten doe
je met `psql` op een leeg project, schema eerst.

## Een bewuste uitzondering

`cron_gezondheid()` draait met definer-rechten en is aan te roepen door elke
ingelogde gebruiker. Dat moet ook: `cron.job_run_details` is van postgres en
een gewone gebruiker komt er niet bij. De functie geeft alleen taaknamen,
roosters, tijdstippen en foutmeldingen van de eigen nachtploeg terug — geen
opdrachten en geen gegevens. Zolang dit een app voor één persoon is, is dat de
juiste ruil. Komt er ooit een tweede gebruiker bij, dan moet deze functie
mee-verhuizen naar iets dat per eigenaar filtert.

## Lokaal werken

    cd src/assistant
    npm ci
    npm run dev          # de app
    npm test             # de toetsen van de frontend
    deno test --allow-env --allow-net supabase/functions/_shared

De toets op de planner (`supabase/tests/plan_terugkerend.sql`) heeft een
database nodig; hij maakt zijn eigen proefrijen en ruimt ze weer op.

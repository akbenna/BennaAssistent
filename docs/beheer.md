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
| `APP_URL` | waar de OAuth-terugkeer je heen stuurt, en waar links naar een notitie naartoe wijzen |
| `OPENAI_API_KEY` | Notities: uitschrijven en samenvatten. Een sleutel uit een **nieuw** project met regio Europa; een bestaand project is niet om te zetten |
| `OPENAI_BASE_URL` | standaard `https://eu.api.openai.com/v1`; alleen aanpassen als je bewust buiten de EU wilt |
| `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_TEXT_MODEL` | standaard `gpt-4o-transcribe-diarize` en `gpt-5-mini` |
| `MISTRAL_API_KEY` | Notities: uitval voor het uitschrijven als OpenAI wegvalt (EU). Leeg laten mag; dan is er geen uitval |
| `SPRAAK_VOLGORDE`, `TEKST_VOLGORDE`, `BEELD_VOLGORDE` | welke AI-dienst eerst; zie `docs/ai-diensten.md`. Leeg is de standaard: OpenAI eerst |

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
| elke twee minuten | opnames van Notities uitschrijven en samenvatten; audio na de bewaartermijn wissen |

De tijden in de tabel zijn Amsterdams; in `cron.job` staan ze in UTC. Hoe het
ze vergaat zie je op Instellingen onder *Nachtploeg* — dat blokje leest
`cron_gezondheid()`.

## Wat we bewaren, en hoe lang

`ruim_op()` draait elke nacht en wist: mailitems zonder gekoppelde taak ouder
dan negentig dagen, dagoverzichten ouder dan dertig dagen, logregels ouder dan
een jaar, en verlopen koppelpogingen. Dit hoort ook in het verwerkingsregister
van de praktijk te staan.

Voor Notities wist `notitie-verwerk` de audio, omdat bestanden in Storage niet
met SQL te wissen zijn: na goedkeuren volgens de ingestelde bewaartermijn
(standaard dertig dagen), en zeven dagen na een weigering door het
privacyfilter. Transcript en samenvatting blijven tot je de notitie zelf wist.

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

## Notities

Een opname gaat in delen van vijf minuten naar de bucket `opnames`, elk deel
in blokken van dertig seconden. `notitie-verwerk` schrijft elk deel uit zodra
het compleet is, dus al tijdens de vergadering, en vat de notitie samen als alle
delen uit zijn. Er is geen ffmpeg: de app levert bestanden af die de
spraakdienst rechtstreeks aanneemt, en knipt een WAV of een lange spraakmemo
zelf op.

Wat het kost: OpenAI rekent voor uitschrijven ongeveer 0,6 dollarcent per
minuut, een vergadering van twee uur dus zo'n zeventig cent, plus enkele
centen voor de samenvatting. Mistral en Claude kosten alleen iets als OpenAI
uitvalt. Er draait geen aparte server.

Na het uitrollen moet Google **één keer opnieuw gekoppeld** worden op
Instellingen. Er is een recht bijgekomen (`drive.file`: alleen bestanden die de
assistent zelf maakt) om het Google Doc van een notitie te kunnen aanmaken.
Tot dat gebeurt, staat bij elke notitie dat er geen Doc kon worden gemaakt; de
rest werkt gewoon.

**Congressen.** Foto's van slides staan in dezelfde bucket als de audio
(`{eigenaar}/{notitie}/foto-0001.jpg`) en worden niet met de audio gewist: ze
horen bij de notulen. Ze gaan langs het privacyfilter; een foto met
patiëntgegevens wordt niet gelezen en telt niet mee. Bronnen nazoeken gebruikt
PubMed (E-utilities) en Crossref, allebei zonder sleutel en zonder kosten.

**Een notitie blijft op 'Wordt uitgeschreven' staan.** Kijk in de logs van
`notitie-verwerk`. Een deel wordt drie keer geprobeerd; daarna staat de reden
in de notitie en kun je het opnieuw proberen.

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

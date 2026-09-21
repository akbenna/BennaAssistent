# BennaAssistent

Persoonlijke assistent voor één gebruiker: nieuwe mail wordt elke tien minuten opgehaald,
gefilterd op privacy, omgezet in taakvoorstellen, en een antwoord gaat pas de deur uit
als jij erop tikt.

Deze map bevat twee delen die los van elkaar draaien:

| Deel | Waar | Wat |
| --- | --- | --- |
| Motor | `supabase/functions` | Zeven Edge Functions: koppelen, ophalen, opvolgen, dagoverzicht, concept, versturen |
| Dashboard | `src`, `public` | De webapp (PWA) waarin je alles ziet en goedkeurt |

De database staat in Supabase-project `cohgbocslfgxfshelsts`; schema 0001 en 0002 zijn
daar al uitgevoerd.

## Dashboard lokaal draaien

```bash
cd src/assistant
npm install
cp .env.example .env     # bevat de publieke sleutel; niet geheim
npm run dev
```

Inloggen gaat met een inloglink per mail. Zorg dat in Supabase onder
**Authentication → URL configuration** zowel `http://localhost:5173` als het
productie-adres bij *Redirect URLs* staan.

Handige scripts:

```bash
npm run typecheck   # TypeScript zonder build
npm run build       # iconen, typecheck en productiebundel in dist/
npm run icons       # genereert alleen de PWA-iconen
```

De iconen in `public/icons` worden bij elke build aangemaakt en staan daarom niet
in de repository.

## Publiceren op Vercel

Één keer instellen, daarna publiceert elke push naar GitHub vanzelf:

1. Importeer de repository in Vercel.
2. Zet **Root Directory** op `src/assistant`. Framework *Vite* en de build-instellingen
   worden dan uit `vercel.json` gelezen.
3. Zet twee omgevingsvariabelen (Production én Preview):
   `VITE_SUPABASE_URL` en `VITE_SUPABASE_PUBLISHABLE_KEY`, met de waarden uit `.env.example`.
4. Noteer het adres dat Vercel teruggeeft. Dat adres heb je op drie plaatsen nodig:
   als `APP_URL` bij de Edge Functions, bij *Redirect URLs* in Supabase, en als
   geautoriseerde herkomst in Google Cloud Console.

## Motor uitrollen

De Edge Functions staan nog niet in het Supabase-project. Uitrollen gaat met de CLI,
omdat die `supabase/config.toml` leest; daarin staat per functie of een JWT vereist is.
Dat onderscheid is wezenlijk: `send-draft` mag alleen met jouw inlog werken, terwijl
`gmail-ingest` door de planner wordt aangeroepen.

```bash
cp supabase/functions/.env.example supabase/functions/.env   # vul je sleutels in
supabase secrets set --env-file supabase/functions/.env --project-ref cohgbocslfgxfshelsts
supabase functions deploy --project-ref cohgbocslfgxfshelsts
```

## Waar de grenzen liggen

- Versturen kan uitsluitend via `send-draft`, met jouw sessie. Geen enkele geplande taak
  heeft een verzendpad.
- Mail die onder een privacyfilter valt wordt niet gelezen en niet aan een taalmodel
  voorgelegd. Alleen het domein van de afzender en de reden van uitsluiting worden bewaard.
- Voorstellen staan pas op je lijst nadat jij ze accepteert.

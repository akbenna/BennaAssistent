# Welke AI-dienst eerst, en waarom

De volgorde staat in drie geheimen bij de Edge Functions (Supabase, Edge
Functions, Secrets). Wisselen is één regel, zonder nieuwe uitrol:

| Geheim | Standaard | Waarvoor |
|---|---|---|
| `SPRAAK_VOLGORDE` | `openai,mistral` | opnames uitschrijven |
| `TEKST_VOLGORDE` | `openai,claude` | samenvatten en bronnen beoordelen; `mistral` mag er ook in |
| `BEELD_VOLGORDE` | `openai,claude` | foto's van slides lezen; `mistral` mag er ook in |
| `WEB_VOLGORDE` | `openai,claude` | de congres-agent: zoeken op het web; alleen deze twee kunnen dat |

Een dienst zonder sleutel wordt overgeslagen. De eerste die antwoordt wint; als
er een uitviel, staat dat onderaan de notitie. Mail-triage, concepten en
meedenken lopen buiten deze volgorde en blijven op Claude.

Het afgesproken uitgangspunt: OpenAI eerst, via het EU-project; Mistral (EU)
en Claude als uitval, zodat Claude niet de lange transcripten draagt.

Zoeken op het web gaat bij OpenAI via het gereedschap `web_search` van de
Responses-API, op hetzelfde adres als de rest (`OPENAI_WEB_BASE_URL` kan het
apart zetten, `OPENAI_WEB_MODEL` het model). Weigert het EU-project dat, dan
neemt Claude het over met `web_search_20260209` (`CLAUDE_WEB_MODEL`, standaard
het schrijfmodel). Beide rekenen per zoekopdracht plus de gelezen tekst.

## Prijzen, stand oktober 2026

Lijstprijzen per minuut audio, zonder kortingen. Gecontroleerd via
vergelijkingssites; voor de echte rekening telt alleen de prijspagina van de
dienst zelf.

| Dienst | Prijs per minuut | Opmerking |
|---|---|---|
| OpenAI `gpt-4o-transcribe-diarize` | $0,006 | Sprekers en jouw stem bij naam; dit draait nu |
| OpenAI `gpt-4o-mini-transcribe` | $0,003 | Half zo duur, maar zonder sprekers |
| Mistral Voxtral Mini Transcribe | $0,003 | EU; zonder stemreferentie |
| AssemblyAI Universal-2 | $0,0025 | Niet aangesloten |
| ElevenLabs Scribe v2 | ongeveer $0,0037 | Niet aangesloten |
| Deepgram Nova-3 (batch) | $0,0043 | Niet aangesloten |

Wat het voor jou betekent: een vergadering van twee uur kost met de huidige
volgorde ongeveer zeventig dollarcent aan uitschrijven, plus enkele centen
voor de samenvatting. Mistral eerst zou dat halveren, maar dan verlies je de
herkenning van je eigen stem, en daarmee de betrouwbaarheid van welke
actiepunten van jou zijn.

## Wanneer wisselen

Wissel pas als het verschil groot én blijvend is (een factor twee of meer) en
als de goedkopere dienst doet wat je nodig hebt: sprekers, je eigen stem,
Nederlands. Doe na een wissel één proefopname en lees hem na; de kwaliteit
van uitschrijven verschilt per dienst meer dan de prijs doet vermoeden.

Bronnen: [OpenAI-tarieven via vexascribe](https://vexascribe.com/compare/best-transcription-api-for-developers),
[vergelijking speech-to-text 2026](https://convertaudiototext.com/blog/speech-to-text-api-pricing-2026),
[Voxtral Mini Transcribe op OpenRouter](https://openrouter.ai/mistralai/voxtral-mini-transcribe/pricing).

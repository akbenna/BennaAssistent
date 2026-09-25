# BennaAssistent

Een persoonlijke secretaresse voor dr. A. Bennaghmouch, huisarts en
praktijkhouder. Mail wordt taak, taak wordt antwoord — en niets gaat de deur
uit zonder dat er iemand op heeft geklikt.

## Wat het doet

Elke tien minuten leest de assistent nieuwe mail, legt vast wat er binnenkwam
en stelt taken voor waar iets van je gevraagd wordt. Jij beslist wat op je
lijst komt. Bij een taak kan hij een concept schrijven, met je meedenken over
de aanpak, en na het versturen bijhouden of er antwoord komt. Daarnaast houdt
hij het terugkerende onderhoud van het praktijkportaal bij en zet het op tijd
op je lijst — ook de rapportenronde uit VIPLive en Bricks, die op het portaal
wordt ingelezen.

## Wat het met opzet níét doet

Het model stelt voor, de mens legt vast. Er bestaat geen enkele automatische
schrijfactie naar een taak toe en geen mail vertrekt zonder bevestiging.

En het leest geen patiëntgegevens. Een privacyfilter draait vóór elke
modelaanroep: zorgmaildomeinen, patiëntsignalen in de tekst en getallen die de
BSN-elfproef doorstaan sluiten een bericht uit. Die regels staan in de code en
zijn niet via de database uit te zetten. Van een uitgesloten bericht bewaart de
database alleen dát het is overgeslagen en waarom — de database weigert zelfs
een samenvatting bij zo'n rij.

## Hoe het in elkaar zit

Een PWA (Vite, React, TypeScript, geen UI-bibliotheek) op Vercel, met Supabase
erachter: Postgres met rijbeveiliging op eigenaar, Edge Functions in Deno voor
alles wat met Google of Claude praat, en pg_cron voor de nachtploeg. De
Google-tokens staan in de Vault en zijn alleen via twee functies met
definer-rechten te benaderen.

    src/assistant/
      src/                  de webapp
      supabase/functions/   de serverfuncties (Deno)
      supabase/migrations/  het schema, als bestand
      supabase/tests/       toetsen die een database nodig hebben

Beheer, secrets en wat er 's nachts draait: zie `docs/beheer.md`.
Wat er nog op de rol staat: `docs/bouwplan.md`.

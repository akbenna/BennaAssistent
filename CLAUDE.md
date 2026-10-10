# Voor wie hier verder bouwt

## Kosten

Sinds 10 oktober 2026 werken we zuinig, en dat is een ontwerpregel en geen
voornemen. Bij elk alternatief dat we bedenken hoort de vraag wat het kost: per
aanroep, per maand, en wie het betaalt.

**Wat de gebruiker zelf start, gaat via het abonnement.** Een analyse, een
beoordeling of een grote import die op een knop begint, maakt een kant-en-klare
vraag met de feiten erin, die in één handeling naar Claude gaat. Alleen wat
zelfstandig moet draaien (een cron, een binnenkomende mail, een consult) gaat via
de API.

**Het kleinste model dat de kwaliteit haalt.** Het kleinste model voor sorteren,
classificeren en korte teksten, het middelste voor schrijfwerk, het grootste
alleen waar gemeten is dat het verschil maakt. Medische uitvoer wordt niet naar
een kleiner model gezet zonder proef naast de huidige.

**Vaste instructies worden gecachet**, met het vaste deel vóór alles wat per
aanroep verschilt. Liggen aanroepen verder dan vijf minuten uit elkaar, dan de
cache van een uur.

**Geen aanroep die niets oplevert.** Een cron roept de API alleen aan als er iets
nieuws is; een uitkomst die een dag geldig is wordt een dag onthouden; werk dat
al gedaan is wordt niet elke nacht overgedaan.

**Testen kost niets.** Proeven draaien tegen vastgelegde antwoorden, niet tegen
de echte API.

**Eén sleutel per app.** Een nieuwe app krijgt een eigen sleutel, zodat de
kosten per app af te lezen zijn en één sleutel in te trekken is zonder de rest
stil te leggen.

**Een voorstel met AI-kosten noemt een schatting**, per aanroep en per maand, en
zegt dat het een schatting is tot het gemeten is.


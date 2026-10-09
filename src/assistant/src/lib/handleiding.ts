/**
 * DE HANDLEIDING, IN DE APP ZELF
 *
 * Een losse handleiding is een bestand dat je één keer opent en daarna nooit
 * meer terugvindt. Deze staat achter het vraagteken in de kop en toont altijd
 * het hoofdstuk van de pagina waar je op dát moment staat — met onderaan de
 * weg naar de andere hoofdstukken, zodat het ook als geheel te lezen is.
 *
 * De tekst legt uit waaróm iets zo werkt, niet alleen waar je moet klikken.
 * Waar je klikt zie je zelf; waarom een voorstel geen taak is, of waarom code
 * 11119 apart wordt geteld, niet.
 */

export interface Deel {
  kop: string;
  tekst: string[];
}

export interface Hoofdstuk {
  pad: string;
  titel: string;
  /** Eén zin die zegt waarvoor deze pagina er is. */
  kern: string;
  delen: Deel[];
}

export const HOOFDSTUKKEN: Hoofdstuk[] = [
  {
    pad: "/",
    titel: "Vandaag",
    kern: "Wat er vandaag van je gevraagd wordt, en hoe je ervoor staat.",
    delen: [
      {
        kop: "De gekleurde kop",
        tekst: [
          "De kleur is de stand van zaken en niet de smaak van de dag. Rood zodra er een deadline verlopen is, amber zodra er iets op je ligt te wachten, groen als je vandaag iets hebt afgerond en er niets meer ligt, en rustig grijsgroen als er niets is.",
          "De vier tellers eronder zijn knoppen: ze brengen je naar de lijst waar dat getal vandaan komt. Het streepjespatroon daaronder is veertien dagen afrondingen. Eén dag zegt niets over hoe je ervoor staat; veertien dagen wel.",
        ],
      },
      {
        kop: "Deze week",
        tekst: [
          "Op maandagochtend maakt de assistent een weekoverzicht, en dat blijft de hele week staan. Het toont de deadlines van deze week, welk terugkerend onderhoud verschijnt, op hoeveel verstuurde mails nog geen antwoord kwam, en welke projecten veertien dagen niets van zich lieten horen. De deadlines zijn altijd die van nu: wat je afrondt verdwijnt, wat er in de loop van de week bijkomt verschijnt.",
          "Dat laatste is waarvoor het blok bestaat. Een dossier dat stilvalt merk je nergens aan — er gebeurt immers niets. Eén keer per week zien dat het er nog is, is genoeg om te beslissen of dat erg is.",
        ],
      },
      {
        kop: "Agenda en documenten",
        tekst: [
          "De agenda komt uit je Google-agenda en wordt elke werkdag om half zeven 's ochtends opgehaald voor het dagoverzicht. Zie je hier niets terwijl er wel afspraken staan, kijk dan op Instellingen of de koppeling nog werkt.",
          "Bij elke afspraak staat Voorbereiden. Daaronder verschijnt wat er de vorige keer gebeurde: de datum en titel van het vorige overleg, wat er toen besloten is, welke vragen nog openstaan, wat jij zelf zou doen, en welke taken uit eerdere overleggen nog lopen. De assistent herkent het project aan de projectnaam of een trefwoord in de titel van de afspraak; zonder project zoekt hij een eerder overleg met precies dezelfde titel. Er komt geen taalmodel aan te pas: het is opzoeken in je eigen notities, dus direct en gratis. Onderaan staat de opnameknop, en een opname die je daar start hangt meteen aan het goede project.",
          "Onder Documenten staan bestanden die in Drive zijn gewijzigd of met je gedeeld. De assistent leest ze niet: hij legt alleen vast dát er iets veranderd is, door wie, en waar het staat. Er wordt geen taak van gemaakt — een document dat verandert vraagt zelden iets van je, en een voorstel per gewijzigd bestand zou het voorstellenscherm onbruikbaar maken.",
        ],
      },
      {
        kop: "Doorsteek",
        tekst: [
          "De tegels naar je andere apps: de beheerpagina's van het praktijkportaal en ProVita Care. Eén blik, één klik naar de juiste plek in plaats van zoeken in je bladwijzers.",
          "Je beheert ze zelf onder Instellingen → Doorsteek. Een adres dat met één schuine streep begint is een pagina binnen deze app en opent hier; de rest opent in een nieuw tabblad.",
        ],
      },
    ],
  },
  {
    pad: "/notities",
    titel: "Notities",
    kern: "Een vergadering, overleg of telefoongesprek opnemen of een notitie typen, wat eruit komt meteen omzetten in werk, en later je notities iets vragen.",
    delen: [
      {
        kop: "Opnemen",
        tekst: [
          "Eén tik op de rode knop, op Vandaag of hier, en de assistent neemt op. Elke dertig seconden gaat er een stuk naar de server, zodat een telefoon die uitvalt hooguit een halve minuut kost. Je kunt intussen gewoon door de app bladeren; de balk bovenaan laat zien dat de opname loopt. Laat het scherm aan: op een iPhone stopt de microfoon als je het vergrendelt.",
          "Met Typ in de balk bovenaan schrijf je tijdens de opname je eigen aantekeningen, elk met het moment erbij. Ze wegen zwaarder dan wat het model uit het gesprek haalt: \"navragen bij de accountant\" wordt een actiepunt van jou, \"belangrijk: termijn 1 december\" komt terug in de samenvatting. Ze staan ook los in de notitie en in het Google Doc, onder Mijn aantekeningen.",
          "Een spraakmemo, een gespreksopname van de iPhone of een WAV uit SwyxIt verwerk je met Audiobestand verwerken. Zeg aan het begin van elk gesprek dat je opneemt.",
        ],
      },
      {
        kop: "Wat er daarna gebeurt",
        tekst: [
          "Het gesprek wordt in stukken van vijf minuten uitgeschreven, al tijdens de vergadering, door OpenAI, met Mistral als uitval. OpenAI verwerkt in de Verenigde Staten; dat is een bewuste keuze, om de kwaliteit. Mistral verwerkt in de EU, maar onderscheidt geen sprekers. Jouw stem wordt herkend aan de acht seconden die je onder Stem, naam en bewaartermijn opneemt. Andere sprekers krijgen een letter die de hele opname dezelfde blijft: de stukken van vijf minuten overlappen een paar seconden, en wie op die naad spreekt, wordt in het volgende stuk herkend. Blijkt uit het gesprek wie het is, omdat iemand bij naam wordt aangesproken of zich voorstelt, dan staat de naam erbij. Daarna maakt een taalmodel er een verhalende samenvatting van met besluiten, actiepunten, afspraken en open vragen: OpenAI eerst, Claude als uitval. Het project kiest de assistent uit je agenda en uit het gesprek, tenzij je het vooraf hebt gekozen.",
          "Jouw actiepunten worden voorstellen, met de vergadering als herkomst. Ze staan pas op je lijst als je ze op Voorstellen accepteert. Wat bij een ander ligt, zet je met Volg op als eigen taak neer. Een vervolgafspraak zet je met In agenda in je Google Agenda. En er komt een Google Doc in de map Notities/<project> van je Drive; daarvoor moet Google één keer opnieuw worden gekoppeld.",
        ],
      },
      {
        kop: "Congressen, symposia en webinars",
        tekst: [
          "Kies vóór het opnemen Congres of webinar. De notitie wordt dan wetenschappelijk: per spreker de kernboodschappen en de onderbouwing zoals die werd gebracht, de relevantie voor de huisartsenpraktijk en het kaderwerk, en kanttekeningen. Tijdens de opname staan er in de balk bovenaan, naast Typ, twee knoppen: Slide maakt een foto van wat er op het scherm staat, de ster markeert een moment dat je wilt terugvinden. Allebei krijgen ze het moment in de opname mee; een slide wordt al gelezen terwijl de lezing doorloopt.",
          "Op de slides en in het gesprek zoekt de assistent naar genoemde studies. Vindt hij er, dan vraagt hij of hij ze moet nazoeken. Zeg je ja, dan zoekt hij ze op in PubMed, legt elke bewering naast het abstract en zet er een oordeel bij: bevestigd, genuanceerd, afwijkend of niet te beoordelen. De bron en de citatie komen van PubMed zelf; het model leest alleen het abstract, en zonder abstract geeft het geen oordeel.",
        ],
      },
      {
        kop: "Notitie zonder opname",
        tekst: [
          "Onder Notitie typ je wat je wilt vastleggen: een gedachte, een afspraak bij de koffieautomaat, wat er op het whiteboard stond. Een foto van dat whiteboard of een flipover kan erbij, en een link naar een artikel ook. De assistent haalt de tekst van dat artikel op, alleen van een gewone webpagina: wat achter een inlogscherm zit of pas in de browser wordt opgebouwd, lukt niet, en dan staat dat bij de link.",
          "Daarna gaat de notitie door dezelfde verwerking als een opname: het privacyfilter, een samenvatting naar verhouding (drie regels worden geen pagina), taken als voorstel, en een Google Doc in de projectmap. Wat jij schreef is leidend; foto's en artikel zijn achtergrond.",
        ],
      },
      {
        kop: "Labels en verwante notities",
        tekst: [
          "Naast het project kan een notitie labels hebben, zoals poh, financiering of diabetes. Geef je er zelf geen, dan stelt de assistent er een paar voor; geef je ze wel, dan blijven ze zoals jij ze zette. Op de lijst filter je erop, en onderaan een notitie staan de notities die een label delen, nieuwste eerst.",
        ],
      },
      {
        kop: "Vraag het je notities",
        tekst: [
          "Stel een vraag in gewone taal, bijvoorbeeld \"wat spraken we met de zorggroep af over de POH-uren?\". De database zoekt eerst de notities die het best passen; alleen die gaan naar het taalmodel, met de samenvatting, de besluiten en de stukken transcript waar je woorden in vallen. Het antwoord komt uitsluitend uit je eigen notities, met achter elke bewering het nummer van de notitie, en daaronder de notities zelf met een letterlijk citaat.",
          "Staat het er niet in, dan zegt de assistent dat, en vindt het zoeken niets, dan wordt er geen taalmodel aangeroepen. Alleen afgeronde notities doen mee.",
        ],
      },
      {
        kop: "Nascholingslogboek",
        tekst: [
          "Elke notitie van het soort Congres of webinar staat in het nascholingslogboek, te openen vanaf de lijst met notities. Per jaar zie je hoeveel bijeenkomsten het waren, hoeveel uur je opnam en hoeveel accreditatiepunten je hebt ingevuld. Organisator en punten vul je op de notitie zelf in; de uren zijn de opnametijd en dus niet per se de lengte van het programma.",
          "Voor de herregistratie als huisarts telt 200 uur geaccrediteerde nascholing in vijf jaar, en dan wat de organisator in GAIA heeft bijgeschreven. Dit logboek vervangt GAIA niet. Het is je eigen administratie ernaast, met wat GAIA niet heeft: de onderwerpen, wat het voor de praktijk betekent en hoe de genoemde studies het hielden bij het nazoeken. Met Bewaar als CSV open je het in Excel; met Afdrukken maak je er een PDF van.",
        ],
      },
      {
        kop: "Privacy",
        tekst: [
          "Notities zijn voor bestuur, kaderwerk en zakelijk overleg. Consulten en alles met patiëntgegevens blijven bij SmartVoice. Over het transcript draait hetzelfde privacyfilter als over mail. Slaat het aan, dan wordt er niets samengevat en wacht de notitie op jou: lees het transcript, en verwijder hem of bevestig dat het een vals alarm was. Die bevestiging wordt vastgelegd.",
          "Na Goedkeuren loopt de bewaartermijn van de audio, standaard dertig dagen. Daarna wordt alleen de audio gewist; transcript en samenvatting blijven.",
        ],
      },
    ],
  },
  {
    pad: "/onderzoek",
    titel: "Congres-agent",
    kern: "Een congres laten uitzoeken: wat er gepresenteerd is, wat ertoe doet voor de eerste lijn, en de thema's die jij kiest uitgewerkt tot notities.",
    delen: [
      {
        kop: "Hoe het werkt",
        tekst: [
          "Noem een congres, bijvoorbeeld ESC Congress 2026, en zet er eventueel de website en waar je in het bijzonder op let bij. De agent zoekt op internet het programma, de hotline- en late-breaking sessies, nieuwe richtlijnen, gelijktijdige publicaties en de verslagen erover. Na een paar minuten legt hij acht tot twaalf thema's voor, met bij elk wat er gepresenteerd is, waarom het voor jou als huisarts en kaderarts hart- en vaatziekten wel of niet ertoe doet, en de pagina's waar het staat.",
          "Jij kiest. Vink aan wat je uitgewerkt wilt hebben en schrijf erbij wat je er in het bijzonder over wilt weten. Onder Bespreken stel je de agent vragen; hij zoekt opnieuw als dat nodig is, en wat er nieuw bij komt, zet hij als thema in de lijst.",
          "Met Uitwerken maakt de agent van elk gekozen thema een eigen notitie: de studie of richtlijn, opzet, populatie, eindpunten en de cijfers zoals de bron ze geeft, wat het betekent naast de NHG-standaard, en de kanttekeningen. Die notities staan tussen je andere notities, doen mee met zoeken en Vraag het je notities, en komen als Google Doc in de map Wetenschap/<congres> in je Drive. Ze tellen niet mee in het nascholingslogboek, want je was er niet.",
        ],
      },
      {
        kop: "Hoe betrouwbaar het is",
        tekst: [
          "De agent mag niets schrijven dat niet in een gevonden pagina staat, en zegt bij elk thema of het een publicatie, een congrespresentatie, een persbericht of een nieuwsbericht is. Is een congres nog niet geweest, dan krijg je het programma en geen uitkomsten. De publicaties die hij bij een uitwerking noemt, worden daarna vanzelf opgezocht in PubMed en naast het abstract gelegd, met een oordeel per bewering: bevestigd, genuanceerd, afwijkend of niet te beoordelen.",
          "Het blijft een samenvatting door een taalmodel van wat er op internet staat. Voor een beslissing in de praktijk lees je de publicatie zelf; de notitie zegt je welke, en waar je moet kijken.",
          "Zoeken op internet gaat via OpenAI, met Claude als uitval. Een verkenning en elk uitgewerkt thema kosten naar schatting enkele tientallen dollarcenten aan zoeken en tekst; het precieze bedrag staat op je rekening bij OpenAI of Anthropic.",
        ],
      },
    ],
  },
  {
    pad: "/voorstellen",
    titel: "Voorstellen",
    kern: "Wat de assistent in je mail vond en wat hij denkt dat je ermee moet.",
    delen: [
      {
        kop: "Hoe een voorstel ontstaat",
        tekst: [
          "Elke tien minuten haalt de assistent nieuwe mail op. Wat binnenkomt wordt eerst opgeslagen en daarna aan Claude voorgelegd met één vraag: moet de ontvanger hier zelf iets doen? Alleen als het antwoord ja is wordt het een voorstel, met een titel die met een werkwoord begint en een deadline die alleen wordt genoemd als hij letterlijk in de mail staat.",
          "Niets hiervan staat op je lijst tot jij het accepteert. Dat is de hele bedoeling van dit scherm: de assistent stelt voor, jij beslist. Wat je wegklikt komt niet terug.",
        ],
      },
      {
        kop: "De vier knoppen",
        tekst: [
          "Op mijn lijst maakt er een gewone taak van. Morgen schuift hem een dag op — en zet hem daarmee ook op je lijst, want een voorstel dat je uitstelt heb je impliciet geaccepteerd. Niet doen laat hem vervallen. Onder Meer zitten de dingen die je zelden nodig hebt: volgende week, met voorrang, de mail openen in Gmail, of hem meteen aan een project hangen.",
        ],
      },
      {
        kop: "Een afzender uitsluiten",
        tekst: [
          "Onderaan Meer kun je een afzender of een heel domein voortaan laten overslaan. Dat is geen opruimactie maar een privacyregel: hij komt in dezelfde tabel terecht die het filter op de server leest, en werkt dus vanaf de volgende ophaalronde. Post van die afzender wordt daarna niet meer gelezen, niet samengevat en nooit meer aan een taalmodel voorgelegd — alleen het domein en de reden blijven bewaard. Vandaar de bevestiging.",
        ],
      },
      {
        kop: "Wat er nooit langskomt",
        tekst: [
          "Mail met patiëntgegevens haalt dit scherm niet. Een filter draait vóór elke modelaanroep en sluit berichten uit van zorgmaildomeinen, berichten met patiëntsignalen in de tekst, en berichten met een getal dat de elfproef van een BSN doorstaat. Die regels staan in de code en zijn niet via de app uit te zetten.",
        ],
      },
    ],
  },
  {
    pad: "/taken",
    titel: "Taken",
    kern: "Alles wat loopt, en het werkblad per taak.",
    delen: [
      {
        kop: "De tabbladen",
        tekst: [
          "Nu toont wat vandaag verloopt of al verlopen is. Open is alles wat op je lijst staat. Wacht op antwoord zijn de mails die je hebt verstuurd en waar nog niets op terugkwam; Antwoord binnen zijn dezelfde, maar dan met een reactie die de assistent heeft gezien.",
          "Op het tabblad Wacht op antwoord staat bovenaan van wie je nog iets tegoed hebt, gegroepeerd per persoon en met de oudste bovenaan. Dat is de vorm die je vóór een vergadering nodig hebt: niet welke taak wacht, maar wat je nog van Van Dijk moet krijgen.",
        ],
      },
      {
        kop: "Meedenken",
        tekst: [
          "In het taakpaneel kan het model op drie manieren meedenken. Hak in stappen maakt van de taak hooguit vijf concrete handelingen. Vat de draad samen vertelt wat er is afgesproken, wat openstaat en bij wie de bal ligt. Geef drie invalshoeken geeft drie werkelijk verschillende manieren om te reageren, met wat je ermee wint of riskeert.",
          "Wat eruit komt wordt niet automatisch weggeschreven. Het staat op het scherm met een knop eronder om het als notitie te bewaren. De laatste twee vragen om een gekoppelde mailwisseling, en die gaat dan naar het model — zit er in één bericht van de draad iets dat op patiëntinformatie lijkt, dan wordt de hele aanvraag geweigerd en gaat er niets de deur uit.",
        ],
      },
      {
        kop: "Antwoorden en opvolgen",
        tekst: [
          "Schrijf een concept maakt een echt Gmail-concept in jouw mailbox, in antwoord op de laatste mail van de ander. Je kunt het in Gmail nog aanpassen; versturen kan hier. De toonknoppen herschrijven het concept en werken het meteen bij in Gmail — anders zou versturen de oude tekst pakken en merk je dat pas als de mail weg is.",
          "Na het versturen houdt de assistent de draad in de gaten. Komt er antwoord, dan springt de taak naar Antwoord binnen. Komt er na vijf werkdagen niets, dan verschijnt hij op Vandaag onder 'Hier kwam nooit antwoord op'.",
        ],
      },
    ],
  },
  {
    pad: "/projecten",
    titel: "Projecten",
    kern: "Waar je taken bij horen, en hoe nieuwe taken daar vanzelf terechtkomen.",
    delen: [
      {
        kop: "Trefwoorden en afzenders",
        tekst: [
          "Een project bundelt alles rond één dossier. De trefwoorden en afzenders die je eraan hangt bepalen waar nieuwe voorstellen vanzelf in landen: komt een mail van een adres dat je hebt opgegeven, of staat een trefwoord in het onderwerp of de tekst, dan krijgt het voorstel dat project mee.",
          "Het eerste project dat past wint, dus de volgorde waarin je ze aanmaakt telt. Houd de trefwoorden specifiek — 'overleg' vangt alles, 'bestemmingsplan' vangt wat je bedoelt.",
        ],
      },
      {
        kop: "Archiveren",
        tekst: [
          "Een gearchiveerd project blijft bestaan met zijn taken eraan, maar vangt geen nieuwe voorstellen meer en staat niet meer in de keuzelijsten. Voor een dossier dat afgerond is maar waarvan je de geschiedenis wilt houden.",
        ],
      },
    ],
  },
  {
    pad: "/instellingen",
    titel: "Instellingen",
    kern: "Wat er onder de motorkap draait, en wat je eraan kunt bijstellen.",
    delen: [
      {
        kop: "Nachtploeg",
        tekst: [
          "Bovenaan staat hoe het de automatische taken vergaat: mail ophalen, antwoorden nakijken, Drive nakijken, de overzichten maken, het onderhoud inplannen en de oude gegevens wissen. Per taak zie je wanneer hij voor het laatst liep en wat er misging.",
          "Dit blokje bestaat omdat een storing anders onzichtbaar is. Een fout in de mailkoppeling stond ooit twintig rondes in de database voordat iemand hem op een telefoon zag staan. Groen is goed, amber is één misser, rood is twee of meer achter elkaar — en dan is het de moeite om te kijken.",
        ],
      },
      {
        kop: "Google en privacyfilters",
        tekst: [
          "Eén koppeling geeft toegang tot Gmail, Agenda en Drive. Het vernieuwingstoken staat versleuteld in een kluis en is alleen voor de serverfuncties leesbaar, niet voor de app in je browser.",
          "Onder Privacyfilters zet je zelf extra regels bij de vaste: een afzender, een heel domein, een Gmail-label of een woord in de tekst. Mail die daaronder valt wordt niet gelezen, niet samengevat en nooit aan een taalmodel voorgelegd. De vaste regels — zorgmaildomeinen, patiëntsignalen, de BSN-elfproef — staan in de code en kunnen hier niet uit.",
        ],
      },
      {
        kop: "Onderhoudsritme",
        tekst: [
          "Hier staat wat vanzelf terugkomt: de wekelijkse CSV-set voor zorgsignaal, de maandelijkse declaratiecheck, de jaarlijkse NZa-bijstelling. Elke nacht kijkt de database of er iets aan de beurt is en zet het als taak op je lijst, met de link naar de juiste pagina erbij.",
          "Valt een datum in het weekend, dan schuift hij naar de eerstvolgende werkdag in plaats van de hele periode over te slaan. Een ritme dat je niet gebruikt zet je hier uit; de rest loopt gewoon door.",
        ],
      },
      {
        kop: "Logboek en kosten",
        tekst: [
          "Het logboek toont wat de assistent heeft gedaan, met welk model. Daarboven staat wat de modellen deze maand hebben gekost, in tokens per model. Bewust geen euro's: de prijs per token verandert, en een verouderd bedrag is misleidender dan geen bedrag.",
        ],
      },
      {
        kop: "Account",
        tekst: [
          "Je wachtwoord wijzig je hier, en je zet hier de tweestapsverificatie aan. Dat laatste is de moeite: deze app kan namens jou mail versturen vanuit je eigen Gmail, en een code uit je telefoon maakt een gestolen wachtwoord waardeloos. Raak je je telefoon kwijt, dan is de inloglink per mail het vangnet.",
        ],
      },
    ],
  },
];

export function hoofdstukVoor(pad: string): Hoofdstuk | null {
  // Delen valt onder Taken: het is dezelfde vorm, alleen binnengekomen via het
  // deelmenu van de telefoon.
  const gezocht = pad === "/delen" ? "/taken" : pad.startsWith("/notities/") || pad === "/nascholing" ? "/notities" : pad.startsWith("/onderzoek/") ? "/onderzoek" : pad;
  return HOOFDSTUKKEN.find((h) => h.pad === gezocht) ?? null;
}

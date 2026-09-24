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
          "Op maandagochtend maakt de assistent een weekoverzicht, en dat blijft de hele week staan. Het toont de deadlines van deze week, welk terugkerend onderhoud verschijnt, op hoeveel verstuurde mails nog geen antwoord kwam, en welke projecten veertien dagen niets van zich lieten horen.",
          "Dat laatste is waarvoor het blok bestaat. Een dossier dat stilvalt merk je nergens aan — er gebeurt immers niets. Eén keer per week zien dat het er nog is, is genoeg om te beslissen of dat erg is.",
        ],
      },
      {
        kop: "Agenda en documenten",
        tekst: [
          "De agenda komt uit je Google-agenda en wordt elke werkdag om half zeven 's ochtends opgehaald voor het dagoverzicht. Zie je hier niets terwijl er wel afspraken staan, kijk dan op Instellingen of de koppeling nog werkt.",
          "Onder Documenten staan bestanden die in Drive zijn gewijzigd of met je gedeeld. De assistent leest ze niet: hij legt alleen vast dát er iets veranderd is, door wie, en waar het staat. Er wordt geen taak van gemaakt — een document dat verandert vraagt zelden iets van je, en een voorstel per gewijzigd bestand zou het voorstellenscherm onbruikbaar maken.",
        ],
      },
      {
        kop: "Doorsteek",
        tekst: [
          "De tegels naar je andere apps: de beheerpagina's van het praktijkportaal, ProVita Care, en de declaratiepagina hier. Eén blik, één klik naar de juiste plek in plaats van zoeken in je bladwijzers.",
          "Je beheert ze zelf onder Instellingen → Doorsteek. Een adres dat met één schuine streep begint is een pagina binnen deze app en opent hier; de rest opent in een nieuw tabblad.",
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
    pad: "/declaraties",
    titel: "Declaraties",
    kern: "De maandstaat van de praktijk, uit de exports van VIPLive en Bricks.",
    delen: [
      {
        kop: "Twee systemen, drie rapporten",
        tekst: [
          "VIPLive (Calculus) is de geldbron: daar staat wat er is ingediend, goedgekeurd en betaald. Bricks/TetraHIS is de registratiebron: daar staat wat de praktijk heeft vastgelegd. Rapport 05 en 09 komen dus uit VIPLive, rapport 25 uit Bricks. Wie dat door elkaar haalt, zoekt in het verkeerde systeem.",
          "Rapport 05 (prestatiebasis) levert de maandstaat: aantallen en bedragen per verrichtingcode per maand. Rapport 09 (factuurbasis) levert de facturen in drie blokken — vóór, in en na de periode — die nooit bij elkaar opgeteld mogen worden en daarom apart worden bewaard. Rapport 25 geeft dezelfde verrichtingen per medewerker, maar is registratie en geen inkomsten: die regels moeten nog door de goedkeuring van VIPLive heen, en daar valt een deel af.",
          "Je hoeft niet te zeggen welk rapport je uploadt: de app herkent het aan de inhoud, want de bestandsnaam is niet te vertrouwen. Je ziet eerst wat eruit gerold is en pas daarna bewaar je het.",
        ],
      },
      {
        kop: "Rapport 25 vraagt om een maand",
        tekst: [
          "Bricks levert dit rapport in twee gedaanten. De ene heeft maandblokken per behandelaar, vaak met elke arts op een eigen tabblad; die worden allemaal gelezen. De andere is één platte tabel met Gebruikersnaam, code, Aantal en Bedrag, en die draagt nergens een periode — niet in de kop en niet in de bestandsnaam. Dan vraagt het scherm om de maand in plaats van er een te verzinnen, want een gok belandt stilletjes in de verkeerde maand.",
          "Draai dit rapport daarom per kalendermaand: Datum vanaf de eerste en Datum tot en met de laatste dag van die maand, één bestand per maand.",
        ],
      },
      {
        kop: "Wat de maandstaat telt",
        tekst: [
          "Ingeschreven patiënten zijn de codes 11115 tot en met 11118 bij elkaar. Code 11119 — de opslag voor verzekerden in een achterstandswijk — telt daar met opzet niet in mee: dat is een toeslag op bestaande inschrijvingen en geen aparte patiënt. Hij staat er los bij, als eigen kolom.",
          "Die regel staat in de database en niet in de app, zodat geen enkele latere query eromheen kan rekenen. Rijen uit rapport 25 worden overgeslagen bij het optellen, anders zou elke verrichting dubbel tellen naast rapport 05. Daarom weigert de app een rapport 25 waarin geen enkele behandelaar te vinden is: zulke regels zouden zich voordoen als rapport 05.",
        ],
      },
      {
        kop: "De waarschuwing",
        tekst: [
          "Springt het aandeel lange consulten in één maand met tien procentpunt of meer, dan verschijnt daar een amberkleurige melding bij. Dat is geen oordeel maar een vraag: is er echt anders gewerkt, of is er anders geregistreerd? Beide zijn mogelijk en beide zijn het waard om te weten.",
        ],
      },
      {
        kop: "Opnieuw uploaden",
        tekst: [
          "Dezelfde maand nog eens importeren overschrijft de oude regels. Dat is met opzet: een export wordt vaak een tweede keer gemaakt nadat er is nagedeclareerd, en twee halve waarheden naast elkaar zijn erger dan één bijgewerkte.",
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
  const gezocht = pad === "/delen" ? "/taken" : pad;
  return HOOFDSTUKKEN.find((h) => h.pad === gezocht) ?? null;
}

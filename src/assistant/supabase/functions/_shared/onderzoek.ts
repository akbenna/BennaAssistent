/**
 * DE CONGRES-AGENT
 *
 * Drie stappen, en tussen de eerste en de derde beslis jij.
 *
 * 1. Verkennen. De agent zoekt het programma, de late-breaking trials, de
 *    nieuwe richtlijnen en de berichtgeving rond een congres, en legt thema's
 *    voor, gesorteerd op wat ertoe doet voor een huisarts en kaderarts
 *    hart- en vaatziekten. Bij elk thema de bron, en wat er gepresenteerd is
 *    zoals de bron het zegt.
 * 2. Kiezen en doorvragen. Jij vinkt aan wat je uitgewerkt wilt hebben, zet
 *    erbij wat je wilt weten, en kunt de agent vragen stellen ("was er ook
 *    iets over Lp(a)?"). Een antwoord kan nieuwe thema's opleveren.
 * 3. Uitwerken. Per gekozen thema een eigen notitie: de studie of richtlijn,
 *    de opzet, de cijfers zoals gerapporteerd, wat het betekent voor de eerste
 *    lijn naast de NHG-standaard, en de kanttekeningen. Daarna zoekt de
 *    bestaande verdieping de genoemde publicaties op in PubMed en legt elke
 *    bewering naast het abstract. Zo komt er niets in je database dat alleen
 *    op een persbericht rust zonder dat dat erbij staat.
 *
 * De regel die alles bepaalt: geen cijfer, geen studie en geen conclusie die
 * niet in een gevonden bron staat. Een congres dat nog moet komen heeft een
 * programma en geen uitkomsten; dat zegt de agent dan ook.
 */
import { GEEN_PROJECT, leesLabels, schoonDoi, trekRecht, verzamelBronnen, type GenoemdeBron, type Uitkomst } from "./notities.ts";
import type { WebBron } from "./web.ts";

export type Relevantie = "hoog" | "middel" | "laag";

export interface Thema {
  id: string;
  titel: string;
  kern: string;
  wat_gepresenteerd: string;
  relevantie: Relevantie;
  waarom: string;
  soort: "studie" | "richtlijn" | "overzicht" | "overig";
  bronnen: WebBron[];
  /** Door jou gezet. */
  gekozen: boolean;
  opmerking: string;
  /** Uitwerking: wacht, gereed of fout; met de notitie die eruit kwam. */
  status: "wacht" | "gereed" | "fout" | null;
  notitie_id: string | null;
  fout?: string;
}

export interface Bericht { rol: "ik" | "agent"; tekst: string; op: string }

const tekst = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lijst = (v: unknown, max = 30, lengte = 600): string[] =>
  (Array.isArray(v) ? v : []).map((x) => tekst(x, lengte)).filter(Boolean).slice(0, max);
const RELEVANTIES: Relevantie[] = ["hoog", "middel", "laag"];
const SOORTEN = ["studie", "richtlijn", "overzicht", "overig"] as const;

const bronSchema = {
  type: "array",
  items: {
    type: "object", additionalProperties: false, required: ["titel", "url"],
    properties: { titel: { type: "string" }, url: { type: "string", description: "De volledige url van de pagina waar het staat." } },
  },
};

const themaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "kern", "wat_gepresenteerd", "relevantie", "waarom", "soort", "bronnen"],
  properties: {
    titel: { type: "string", description: "Kort en specifiek, met de naam van de trial of richtlijn als die er is." },
    kern: { type: "string", description: "Eén zin: waar gaat het over." },
    wat_gepresenteerd: { type: "string", description: "Hooguit drie zinnen: wat er gepresenteerd of gepubliceerd is, met de belangrijkste cijfers zoals de bron ze geeft. Staat er geen uitkomst in de bron, zeg dat." },
    relevantie: { type: "string", enum: RELEVANTIES },
    waarom: { type: "string", description: "Eén of twee zinnen: waarom dit wel of niet ertoe doet voor een huisarts en kaderarts hart- en vaatziekten in Nederland." },
    soort: { type: "string", enum: SOORTEN },
    bronnen: { ...bronSchema, description: "Minstens één pagina waar dit staat." },
  },
};

export const verkenSchema = {
  type: "object",
  additionalProperties: false,
  required: ["overzicht", "themas"],
  properties: {
    overzicht: { type: "string", description: "Eén of twee alinea's lopende tekst: welk congres, wanneer en waar, wat het in grote lijnen opleverde voor de eerste lijn. Of: dat het nog moet plaatsvinden en wat er op het programma staat." },
    themas: { type: "array", items: themaSchema, description: "Acht tot twaalf thema's, de meest relevante eerst." },
  },
};

export const antwoordSchema = {
  type: "object",
  additionalProperties: false,
  required: ["antwoord", "nieuwe_themas"],
  properties: {
    antwoord: { type: "string", description: "Het antwoord, als lopende tekst, met bij elke bewering de bron tussen haken." },
    nieuwe_themas: { type: "array", items: themaSchema, description: "Alleen thema's die nog niet in de lijst staan en uit deze vraag voortkomen; anders leeg." },
  },
};

export const uitwerkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["titel", "samenvatting", "studies", "relevantie_praktijk", "kanttekeningen", "onzeker", "vervolgstappen", "publicaties", "labels"],
  properties: {
    titel: { type: "string", description: "Specifieke titel van hooguit tien woorden." },
    samenvatting: { type: "string", description: "Drie tot zes alinea's verhalende tekst: de vraag, wat er gedaan is, wat eruit kwam, en wat dat betekent. Geen opsomming." },
    studies: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["naam", "opzet", "populatie", "interventie", "eindpunten", "resultaten", "bijzonderheden"],
        properties: {
          naam: { type: "string", description: "Naam van de trial, richtlijn of analyse." },
          opzet: { type: "string", description: "Bijvoorbeeld gerandomiseerd, dubbelblind, open label, cohort, meta-analyse; met follow-up." },
          populatie: { type: "string", description: "Wie, hoeveel, kenmerken die afwijken van de Nederlandse eerste lijn." },
          interventie: { type: "string", description: "Interventie en controle." },
          eindpunten: { type: "string", description: "Primair eindpunt, en of het een harde of surrogaatuitkomst is." },
          resultaten: { type: "array", items: { type: "string" }, description: "De uitkomsten met effectgrootte, relatief en absoluut als de bron ze geeft, NNT als die genoemd of eenduidig af te leiden is (zeg dan dat je hem afleidde)." },
          bijzonderheden: { type: "string", description: "Sponsor, vroegtijdig gestopt, nog niet gepubliceerd, alleen als abstract; leeg als niets bekend." },
        },
      },
    },
    relevantie_praktijk: { type: "string", description: "Wat dit betekent voor de huisartsenpraktijk en het CVRM-kaderwerk: verandert er iets, en hoe verhoudt het zich tot de NHG-standaard (CVRM, Diabetes mellitus type 2, Hartfalen, Atriumfibrilleren, Obesitas, Chronische nierschade). Zeg het als het niet botst, en zeg het als het wel botst." },
    kanttekeningen: { type: "array", items: { type: "string" }, description: "Methodologische en praktische kanttekeningen. Eigen kanttekeningen beginnen met 'Agent:'." },
    onzeker: { type: "array", items: { type: "string" }, description: "Wat de bronnen niet zeggen of waar ze elkaar tegenspreken." },
    vervolgstappen: { type: "array", items: { type: "string" }, description: "Wat de eigenaar hiermee zou kunnen doen: nalezen, bespreken met de POH, agenderen in de zorggroep. Hooguit vier." },
    publicaties: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["omschrijving", "auteurs", "jaar", "tijdschrift", "doi", "bewering"],
        properties: {
          omschrijving: { type: "string", description: "Titel of naam van de publicatie." },
          auteurs: { type: "string", description: "Eerste auteur et al., of leeg." },
          jaar: { type: "string" },
          tijdschrift: { type: "string" },
          doi: { type: "string", description: "Alleen als je hem in een bron zag; nooit raden." },
          bewering: { type: "string", description: "De bewering in deze notitie die op deze publicatie rust." },
        },
      },
      description: "De primaire publicaties waarop de uitkomsten rusten, zodat ze in PubMed kunnen worden nagezocht. Leeg als er nog geen publicatie is.",
    },
    labels: { type: "array", items: { type: "string" }, description: "Twee tot vijf korte trefwoorden in kleine letters, zoals 'lp(a)', 'obesitas', 'sglt2', 'hartfalen'." },
  },
};

const WIE = `Je werkt voor dr. Bennaghmouch: huisarts en praktijkhouder in Roermond, kaderarts CVRM bij een zorggroep, en bestuurder. Hij wil bij blijven zonder elk congres te bezoeken.
Wat voor hem ertoe doet, op volgorde: huisartsgeneeskunde; hart- en vaatziekten voor zover relevant voor de eerste lijn (CVRM, hypertensie, lipiden, Lp(a), diabetes type 2, chronische nierschade, hartfalen, atriumfibrilleren); leefstijl en obesitas, ook de medicamenteuze behandeling ervan. Interventionele cardiologie, beeldvorming en zeldzame aandoeningen zijn alleen relevant als ze verwijzing of nazorg in de eerste lijn veranderen.`;

const REGELS = `Regels die altijd gelden:
- Alles wat je schrijft komt uit een pagina die je gevonden hebt, en die pagina staat erbij. Geen cijfer, geen studie, geen conclusie uit je geheugen.
- Onderscheid wat je las: een publicatie in een tijdschrift, een congrespresentatie of abstract, een persbericht, of een nieuwsartikel. Zeg welke het is.
- Geef relatieve en absolute effecten zoals de bron ze geeft. Reken niets om tenzij het eenduidig is, en zeg dan dat je het afleidde.
- Is het congres nog niet geweest, of vind je geen uitkomsten, zeg dat dan. Een programma is geen uitkomst.
- Schrijf in helder Nederlands, verhalend, zonder marketingtaal. Geen gedachtestreepjes.`;

export function verkenPrompt(o: { onderwerp: string; url: string | null; focus: string | null; vandaag: string }) {
  return {
    systeem: `${WIE}

Je bent zijn onderzoeksassistent. Je verkent een congres of evenement en legt hem thema's voor, zodat hij kan kiezen wat hij uitgewerkt wil hebben.

Zoek naar: het wetenschappelijke programma, de hotline- en late-breaking sessies, nieuwe richtlijnen die er gepresenteerd werden, gelijktijdige publicaties (NEJM, Lancet, JAMA, EHJ, BMJ), en verslagen op betrouwbare plaatsen (de site van het congres zelf, tijdschriften, tctmd, medscape, healio, escardio.org, nhg.org, hartstichting.nl, cardiovascular nieuws).
Kies acht tot twaalf thema's en houd elk thema beknopt: de uitwerking komt later, als hij kiest. De meest relevante eerst. Neem ook thema's op die minder relevant zijn als ze veel aandacht kregen, maar geef ze dan relevantie laag en zeg waarom.

${REGELS}`,
    gebruiker: `Congres of evenement: ${o.onderwerp}${o.url ? `\nWebsite: ${o.url}` : ""}${o.focus ? `\nWaar hij in het bijzonder naar zoekt: ${o.focus}` : ""}\nVandaag is het ${o.vandaag}.`,
  };
}

export function antwoordPrompt(o: { onderwerp: string; overzicht: string; themas: Thema[]; gesprek: Bericht[]; vraag: string }) {
  const lijstTekst = o.themas.map((t, i) => `${i + 1}. ${t.titel} (${t.relevantie}${t.gekozen ? ", gekozen" : ""}): ${t.kern}${t.opmerking ? ` Zijn opmerking: ${t.opmerking}` : ""}`).join("\n");
  const eerder = o.gesprek.slice(-8).map((b) => `${b.rol === "ik" ? "Hij" : "Jij"}: ${b.tekst}`).join("\n");
  return {
    systeem: `${WIE}

Je hebt een congres voor hem verkend en jullie bespreken nu de thema's. Beantwoord zijn vraag; zoek opnieuw als dat nodig is. Komt er een thema bij dat nog niet in de lijst staat, zet het dan bij nieuwe_themas.

${REGELS}`,
    gebruiker: `Congres: ${o.onderwerp}\n\nJouw overzicht:\n${o.overzicht}\n\nThema's:\n${lijstTekst}${eerder ? `\n\nEerder in dit gesprek:\n${eerder}` : ""}\n\nZijn vraag: ${o.vraag}`,
  };
}

export function uitwerkPrompt(o: { onderwerp: string; thema: Thema }) {
  const t = o.thema;
  return {
    systeem: `${WIE}

Je werkt één thema van een congres uit tot een notitie voor zijn wetenschappelijke database. Zoek de primaire bron op (de publicatie, de richtlijn, het abstract) en lees die; een nieuwsbericht is een begin, geen eindpunt. Beschrijf per studie de opzet, de populatie, de interventie, de eindpunten en de resultaten, en zet de primaire publicaties bij publicaties zodat ze in PubMed kunnen worden nagezocht.

${REGELS}`,
    gebruiker: `Congres: ${o.onderwerp}
Thema: ${t.titel}
Wat er volgens de verkenning gepresenteerd is: ${t.wat_gepresenteerd}
Waarom het relevant leek: ${t.waarom}${t.opmerking ? `\nWat hij er in het bijzonder over wil weten: ${t.opmerking}` : ""}
Bronnen uit de verkenning:
${t.bronnen.map((b) => `- ${b.titel}: ${b.url}`).join("\n") || "- geen"}`,
  };
}

const bronnenUit = (v: unknown): WebBron[] =>
  (Array.isArray(v) ? v : []).map((b) => {
    const x = (b ?? {}) as Record<string, unknown>;
    return { titel: tekst(x.titel, 300), url: tekst(x.url, 1000) };
  }).filter((b) => /^https?:\/\//i.test(b.url)).slice(0, 10);

/** Thema's uit een antwoord, met een eigen id en zonder dubbelen met wat er al is. */
export function leesThemas(v: unknown, bestaand: Thema[] = []): Thema[] {
  const titels = new Set(bestaand.map((t) => t.titel.toLowerCase()));
  let n = bestaand.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, "")) || 0), 0);
  const uit: Thema[] = [];
  for (const x of (Array.isArray(v) ? v : []).slice(0, 20)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const titel = tekst(o.titel, 200);
    if (!titel || titels.has(titel.toLowerCase())) continue;
    titels.add(titel.toLowerCase());
    const rel = tekst(o.relevantie, 10) as Relevantie;
    const soort = tekst(o.soort, 20) as Thema["soort"];
    uit.push({
      id: `t${++n}`, titel, kern: tekst(o.kern, 600), wat_gepresenteerd: tekst(o.wat_gepresenteerd, 2000),
      relevantie: RELEVANTIES.includes(rel) ? rel : "middel", waarom: tekst(o.waarom, 1000),
      soort: (SOORTEN as readonly string[]).includes(soort) ? soort : "overig",
      bronnen: bronnenUit(o.bronnen), gekozen: false, opmerking: "", status: null, notitie_id: null,
    });
  }
  const volgorde = { hoog: 0, middel: 1, laag: 2 };
  return uit.sort((a, b) => volgorde[a.relevantie] - volgorde[b.relevantie]);
}

/**
 * Een uitwerking als gewone notitie-uitkomst, zodat het scherm, het Google Doc,
 * het zoeken en het nazoeken in PubMed er zonder uitzondering mee werken. Een
 * studie wordt een "presentatie": de naam als spreker, de opzet als onderbouwing.
 */
export function naarUitkomst(ruw: unknown, thema: Thema): Uitkomst {
  const o = (ruw ?? {}) as Record<string, unknown>;
  const studies = (Array.isArray(o.studies) ? o.studies : []).slice(0, 10).map((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    return {
      spreker: tekst(x.naam, 200) || thema.titel,
      onderwerp: tekst(x.naam, 200),
      kernboodschappen: lijst(x.resultaten, 12),
      onderbouwing: [
        tekst(x.opzet) && `Opzet: ${tekst(x.opzet)}`,
        tekst(x.populatie) && `Populatie: ${tekst(x.populatie)}`,
        tekst(x.interventie) && `Interventie: ${tekst(x.interventie)}`,
        tekst(x.eindpunten) && `Eindpunten: ${tekst(x.eindpunten)}`,
        tekst(x.bijzonderheden) && `Bijzonderheden: ${tekst(x.bijzonderheden)}`,
      ].filter(Boolean),
    };
  });
  const publicaties = (Array.isArray(o.publicaties) ? o.publicaties : []).slice(0, 15).map((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    return { ...x, doi: schoonDoi(tekst(x.doi, 200)) };
  });
  const r = trekRecht({
    titel: tekst(o.titel, 160) || thema.titel,
    project: GEEN_PROJECT,
    samenvatting: tekst(o.samenvatting, 12000),
    deelnemers: [], besluiten: [], actiepunten: [], afspraken: [],
    open_vragen: lijst(o.onzeker),
    mijn_vervolgstappen: lijst(o.vervolgstappen, 4),
    presentaties: studies,
    genoemde_bronnen: publicaties,
    relevantie_praktijk: tekst(o.relevantie_praktijk, 4000),
    kanttekeningen: lijst(o.kanttekeningen),
    sprekers: [],
    labels: o.labels,
  }, []);
  r.labels = leesLabels(o.labels, 5);
  r.bronnen = verzamelBronnen([], r.genoemde_bronnen as GenoemdeBron[]);
  return r;
}

/** De webbronnen als tekst bij de notitie: doorzoekbaar, en te lezen onder het verslag. */
export function bronnenTekst(onderwerp: string, thema: Thema, bronnen: WebBron[]): string {
  const alle = [...thema.bronnen, ...bronnen];
  const gezien = new Set<string>();
  const regels = alle.filter((b) => !gezien.has(b.url) && gezien.add(b.url)).map((b) => `- ${b.titel}: ${b.url}`);
  return `Uitgezocht door de congres-agent voor ${onderwerp}.\nThema: ${thema.titel}\n\nGeraadpleegde pagina's:\n${regels.join("\n") || "- geen"}`;
}

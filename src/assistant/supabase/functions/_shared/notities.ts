/**
 * NOTITIES: WAT ZUIVER IS
 *
 * Alles hier is zonder netwerk en zonder database: transcriptopmaak, het
 * schema dat het taalmodel moet vullen, de prompts, en het rechttrekken van wat
 * er terugkomt. Daarom staat het apart en daarom is het te toetsen
 * (`notities_test.ts`). De functies die praten met OpenAI, Claude, Google en de
 * database staan in `spraak.ts`, `samenvatten.ts` en `notitie-verwerk`.
 */

/** Eén stuk tekst uit de spraakherkenning, met tijden in seconden vanaf het begin van het hele gesprek. */
export interface Segment {
  spreker: string | null;
  start: number;
  eind: number;
  tekst: string;
}

/** Wat een dienst teruggeeft, met tijden binnen het deel. */
export interface RuwSegment {
  spreker: string | null;
  start: number;
  eind: number | null;
  tekst: string;
}

/**
 * Tijden naar het hele gesprek en sprekerlabels per deel.
 *
 * De spraakherkenning kent sprekers alleen binnen één bestand: "B" in deel 1 is
 * niet per se "B" in deel 2. Het label krijgt daarom het deelnummer erbij, zodat
 * het taalmodel dat ook weet. Jouw naam blijft je naam: die komt uit de
 * stemreferentie en is wél over de delen heen dezelfde.
 */
export function plaatsDeel(ruw: RuwSegment[], deel: { volgnummer: number; begin: number; duur: number | null }, mijnNaam: string): Segment[] {
  return ruw
    .map((s) => ({ ...s, tekst: (s.tekst ?? "").trim() }))
    .filter((s) => s.tekst)
    .map((s) => ({
      spreker: !s.spreker ? null : s.spreker === mijnNaam ? mijnNaam : `Spreker ${deel.volgnummer}${s.spreker}`,
      start: deel.begin + (s.start || 0),
      eind: deel.begin + (s.eind ?? deel.duur ?? s.start ?? 0),
      tekst: s.tekst,
    }));
}

const mmss = (s: number): string => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(sec).padStart(2, "0")}`;
};

/** Leesbaar transcript; opeenvolgende stukken van dezelfde spreker worden één regel. */
export function maakTranscript(segmenten: Segment[]): string {
  const regels: Segment[] = [];
  for (const s of [...segmenten].sort((a, b) => a.start - b.start)) {
    const vorige = regels[regels.length - 1];
    if (vorige && vorige.spreker === s.spreker && s.start - vorige.eind < 4) {
      vorige.tekst += " " + s.tekst;
      vorige.eind = Math.max(vorige.eind, s.eind);
    } else {
      regels.push({ ...s });
    }
  }
  return regels.map((r) => `[${mmss(r.start)}]${r.spreker ? ` ${r.spreker}:` : ""} ${r.tekst}`).join("\n");
}

/* ------------------------------------------------- sprekers over de delen -- */

export interface DeelUitslag {
  volgnummer: number;
  begin: number;
  duur: number | null;
  segmenten: RuwSegment[];
}

/** Woorden van een zin, zonder hoofdletters, accenten en leestekens. */
const woordenVan = (t: string): string[] =>
  t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/** Twee stukken tekst zijn dezelfde uitspraak als ze minstens twee woorden en de helft van hun woorden delen. */
export function zelfdeUitspraak(a: string, b: string): boolean {
  const x = new Set(woordenVan(a)), y = new Set(woordenVan(b));
  if (!x.size || !y.size) return false;
  let samen = 0;
  for (const w of x) if (y.has(w)) samen++;
  return samen >= 2 && samen / Math.min(x.size, y.size) >= 0.5;
}

const letter = (i: number): string => i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));

/**
 * SPREKERS DIE OVER DE DELEN HEEN DEZELFDE BLIJVEN
 *
 * De spraakherkenning kent sprekers per bestand: "B" in deel 1 is niet per se
 * "B" in deel 2. Knippen in stemfragmenten om ze te herkennen kan niet, want
 * de server heeft geen ffmpeg. Wat wel kan: de delen overlappen een paar
 * seconden, en de zin die op de naad in allebei staat is van één persoon. Zijn
 * label in het ene deel en in het andere horen dus bij elkaar.
 *
 * Wat zo gekoppeld is, krijgt één label voor de hele opname (Spreker A, B, C,
 * op volgorde van eerste keer spreken). Wat niet te koppelen is, krijgt een
 * eigen letter: liever twee labels voor één persoon dan één label voor twee.
 * De zin die door de overlap dubbel staat, staat er daarna één keer.
 */
export function koppelSprekers(delen: DeelUitslag[], mijnNaam: string, overlapSec = 4): Segment[] {
  const geordend = [...delen].sort((a, b) => a.volgnummer - b.volgnummer);
  const ouder = new Map<string, string>();
  const vind = (k: string): string => {
    let w = k;
    while (ouder.get(w) && ouder.get(w) !== w) w = ouder.get(w)!;
    ouder.set(k, w);
    return w;
  };
  const verbind = (a: string, b: string) => { const x = vind(a), y = vind(b); if (x !== y) ouder.set(y, x); };

  interface Stuk { sleutel: string | null; eigen: boolean; start: number; eind: number; tekst: string; weg?: boolean }
  const perDeel: Stuk[][] = geordend.map((d) => (d.segmenten ?? [])
    .map((s) => ({ ...s, tekst: (s.tekst ?? "").trim() }))
    .filter((s) => s.tekst)
    .map((s) => {
      const eigen = s.spreker === mijnNaam;
      const sleutel = s.spreker && !eigen ? `${d.volgnummer}:${s.spreker}` : null;
      if (sleutel && !ouder.has(sleutel)) ouder.set(sleutel, sleutel);
      return { sleutel, eigen, start: d.begin + (s.start || 0), eind: d.begin + (s.eind ?? d.duur ?? s.start ?? 0), tekst: s.tekst };
    }));

  for (let k = 0; k + 1 < perDeel.length; k++) {
    const naad = geordend[k + 1]!.begin;
    const staart = perDeel[k]!.filter((s) => s.eind > naad - 1);
    const kop = perDeel[k + 1]!.filter((s) => s.start < naad + overlapSec + 1);
    for (const b of kop) {
      const a = staart.find((x) => zelfdeUitspraak(x.tekst, b.tekst));
      if (!a) continue;
      if (a.sleutel && b.sleutel) verbind(a.sleutel, b.sleutel);
      // Alleen weglaten wat helemaal binnen de overlap valt; een zin die
      // doorloopt na de naad bevat nieuwe woorden.
      if (b.eind <= naad + overlapSec + 1) b.weg = true;
    }
  }

  const alle = perDeel.flat().filter((s) => !s.weg).sort((a, b) => a.start - b.start);
  const letters = new Map<string, string>();
  for (const s of alle) {
    if (!s.sleutel) continue;
    const w = vind(s.sleutel);
    if (!letters.has(w)) letters.set(w, letter(letters.size));
  }
  return alle.map((s) => ({
    spreker: s.eigen ? mijnNaam : s.sleutel ? `Spreker ${letters.get(vind(s.sleutel))}` : null,
    start: s.start, eind: s.eind, tekst: s.tekst,
  }));
}

/** Zet de namen die het model herkende in het transcript: "Jan (spreker A):". */
export function noemSprekers(transcript: string, sprekers: SprekerNaam[]): string {
  let uit = transcript;
  for (const s of sprekers) {
    if (!s.naam || !/^Spreker [A-Z]+$/.test(s.label)) continue;
    const re = new RegExp(`(\\]) ${s.label}:`, "g");
    uit = uit.replace(re, `$1 ${s.naam} (${s.label.replace("Spreker", "spreker")}):`);
  }
  return uit;
}

/* ------------------------------------------------------------ het schema -- */

export interface Actiepunt {
  wie: string;
  wat: string;
  deadline: string;
  van_mij: boolean;
  /** Door jou gezet: de ander heeft het gedaan, of het hoeft niet meer. */
  afgehandeld?: boolean;
  /** Wanneer er een herinnering als concept klaarstond. */
  herinnerd_op?: string;
}

export interface Afspraak {
  wat: string;
  datum: string;
  begintijd: string;
  eindtijd: string;
  locatie: string;
  /** Gezet zodra hij in de agenda staat; voorkomt een tweede keer. */
  event_id?: string;
}

/** Een label uit het transcript met de naam die uit het gesprek blijkt. */
export interface SprekerNaam {
  label: string;
  naam: string;
  rol: string;
}

/** Wat voor gesprek het is. Bepaalt de toon van de notitie, niet het schema. */
export type Soort = "vergadering" | "congres" | "telefoon" | "notitie";
export const SOORTEN: Soort[] = ["vergadering", "congres", "telefoon", "notitie"];

/** Een presentatie op een congres, symposium of webinar. */
export interface Presentatie {
  spreker: string;
  onderwerp: string;
  kernboodschappen: string[];
  /** Cijfers en studies zoals de spreker ze bracht: effectgrootte, NNT, populatie. */
  onderbouwing: string[];
}

/** Een bron zoals de spreker of de slide hem noemde, nog niet nagezocht. */
export interface GenoemdeBron {
  omschrijving: string;
  auteurs: string;
  jaar: string;
  tijdschrift: string;
  doi: string;
  /** Wat er volgens de spreker of de slide uit deze studie volgt. */
  bewering: string;
}

export interface Bron extends GenoemdeBron {
  /** Waar hij vandaan komt: "slide 3 (12:40)" of "gesprek". */
  herkomst: string;
  pmid: string;
}

export interface Uitkomst {
  titel: string;
  project: string;
  samenvatting: string;
  deelnemers: string[];
  besluiten: string[];
  actiepunten: Actiepunt[];
  afspraken: Afspraak[];
  open_vragen: string[];
  mijn_vervolgstappen: string[];
  presentaties: Presentatie[];
  genoemde_bronnen: GenoemdeBron[];
  relevantie_praktijk: string;
  kanttekeningen: string[];
  sprekers: SprekerNaam[];
  /** Korte trefwoorden om op te ordenen, los van het project. */
  labels: string[];
  /** Na het samenvoegen met de slides: alle bronnen, ontdubbeld. Niet door het model gevuld. */
  bronnen?: Bron[];
}

export const GEEN_PROJECT = "Geen";

const lijst = { type: "array", items: { type: "string" } };

/**
 * Strikt: elk veld verplicht, geen extra velden. Zo accepteert OpenAI het als
 * `strict` json_schema, en Claude krijgt hetzelfde schema als gereedschap.
 * "Leeg" is een lege tekst en geen ontbrekend veld; dat houdt beide modellen
 * aan dezelfde vorm.
 */
export function schema(projectNamen: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["titel", "project", "samenvatting", "deelnemers", "besluiten", "actiepunten", "afspraken", "open_vragen", "mijn_vervolgstappen",
      "presentaties", "genoemde_bronnen", "relevantie_praktijk", "kanttekeningen", "sprekers", "labels"],
    properties: {
      labels: { ...lijst, description: "Eén tot vier korte trefwoorden in kleine letters om notities op te ordenen, zoals 'poh', 'financiering', 'diabetes', 'huisvesting'. Geen projectnaam en geen datum." },
      titel: { type: "string", description: "Korte, specifieke titel van hooguit acht woorden, zonder datum." },
      project: { type: "string", enum: [...projectNamen, GEEN_PROJECT] },
      samenvatting: { type: "string", description: "Verhalende samenvatting in lopende tekst, een tot vier alinea's, gescheiden door een lege regel." },
      deelnemers: { ...lijst, description: "Namen of rollen van aanwezigen voor zover herkenbaar." },
      besluiten: { ...lijst, description: "Genomen besluiten, elk als volledige zin." },
      actiepunten: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["wie", "wat", "deadline", "van_mij"],
          properties: {
            wie: { type: "string", description: "Naam of rol; 'onbekend' als het niet gezegd is." },
            wat: { type: "string", description: "De handeling, beginnend met een werkwoord." },
            deadline: { type: "string", description: "JJJJ-MM-DD als genoemd of eenduidig af te leiden, anders leeg." },
            van_mij: { type: "boolean", description: "Waar als de eigenaar dit zelf moet doen." },
          },
        },
      },
      afspraken: {
        type: "array",
        description: "Concrete vervolgafspraken met een datum: een volgende vergadering, een belafspraak. Geen deadlines; die zijn actiepunten.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["wat", "datum", "begintijd", "eindtijd", "locatie"],
          properties: {
            wat: { type: "string" },
            datum: { type: "string", description: "JJJJ-MM-DD" },
            begintijd: { type: "string", description: "UU:MM of leeg" },
            eindtijd: { type: "string", description: "UU:MM of leeg" },
            locatie: { type: "string", description: "Plaats of 'online', of leeg" },
          },
        },
      },
      open_vragen: { ...lijst, description: "Onbeantwoorde vragen en onduidelijkheden." },
      mijn_vervolgstappen: { ...lijst, description: "Wat de eigenaar vóór het volgende contact moet voorbereiden of beslissen." },
      presentaties: {
        type: "array",
        description: "Alleen bij een congres, symposium of webinar: per spreker of presentatie. Anders leeg.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["spreker", "onderwerp", "kernboodschappen", "onderbouwing"],
          properties: {
            spreker: { type: "string", description: "Naam en functie zoals genoemd, of 'onbekend'." },
            onderwerp: { type: "string" },
            kernboodschappen: { ...lijst, description: "De boodschappen die de spreker uitdroeg, elk als volledige zin." },
            onderbouwing: { ...lijst, description: "Cijfers en studies zoals gebracht: effectgrootte, NNT, populatie, follow-up. Letterlijk wat er werd gezegd of op de slide stond." },
          },
        },
      },
      genoemde_bronnen: {
        type: "array",
        description: "Studies, richtlijnen en artikelen die in het gesprek of op een slide werden genoemd. Alleen wat er werkelijk werd genoemd.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["omschrijving", "auteurs", "jaar", "tijdschrift", "doi", "bewering"],
          properties: {
            omschrijving: { type: "string", description: "Titel of naam van de studie (bijvoorbeeld 'SELECT-trial')." },
            auteurs: { type: "string", description: "Eerste auteur et al., of leeg." },
            jaar: { type: "string", description: "Jaartal of leeg." },
            tijdschrift: { type: "string", description: "Tijdschrift of leeg." },
            doi: { type: "string", description: "DOI als die letterlijk genoemd is, anders leeg." },
            bewering: { type: "string", description: "Wat er volgens de spreker uit deze studie volgt." },
          },
        },
      },
      relevantie_praktijk: { type: "string", description: "Alleen bij een congres: wat dit betekent voor de huisartsenpraktijk en het kaderwerk, in het licht van de NHG-standaarden. Anders leeg." },
      sprekers: {
        type: "array",
        description: "Voor elk label 'Spreker X' in het transcript: wie het is, als dat uit het gesprek blijkt (iemand wordt bij naam aangesproken, stelt zich voor, of wordt aangekondigd). Alleen als je het zeker weet; anders naam leeg laten.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "naam", "rol"],
          properties: {
            label: { type: "string", description: "Precies zoals in het transcript, bijvoorbeeld 'Spreker B'." },
            naam: { type: "string", description: "Naam, of leeg als het niet zeker is." },
            rol: { type: "string", description: "Rol of functie als die genoemd is (penningmeester, spreker, POH), of leeg." },
          },
        },
      },
      kanttekeningen: { ...lijst, description: "Alleen bij een congres: methodologische of praktische kanttekeningen die werden genoemd of die voor de hand liggen (sponsoring, surrogaat-eindpunten, populatie die afwijkt van de eerste lijn). Markeer eigen kanttekeningen als 'Notulist:'." },
    },
  };
}

export interface ProjectContext {
  naam: string;
  trefwoorden?: string[] | null;
}

const PER_SOORT: Record<Soort, string> = {
  vergadering: `Dit is een vergadering of overleg. Leg besluiten, afspraken en wie wat doet nauwkeurig vast. Laat presentaties, relevantie_praktijk en kanttekeningen leeg, en genoemde_bronnen ook, tenzij er werkelijk een studie of richtlijn werd aangehaald.`,
  telefoon: `Dit is een telefoongesprek. Houd het kort: één alinea samenvatting, de afspraken en de vervolgstap. Laat presentaties, relevantie_praktijk en kanttekeningen leeg.`,
  congres: `Dit is een congres, symposium, nascholing of webinar, en de eigenaar is er als kaderarts en huisarts. Schrijf wetenschappelijke notulen:
- Per spreker een presentatie, met de kernboodschappen en de onderbouwing zoals die werd gebracht: welke studie, welke populatie, welk eindpunt, welke effectgrootte (relatief én absoluut als het genoemd werd), NNT, follow-up.
- Neem de slides die als foto zijn bijgevoegd mee op het moment waarop ze werden getoond; wat op een slide staat telt even zwaar als wat er werd gezegd.
- Zet elke genoemde studie, richtlijn of publicatie bij genoemde_bronnen, met de bewering die de spreker eraan ophing. Verzin geen DOI, geen jaartal en geen tijdschrift: wat niet genoemd is blijft leeg.
- Onderscheid scherp tussen wat de spreker beweerde en wat bewezen is. Je beoordeelt hier nog niets; de bronnen worden later apart nagezocht.
- Vul relevantie_praktijk: wat betekent dit voor de huisartsenpraktijk en het CVRM-kaderwerk, en raakt het een NHG-standaard?
- Besluiten en actiepunten zijn hier zeldzaam; actiepunten van de eigenaar ("dit wil ik nalezen", "dit bespreken met de POH") wel opnemen.`,
  notitie: `Dit is geen gesprek maar een eigen notitie van de eigenaar: wat hij zelf schreef, soms met foto's (een whiteboard, een flipover, een document) en soms met de tekst van een artikel dat hij bewaarde.
- Wat de eigenaar zelf schreef is leidend; foto's en artikel zijn achtergrond. Er zijn geen sprekers: laat sprekers leeg, en deelnemers ook, tenzij er namen in staan.
- Houd de samenvatting in verhouding tot wat er ligt. Drie regels van de eigenaar worden geen pagina, en wat er niet staat vul je niet aan.
- Bij een artikel: de kern, de onderbouwing zoals die er staat, en in relevantie_praktijk wat het voor de eigenaar betekent als huisarts, kaderarts of bestuurder. Studies die het artikel noemt horen bij genoemde_bronnen.
- Een taak in de tekst ("bellen met", "uitzoeken", "voor vrijdag") wordt een actiepunt van de eigenaar.`,
};

export function systeemPrompt(o: { mijnNaam: string; datum: string; projecten: ProjectContext[]; soort?: Soort }): string {
  const proj = o.projecten.length
    ? o.projecten.map((p) => `- ${p.naam}${p.trefwoorden?.length ? ` (${p.trefwoorden.join(", ")})` : ""}`).join("\n")
    : "(geen projecten)";
  return `Je bent de notulist van dr. ${o.mijnNaam} Bennaghmouch: huisarts en praktijkhouder (Het Roosendael, Roermond), kaderarts CVRM bij Meditta, voorzitter van Stichting Achterstandsfonds Limburg, en ondernemer.
Je maakt van een transcript een betrouwbare notitie in het Nederlands.

Regels:
- Gebruik uitsluitend wat in het transcript staat. Verzin geen namen, bedragen, data of besluiten. Is iets onverstaanbaar of dubbelzinnig, zeg dat dan en zet het bij de open vragen.
- Schrijf de samenvatting als heldere, verhalende lopende tekst: wat speelde er, welke afwegingen kwamen langs, waar kwam men uit. Geen opsomming in de samenvatting.
- Een besluit is alleen een besluit als het zo is uitgesproken; voorstellen en meningen zijn geen besluiten.
- Spreker "${o.mijnNaam}" is altijd dr. Bennaghmouch zelf. De andere labels (Spreker A, B, C) zijn waar mogelijk over de hele opname gekoppeld. Het kan nog gebeuren dat één persoon twee labels heeft; dan leid je dat af uit de inhoud. Twee personen onder één label komt bijna niet voor.
- Vul sprekers: wie hoort bij welk label, alleen als het uit het gesprek blijkt. Gebruik die namen ook in de samenvatting en bij de actiepunten.
- De opname is van ${o.datum}. Reken "volgende week vrijdag" alleen om naar een datum als dat eenduidig is.
- Momenten die de eigenaar tijdens de opname markeerde zijn voor hem belangrijk; geef ze een plek in de samenvatting.
- Wat de eigenaar tijdens de opname zelf typte weegt zwaarder dan wat jij uit het transcript afleidt. Verwerk elke aantekening: een taak of vraag ("navragen bij", "nog uitzoeken") wordt een actiepunt van hem, een nadruk ("belangrijk", "termijn") komt terug in de samenvatting. Laat er geen weg.
- Kies het project dat het best past, of "${GEEN_PROJECT}":
${proj}

${PER_SOORT[o.soort ?? "vergadering"]}`;
}

/** Wat de eigenaar tijdens de opname zelf typte. */
export interface Aantekening {
  moment: number | null;
  tekst: string;
}

/** Aantekeningen uit de database, rechtgetrokken: tekst verplicht, moment een getal of leeg. */
export function leesAantekeningen(v: unknown): Aantekening[] {
  return (Array.isArray(v) ? v : []).slice(0, 200).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const m = Number(o.moment);
    return { moment: Number.isFinite(m) && m >= 0 ? m : null, tekst: typeof o.tekst === "string" ? o.tekst.trim().slice(0, 1000) : "" };
  }).filter((a) => a.tekst);
}

export interface FotoVoorPrompt {
  volgnummer: number;
  moment: number | null;
  analyse: FotoAnalyse;
}

export function gebruikerPrompt(o: {
  transcript: string; agendaTitel?: string | null; deelnemers?: string[]; projectHint?: string | null;
  bestandsnaam?: string | null; fotos?: FotoVoorPrompt[]; markeringen?: number[];
  aantekeningen?: Aantekening[];
  /** Bij een snelle notitie: wat de eigenaar zelf schreef, en de link die hij bewaarde. */
  invoer?: string | null; link?: string | null;
}): string {
  const meta = [
    o.agendaTitel && `Agenda-afspraak: ${o.agendaTitel}`,
    o.deelnemers?.length && `Uitgenodigd: ${o.deelnemers.join(", ")}`,
    o.projectHint && `Waarschijnlijk project: ${o.projectHint}`,
    o.bestandsnaam && `Bestandsnaam: ${o.bestandsnaam}`,
    o.markeringen?.length && `Door de eigenaar gemarkeerde momenten: ${o.markeringen.map((m) => `[${mmss(m)}]`).join(", ")}`,
  ].filter(Boolean).join("\n");
  const fotos = (o.fotos ?? []).map((f) => {
    const a = f.analyse;
    const refs = a.referenties.map((r) => `  - bron: ${[r.auteurs, r.titel, r.tijdschrift, r.jaar, r.doi && `doi ${r.doi}`, r.pmid && `PMID ${r.pmid}`].filter(Boolean).join(", ")}`).join("\n");
    return `Slide ${f.volgnummer}${f.moment != null ? ` [${mmss(f.moment)}]` : ""}: ${a.kern}\nTekst op de slide: ${a.tekst}${a.cijfers.length ? `\nCijfers: ${a.cijfers.join("; ")}` : ""}${refs ? `\n${refs}` : ""}`;
  }).join("\n\n");
  const eigen = (o.aantekeningen ?? []).filter((a) => a.tekst)
    .map((a) => `${a.moment != null ? `[${mmss(a.moment)}] ` : ""}${a.tekst}`).join("\n");
  const eigenNotitie = o.invoer?.trim() ? `Wat de eigenaar zelf schreef:\n${o.invoer.trim()}\n\n` : "";
  const snel = o.invoer != null;
  // Een snelle notitie heeft geen transcript; wel soms de tekst van een artikel.
  const slot = !snel ? `Transcript:\n${o.transcript}`
    : o.transcript.trim() ? `Tekst van het bewaarde artikel${o.link ? ` (${o.link})` : ""}:\n${o.transcript}` : "";
  return `${meta ? meta + "\n\n" : ""}${eigenNotitie}${eigen ? `Aantekeningen die de eigenaar tijdens de opname zelf typte:\n${eigen}\n\n` : ""}${fotos ? `Slides en foto's die ${snel ? "bij de notitie horen" : "tijdens de opname zijn gemaakt"}:\n${fotos}\n\n` : ""}${slot}`.trim();
}

/* ------------------------------------------------------------ de foto's -- */

export interface Referentie {
  auteurs: string;
  titel: string;
  tijdschrift: string;
  jaar: string;
  doi: string;
  pmid: string;
}

export interface FotoAnalyse {
  soort: "slide" | "poster" | "document" | "overig";
  kern: string;
  tekst: string;
  cijfers: string[];
  referenties: Referentie[];
}

export const fotoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["soort", "kern", "tekst", "cijfers", "referenties"],
  properties: {
    soort: { type: "string", enum: ["slide", "poster", "document", "overig"] },
    kern: { type: "string", description: "De boodschap van deze slide in één of twee zinnen, in het Nederlands." },
    tekst: { type: "string", description: "Alle leesbare tekst op de slide, letterlijk, in de oorspronkelijke taal. Tabellen regel voor regel." },
    cijfers: { ...lijst, description: "Elke uitkomst met getal: HR, RR, OR, NNT, procenten, betrouwbaarheidsintervallen, p-waarden, met wat ze meten." },
    referenties: {
      type: "array",
      description: "Elke bronvermelding op de slide (vaak klein onderaan). Alleen wat er echt staat; wat onleesbaar is blijft leeg.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["auteurs", "titel", "tijdschrift", "jaar", "doi", "pmid"],
        properties: {
          auteurs: { type: "string" }, titel: { type: "string" }, tijdschrift: { type: "string" },
          jaar: { type: "string" }, doi: { type: "string" }, pmid: { type: "string" },
        },
      },
    },
  },
};

export const FOTO_SYSTEEM = `Je leest een foto van een slide, poster of document, gemaakt tijdens een congres, symposium, webinar of vergadering door een Nederlandse huisarts.
Neem de tekst letterlijk over en verzin niets: wat onleesbaar is, laat je weg. Let vooral op studienamen, uitkomstmaten met hun getallen, en de bronvermelding (vaak klein onderaan de slide). Een DOI of PMID neem je alleen over als hij er letterlijk staat.
Staan er patiëntgegevens op (een naam, een geboortedatum, een foto van een patiënt), beschrijf die dan niet en zet in kern alleen: "Bevat mogelijk patiëntgegevens".`;

export function trekFotoRecht(r: unknown): FotoAnalyse {
  const o = (r ?? {}) as Record<string, unknown>;
  const soort = ["slide", "poster", "document", "overig"].includes(String(o.soort)) ? o.soort as FotoAnalyse["soort"] : "overig";
  return {
    soort,
    kern: tekst(o.kern, 600),
    tekst: tekst(o.tekst, 6000),
    cijfers: tekstLijst(o.cijfers, 30),
    referenties: (Array.isArray(o.referenties) ? o.referenties : []).slice(0, 20).map((x) => {
      const v = (x ?? {}) as Record<string, unknown>;
      return {
        auteurs: tekst(v.auteurs, 300), titel: tekst(v.titel, 400), tijdschrift: tekst(v.tijdschrift, 200),
        jaar: (tekst(v.jaar, 10).match(/\b(19|20)\d{2}\b/) ?? [""])[0]!, doi: schoonDoi(tekst(v.doi, 200)),
        pmid: (tekst(v.pmid, 20).match(/\d{5,9}/) ?? [""])[0]!,
      };
    }).filter((x) => x.titel || x.doi || x.pmid || x.auteurs),
  };
}

/* ------------------------------------------------------------ de bronnen -- */

/** Een DOI zonder voorvoegsel en zonder leesteken erachter, of leeg. */
export function schoonDoi(d: string): string {
  const m = d.match(/10\.\d{4,9}\/[^\s"<>]+/i);
  return m ? m[0].replace(/[.,;)\]]+$/, "").toLowerCase() : "";
}

const normTitel = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Alle bronnen van de slides en uit het gesprek, ontdubbeld. Een bron die op
 * een slide stond en ook werd genoemd komt één keer, met de gegevens van de
 * slide (die zijn completer) en de bewering uit het gesprek.
 */
export function verzamelBronnen(fotos: FotoVoorPrompt[], genoemd: GenoemdeBron[]): Bron[] {
  const uit: Bron[] = [];
  const zoek = (b: { doi: string; pmid?: string; omschrijving: string }) => uit.find((x) =>
    (b.doi && x.doi === b.doi) || (b.pmid && x.pmid === b.pmid)
    || (normTitel(b.omschrijving).length > 12 && normTitel(x.omschrijving) === normTitel(b.omschrijving)));
  for (const f of fotos) {
    for (const r of f.analyse.referenties) {
      const b: Bron = {
        omschrijving: r.titel || `${r.auteurs} ${r.jaar}`.trim(), auteurs: r.auteurs, jaar: r.jaar, tijdschrift: r.tijdschrift,
        doi: schoonDoi(r.doi), pmid: r.pmid, bewering: f.analyse.kern,
        herkomst: `slide ${f.volgnummer}${f.moment != null ? ` (${mmss(f.moment)})` : ""}`,
      };
      if (!zoek(b)) uit.push(b);
    }
  }
  for (const g of genoemd) {
    const doi = schoonDoi(g.doi);
    const bestaand = zoek({ doi, omschrijving: g.omschrijving });
    if (bestaand) {
      if (g.bewering) bestaand.bewering = g.bewering;
      continue;
    }
    uit.push({ ...g, doi, pmid: "", herkomst: "gesprek" });
  }
  return uit.slice(0, 25);
}

/* ---------------------------------------------------------- de verdieping -- */

/** Een bron zoals PubMed of Crossref hem kent. */
export interface BronGegevens {
  pmid: string;
  doi: string;
  titel: string;
  auteurs: string[];
  tijdschrift: string;
  jaar: string;
  abstract: string;
  url: string;
}

export type Oordeel = "bevestigd" | "genuanceerd" | "afwijkend" | "niet te beoordelen";

export interface VerdiepteBron {
  herkomst: string;
  bewering: string;
  gevonden: boolean;
  gegevens: BronGegevens | null;
  citaat: string;
  bevindingen: string;
  oordeel: Oordeel;
  toelichting: string;
}

export interface Verdieping {
  bronnen: VerdiepteBron[];
  duiding: string;
  dienst: string;
  gemaakt_op: string;
}

/** Vancouver, zoals de NHG-standaarden en het NTvG citeren. */
export function vancouver(g: BronGegevens): string {
  const auteurs = g.auteurs.length > 6 ? `${g.auteurs.slice(0, 6).join(", ")}, et al` : g.auteurs.join(", ");
  return [auteurs && `${auteurs}.`, g.titel && `${g.titel.replace(/\.$/, "")}.`, g.tijdschrift && `${g.tijdschrift}.`, g.jaar && `${g.jaar}.`,
    g.doi && `doi:${g.doi}`, g.pmid && `PMID: ${g.pmid}`].filter(Boolean).join(" ");
}

/** Leest het PubMed-XML van efetch. Bewust eenvoudig: alleen de velden die we tonen. */
export function leesPubmedXml(xml: string): BronGegevens[] {
  const ont = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  const een = (blok: string, re: RegExp) => ont(blok.match(re)?.[1] ?? "");
  return [...xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)].map((m) => {
    const b = m[1]!;
    const auteurs = [...b.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g)].map((a) => {
      const achter = een(a[1]!, /<LastName>([\s\S]*?)<\/LastName>/), init = een(a[1]!, /<Initials>([\s\S]*?)<\/Initials>/);
      return achter ? `${achter} ${init}`.trim() : een(a[1]!, /<CollectiveName>([\s\S]*?)<\/CollectiveName>/);
    }).filter(Boolean);
    const abstract = [...b.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)].map((a) => {
      const label = a[1]!.match(/Label="([^"]+)"/)?.[1];
      return `${label ? `${label}: ` : ""}${ont(a[2]!)}`;
    }).join("\n");
    const pmid = een(b, /<PMID[^>]*>(\d+)<\/PMID>/);
    const doi = schoonDoi(een(b, /<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/));
    const jaar = een(b, /<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) || (een(b, /<MedlineDate>([\s\S]*?)<\/MedlineDate>/).match(/\d{4}/)?.[0] ?? "");
    return {
      pmid, doi, titel: een(b, /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/), auteurs,
      tijdschrift: een(b, /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/) || een(b, /<Title>([\s\S]*?)<\/Title>/),
      jaar, abstract, url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : doi ? `https://doi.org/${doi}` : "",
    };
  });
}

/** De zoekvraag voor PubMed bij een bron zonder PMID of DOI. */
export function pubmedZoekterm(b: Pick<Bron, "omschrijving" | "auteurs" | "jaar" | "doi">): string {
  if (b.doi) return `${b.doi}[doi]`;
  const woorden = normTitel(b.omschrijving).split(" ").filter((w) => w.length > 3).slice(0, 10);
  const delen = [woorden.length ? `(${woorden.join(" ")})` : ""];
  const eerste = b.auteurs.match(/[A-Z][a-zA-Z'\-]+/)?.[0];
  if (eerste && !/^(et|al|The)$/.test(eerste)) delen.push(`${eerste}[au]`);
  if (/^\d{4}$/.test(b.jaar)) delen.push(`${b.jaar}[dp]`);
  return delen.filter(Boolean).join(" AND ");
}

export const verdiepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bronnen", "duiding"],
  properties: {
    bronnen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nummer", "bevindingen", "oordeel", "toelichting"],
        properties: {
          nummer: { type: "integer" },
          bevindingen: { type: "string", description: "Wat de studie werkelijk vond, uitsluitend volgens het abstract: opzet, populatie, interventie, eindpunt, uitkomst met getallen. Twee tot vijf zinnen." },
          oordeel: { type: "string", enum: ["bevestigd", "genuanceerd", "afwijkend", "niet te beoordelen"] },
          toelichting: { type: "string", description: "Waarom dit oordeel: waar komt de bewering overeen met het abstract, waar niet. Eén of twee zinnen." },
        },
      },
    },
    duiding: { type: "string", description: "Een korte wetenschappelijke duiding van het geheel voor een huisarts en kaderarts: hoe sterk is wat er werd beweerd, wat betekent het voor de praktijk, en waar wijkt het af van de NHG-standaard als dat zo is. Lopende tekst, hooguit twee alinea's." },
  },
};

export const VERDIEP_SYSTEEM = `Je bent een wetenschappelijk medewerker van een Nederlandse huisarts en kaderarts CVRM. Je vergelijkt wat sprekers op een congres beweerden met wat de aangehaalde studies werkelijk vonden.
Regels:
- Gebruik voor de bevindingen uitsluitend het meegegeven abstract. Wat er niet in staat, weet je niet; zeg dat.
- Is er geen abstract of geen gevonden studie, dan is het oordeel "niet te beoordelen".
- "bevestigd": de bewering volgt uit het abstract. "genuanceerd": de richting klopt, maar de bewering laat iets weg dat ertoe doet (een andere populatie, een surrogaat-eindpunt, een relatieve in plaats van een absolute winst, een subgroep). "afwijkend": het abstract zegt iets anders.
- Schrijf in het Nederlands, zakelijk en precies. Noem getallen zoals ze in het abstract staan.`;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const tekst = (v: unknown, max = 2000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const tekstLijst = (v: unknown, max = 40): string[] =>
  Array.isArray(v) ? v.map((x) => tekst(x, 600)).filter(Boolean).slice(0, max) : [];

/**
 * Wat er terugkomt, rechtgetrokken. Een strikt schema maakt dit bij OpenAI
 * grotendeels overbodig, maar de uitval naar Claude en een model dat een veld
 * net anders invult moeten hier op dezelfde vorm uitkomen. Een ongeldige datum
 * wordt leeg en geen verzonnen datum; een onbekend project wordt "Geen".
 */
export function trekRecht(r: unknown, projectNamen: string[]): Uitkomst {
  const o = (r ?? {}) as Record<string, unknown>;
  const project = tekst(o.project, 200);
  return {
    titel: tekst(o.titel, 160) || "Notitie zonder titel",
    project: projectNamen.includes(project) ? project : GEEN_PROJECT,
    samenvatting: tekst(o.samenvatting, 12000),
    deelnemers: tekstLijst(o.deelnemers),
    besluiten: tekstLijst(o.besluiten),
    actiepunten: (Array.isArray(o.actiepunten) ? o.actiepunten : []).slice(0, 40).map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const d = tekst(x.deadline, 10);
      return { wie: tekst(x.wie, 120) || "onbekend", wat: tekst(x.wat, 400), deadline: DATUM.test(d) ? d : "", van_mij: x.van_mij === true };
    }).filter((a) => a.wat),
    afspraken: (Array.isArray(o.afspraken) ? o.afspraken : []).slice(0, 10).map((a) => {
      const x = (a ?? {}) as Record<string, unknown>;
      const b = tekst(x.begintijd, 5), e = tekst(x.eindtijd, 5);
      return {
        wat: tekst(x.wat, 200), datum: tekst(x.datum, 10),
        begintijd: TIJD.test(b) ? b : "", eindtijd: TIJD.test(e) ? e : "", locatie: tekst(x.locatie, 200),
      };
    }).filter((a) => a.wat && DATUM.test(a.datum)),
    open_vragen: tekstLijst(o.open_vragen),
    mijn_vervolgstappen: tekstLijst(o.mijn_vervolgstappen),
    sprekers: (Array.isArray(o.sprekers) ? o.sprekers : []).slice(0, 30).map((x) => {
      const v = (x ?? {}) as Record<string, unknown>;
      return { label: tekst(v.label, 40), naam: tekst(v.naam, 120), rol: tekst(v.rol, 120) };
    }).filter((x) => /^Spreker [A-Z]+$/.test(x.label)),
    presentaties: (Array.isArray(o.presentaties) ? o.presentaties : []).slice(0, 30).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { spreker: tekst(x.spreker, 200) || "onbekend", onderwerp: tekst(x.onderwerp, 300), kernboodschappen: tekstLijst(x.kernboodschappen), onderbouwing: tekstLijst(x.onderbouwing) };
    }).filter((p) => p.onderwerp || p.kernboodschappen.length),
    genoemde_bronnen: (Array.isArray(o.genoemde_bronnen) ? o.genoemde_bronnen : []).slice(0, 25).map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      return {
        omschrijving: tekst(x.omschrijving, 400), auteurs: tekst(x.auteurs, 300),
        jaar: (tekst(x.jaar, 10).match(/\b(19|20)\d{2}\b/) ?? [""])[0]!, tijdschrift: tekst(x.tijdschrift, 200),
        doi: schoonDoi(tekst(x.doi, 200)), bewering: tekst(x.bewering, 600),
      };
    }).filter((b) => b.omschrijving),
    relevantie_praktijk: tekst(o.relevantie_praktijk, 4000),
    kanttekeningen: tekstLijst(o.kanttekeningen),
    labels: leesLabels(o.labels),
  };
}

/** Labels: kleine letters, kort, uniek, hooguit vier van het model (of twaalf van jou). */
export function leesLabels(v: unknown, max = 4): string[] {
  const uit: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const l = typeof x === "string" ? x.trim().toLocaleLowerCase("nl").replace(/^#/, "").replace(/\s+/g, " ").slice(0, 30) : "";
    if (l && !uit.includes(l)) uit.push(l);
    if (uit.length >= max) break;
  }
  return uit;
}

/* ------------------------------------------------------- het Google Doc -- */

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function docHtml(o: { r: Uitkomst; datum: string; project: string | null; agendaTitel: string | null; transcript: string; verdieping?: Verdieping | null; aantekeningen?: Aantekening[]; invoer?: string | null; link?: string | null }): string {
  const { r } = o;
  const opsomming = (kop: string, items: string[]) =>
    items.length ? `<h2>${kop}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  const acties = r.actiepunten.length
    ? `<h2>Actiepunten</h2><ul>${r.actiepunten.map((a) => `<li><b>${esc(a.wie)}</b>: ${esc(a.wat)}${a.deadline ? ` <i>(vóór ${esc(a.deadline)})</i>` : ""}</li>`).join("")}</ul>`
    : "";
  const afspraken = r.afspraken.length
    ? `<h2>Afspraken</h2><ul>${r.afspraken.map((a) => `<li>${esc(a.datum)}${a.begintijd ? ` ${esc(a.begintijd)}` : ""}: ${esc(a.wat)}${a.locatie ? `, ${esc(a.locatie)}` : ""}</li>`).join("")}</ul>`
    : "";
  const presentaties = (r.presentaties ?? []).map((p) => `<h2>${esc(p.onderwerp || "Presentatie")}</h2><p><i>${esc(p.spreker)}</i></p>`
    + `${p.kernboodschappen.length ? `<ul>${p.kernboodschappen.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}`
    + `${p.onderbouwing.length ? `<p><b>Onderbouwing</b></p><ul>${p.onderbouwing.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}`).join("");
  const v = o.verdieping;
  const verdieping = v ? `<h2>Bronnen nagezocht</h2>${v.duiding.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}<ol>${v.bronnen.map((b) =>
    `<li><p><b>${esc(b.oordeel)}</b>: ${esc(b.bewering)} <i>(${esc(b.herkomst)})</i></p>${b.bevindingen ? `<p>${esc(b.bevindingen)}</p>` : ""}${b.toelichting ? `<p><i>${esc(b.toelichting)}</i></p>` : ""}<p style="font-size:9pt">${b.gegevens ? esc(b.citaat) + (b.gegevens.url ? ` <a href="${esc(b.gegevens.url)}">${esc(b.gegevens.url)}</a>` : "") : "Niet gevonden in PubMed."}</p></li>`).join("")}</ol>` : "";
  const bronnen = !v && r.bronnen?.length
    ? `<h2>Genoemde bronnen</h2><ol>${r.bronnen.map((b) => `<li>${esc([b.auteurs, b.omschrijving, b.tijdschrift, b.jaar, b.doi && `doi:${b.doi}`].filter(Boolean).join(". "))} <i>(${esc(b.herkomst)})</i></li>`).join("")}</ol>` : "";
  const meta = [o.datum, o.project, o.agendaTitel && `Agenda: ${o.agendaTitel}`, r.deelnemers.length && `Aanwezig: ${r.deelnemers.join(", ")}`]
    .filter(Boolean).map(esc).join("<br>");
  return `<html><head><meta charset="utf-8"></head><body>
<h1>${esc(r.titel)}</h1><p style="color:#59615c">${meta}</p>
${o.link ? `<p><a href="${esc(o.link)}">${esc(o.link)}</a></p>` : ""}${o.invoer?.trim() ? `<h2>Mijn notitie</h2>${o.invoer.trim().split(/\n/).map((l) => `<p>${esc(l)}</p>`).join("")}` : ""}
<h2>Samenvatting</h2>${r.samenvatting.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}
${(o.aantekeningen ?? []).length ? `<h2>Mijn aantekeningen</h2><ul>${o.aantekeningen!.map((a) => `<li>${a.moment != null ? `<b>${esc(mmss(a.moment))}</b> ` : ""}${esc(a.tekst)}</li>`).join("")}</ul>` : ""}
${presentaties}${r.relevantie_praktijk ? `<h2>Relevantie voor de praktijk</h2><p>${esc(r.relevantie_praktijk)}</p>` : ""}${opsomming("Kanttekeningen", r.kanttekeningen)}
${opsomming("Besluiten", r.besluiten)}${acties}${afspraken}${opsomming("Open vragen", r.open_vragen)}${opsomming("Mijn vervolgstappen", r.mijn_vervolgstappen)}
${verdieping}${bronnen}
${o.transcript.trim() ? `<hr><h2>${o.invoer != null ? "Artikel" : "Transcript"}</h2>${o.transcript.split("\n").map((l) => `<p style="font-size:10pt">${esc(l)}</p>`).join("")}` : ""}
<p style="color:#59615c;font-size:9pt">Automatisch gemaakt door BennaAssistent. Controleer namen, bedragen en besluiten vóór gebruik.</p>
</body></html>`;
}

/** Een agenda-afspraak uit de notitie als Google Calendar-gebeurtenis. */
export function agendaGebeurtenis(a: Afspraak, o: { notitieTitel: string; link: string | null }) {
  const beschrijving = `Afgesproken in: ${o.notitieTitel}${o.link ? `\n${o.link}` : ""}`;
  if (!a.begintijd) {
    const volgende = new Date(`${a.datum}T12:00:00Z`);
    volgende.setUTCDate(volgende.getUTCDate() + 1);
    return {
      summary: a.wat, description: beschrijving, location: a.locatie || undefined,
      start: { date: a.datum }, end: { date: volgende.toISOString().slice(0, 10) },
    };
  }
  let eind = a.eindtijd;
  if (!eind || eind <= a.begintijd) {
    const [u, m] = a.begintijd.split(":").map(Number) as [number, number];
    eind = `${String(Math.min(23, u + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (eind <= a.begintijd) eind = "23:59";
  }
  return {
    summary: a.wat, description: beschrijving, location: a.locatie || undefined,
    start: { dateTime: `${a.datum}T${a.begintijd}:00`, timeZone: "Europe/Amsterdam" },
    end: { dateTime: `${a.datum}T${eind}:00`, timeZone: "Europe/Amsterdam" },
  };
}

/** De bestandsextensie die een spraakdienst verwacht bij dit type. */
export function extensieVoor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("m4a") || m.includes("mp4") || m.includes("aac")) return "m4a";
  return "webm";
}

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

/* ------------------------------------------------------------ het schema -- */

export interface Actiepunt {
  wie: string;
  wat: string;
  deadline: string;
  van_mij: boolean;
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
    required: ["titel", "project", "samenvatting", "deelnemers", "besluiten", "actiepunten", "afspraken", "open_vragen", "mijn_vervolgstappen"],
    properties: {
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
    },
  };
}

export interface ProjectContext {
  naam: string;
  trefwoorden?: string[] | null;
}

export function systeemPrompt(o: { mijnNaam: string; datum: string; projecten: ProjectContext[] }): string {
  const proj = o.projecten.length
    ? o.projecten.map((p) => `- ${p.naam}${p.trefwoorden?.length ? ` (${p.trefwoorden.join(", ")})` : ""}`).join("\n")
    : "(geen projecten)";
  return `Je bent de notulist van dr. ${o.mijnNaam} Bennaghmouch: huisarts en praktijkhouder (Het Roosendael, Roermond), kaderarts CVRM bij Meditta, voorzitter van Stichting Achterstandsfonds Limburg, en ondernemer.
Je maakt van een transcript een betrouwbare notitie in het Nederlands.

Regels:
- Gebruik uitsluitend wat in het transcript staat. Verzin geen namen, bedragen, data of besluiten. Is iets onverstaanbaar of dubbelzinnig, zeg dat dan en zet het bij de open vragen.
- Schrijf de samenvatting als heldere, verhalende lopende tekst: wat speelde er, welke afwegingen kwamen langs, waar kwam men uit. Geen opsomming in de samenvatting.
- Een besluit is alleen een besluit als het zo is uitgesproken; voorstellen en meningen zijn geen besluiten.
- Spreker "${o.mijnNaam}" is altijd dr. Bennaghmouch zelf. Andere labels ("Spreker 2B") worden per deel van enkele minuten opnieuw toegekend; hetzelfde label in een ander deel kan een ander persoon zijn. Leid namen af uit aanspreekvormen waar dat kan.
- Op de grens van twee delen kan een zin dubbel staan; neem hem één keer mee.
- De opname is van ${o.datum}. Reken "volgende week vrijdag" alleen om naar een datum als dat eenduidig is.
- Kies het project dat het best past, of "${GEEN_PROJECT}":
${proj}`;
}

export function gebruikerPrompt(o: { transcript: string; agendaTitel?: string | null; deelnemers?: string[]; projectHint?: string | null; bestandsnaam?: string | null }): string {
  const meta = [
    o.agendaTitel && `Agenda-afspraak: ${o.agendaTitel}`,
    o.deelnemers?.length && `Uitgenodigd: ${o.deelnemers.join(", ")}`,
    o.projectHint && `Waarschijnlijk project: ${o.projectHint}`,
    o.bestandsnaam && `Bestandsnaam: ${o.bestandsnaam}`,
  ].filter(Boolean).join("\n");
  return `${meta ? meta + "\n\n" : ""}Transcript:\n${o.transcript}`;
}

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
  };
}

/* ------------------------------------------------------- het Google Doc -- */

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function docHtml(o: { r: Uitkomst; datum: string; project: string | null; agendaTitel: string | null; transcript: string }): string {
  const { r } = o;
  const opsomming = (kop: string, items: string[]) =>
    items.length ? `<h2>${kop}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
  const acties = r.actiepunten.length
    ? `<h2>Actiepunten</h2><ul>${r.actiepunten.map((a) => `<li><b>${esc(a.wie)}</b>: ${esc(a.wat)}${a.deadline ? ` <i>(vóór ${esc(a.deadline)})</i>` : ""}</li>`).join("")}</ul>`
    : "";
  const afspraken = r.afspraken.length
    ? `<h2>Afspraken</h2><ul>${r.afspraken.map((a) => `<li>${esc(a.datum)}${a.begintijd ? ` ${esc(a.begintijd)}` : ""}: ${esc(a.wat)}${a.locatie ? `, ${esc(a.locatie)}` : ""}</li>`).join("")}</ul>`
    : "";
  const meta = [o.datum, o.project, o.agendaTitel && `Agenda: ${o.agendaTitel}`, r.deelnemers.length && `Aanwezig: ${r.deelnemers.join(", ")}`]
    .filter(Boolean).map(esc).join("<br>");
  return `<html><head><meta charset="utf-8"></head><body>
<h1>${esc(r.titel)}</h1><p style="color:#59615c">${meta}</p>
<h2>Samenvatting</h2>${r.samenvatting.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}
${opsomming("Besluiten", r.besluiten)}${acties}${afspraken}${opsomming("Open vragen", r.open_vragen)}${opsomming("Mijn vervolgstappen", r.mijn_vervolgstappen)}
<hr><h2>Transcript</h2>${o.transcript.split("\n").map((l) => `<p style="font-size:10pt">${esc(l)}</p>`).join("")}
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

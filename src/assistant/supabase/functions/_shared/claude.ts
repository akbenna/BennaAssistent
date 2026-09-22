import { env } from "./core.ts";

export const TRIAGE_MODEL = () => Deno.env.get("CLAUDE_TRIAGE_MODEL") ?? "claude-haiku-4-5-20251001";
export const WRITE_MODEL = () => Deno.env.get("CLAUDE_WRITE_MODEL") ?? "claude-sonnet-5";

/** Wat een aanroep heeft gekost. Gaat mee het logboek in, zodat de rekening
    van Anthropic nooit als verrassing komt. */
export interface Verbruik {
  invoer: number;
  uitvoer: number;
}

export interface Antwoord {
  tekst: string;
  verbruik: Verbruik;
}

async function call(model: string, system: string, user: string, maxTokens: number): Promise<Antwoord> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${JSON.stringify(j)}`);
  return {
    tekst: (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"),
    verbruik: {
      invoer: Number(j.usage?.input_tokens ?? 0),
      uitvoer: Number(j.usage?.output_tokens ?? 0),
    },
  };
}

export interface Triage {
  categorie: "actie" | "info" | "wacht_op_ander" | "nieuwsbrief";
  titel: string;
  toelichting: string;
  samenvatting: string;
  deadline: string | null; // YYYY-MM-DD
  prioriteit: "laag" | "normaal" | "hoog";
}

const TRIAGE_SYSTEM = `Je bent de triage van een persoonlijke secretaresse van een Nederlandse huisarts en bestuurder.
Beoordeel één e-mail. Antwoord UITSLUITEND met één JSON-object, zonder uitleg of codeblok:
{"categorie":"actie|info|wacht_op_ander|nieuwsbrief","titel":"korte taaktitel in het Nederlands, begint met een werkwoord","toelichting":"één of twee zinnen: wat moet er gebeuren en waarom","samenvatting":"één zin feitelijke samenvatting","deadline":"YYYY-MM-DD of null","prioriteit":"laag|normaal|hoog"}
"actie" alleen als de ontvanger zelf iets moet doen (antwoorden, beslissen, betalen, bellen, tekenen).
Noem een deadline alleen als die letterlijk in de mail staat. Verzin niets.`;

export async function triage(
  m: { from: string; subject: string; date: Date; text: string },
): Promise<{ triage: Triage; verbruik: Verbruik }> {
  const user = `Van: ${m.from}\nDatum: ${m.date.toISOString()}\nOnderwerp: ${m.subject}\n\n${m.text.slice(0, 6000)}`;
  const { tekst: out, verbruik } = await call(TRIAGE_MODEL(), TRIAGE_SYSTEM, user, 400);
  const clean = out.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const t = JSON.parse(clean.slice(start, end + 1)) as Triage;
  if (!["actie", "info", "wacht_op_ander", "nieuwsbrief"].includes(t.categorie)) t.categorie = "info";
  if (!["laag", "normaal", "hoog"].includes(t.prioriteit)) t.prioriteit = "normaal";
  if (t.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)) t.deadline = null;
  return { triage: t, verbruik };
}

export async function schrijfConcept(o: {
  thread: string;
  instructie?: string;
  sjablonen: { naam: string; inhoud: string }[];
}): Promise<Antwoord> {
  const system = `Je schrijft conceptantwoorden namens dr. A. Bennaghmouch, huisarts en praktijkhouder.
Schrijf in het Nederlands, zakelijk en warm, beknopt, zonder opsommingstekens tenzij nodig.
Beloof niets wat niet uit de mail of de instructie volgt. Verzin geen feiten, data of bedragen;
laat een duidelijke plek [..] open waar informatie ontbreekt. Geef alleen de tekst van de mail, zonder onderwerpregel.
Eindig met: "Met vriendelijke groet,\\n\\nAbdelkader Bennaghmouch".`;
  const sj = o.sjablonen.length
    ? `\n\nSjablonen die mogen worden gebruikt als ze passen:\n${o.sjablonen.map((s) => `### ${s.naam}\n${s.inhoud}`).join("\n\n")}`
    : "";
  const user = `Gesprek (oudste eerst):\n${o.thread.slice(0, 12000)}${sj}\n\nInstructie van de eigenaar: ${o.instructie || "schrijf een passend antwoord op het laatste bericht"}`;
  const a = await call(WRITE_MODEL(), system, user, 1200);
  return { tekst: a.tekst.trim(), verbruik: a.verbruik };
}

/* ------------------------------------------------------------- meedenken -- */

/**
 * Vier manieren waarop het model bij een taak kan helpen. Ze delen één functie
 * omdat ze dezelfde context nodig hebben (de taak plus, als die er is, de
 * mailwisseling) en alleen verschillen in wat ze ermee doen. Vier functies met
 * dezelfde vijftien regels eromheen lopen na een half jaar uiteen.
 *
 * Alle vier geven platte tekst terug, geen JSON: de uitkomst gaat als notitie
 * of als conceptregel het scherm op, en een model dat JSON moet produceren
 * schrijft slechter proza.
 */
export type Denkwijze = "stappen" | "samenvatting" | "hoeken" | "herschrijf";

const PERSOON = `Je helpt dr. A. Bennaghmouch, huisarts en praktijkhouder in Nederland, met zijn
bestuurlijke en zakelijke correspondentie. Schrijf Nederlands. Verzin geen feiten, data, bedragen of
namen die niet in het materiaal staan; laat waar informatie ontbreekt een zichtbare plek [..] open.`;

const OPDRACHT: Record<Denkwijze, string> = {
  stappen: `${PERSOON}
Zet deze taak om in concrete stappen. Hooguit vijf, elk beginnend met een werkwoord en elk op één
regel, afgesloten met een punt. Geen inleiding, geen slotzin, geen opsommingstekens of nummers —
alleen de regels zelf. Noem bij een stap die van iemand anders afhangt wie dat is. Staat er iets
waarvan je het antwoord niet kunt weten, maak daar dan een stap van ("Vraag X na bij Y.").`,

  samenvatting: `${PERSOON}
Vat de mailwisseling samen in hooguit acht zinnen lopende tekst, geen opsomming. Vertel wat er is
afgesproken, wat er openstaat en bij wie de bal ligt. Noem bedragen, data en namen alleen als ze
er letterlijk staan. Eindig met één zin over wat de eerstvolgende handeling zou moeten zijn.`,

  hoeken: `${PERSOON}
Geef drie verschillende manieren waarop hij op dit bericht kan reageren. Elk op één regel: eerst
twee of drie woorden die de lijn benoemen, dan een dubbele punt, dan één zin die uitlegt wat die
lijn inhoudt en wat hij ermee riskeert of wint. Geen inleiding, geen slotzin, precies drie regels.
Maak ze echt verschillend — drie varianten op "vriendelijk bevestigen" is geen keuze.`,

  herschrijf: `${PERSOON}
Herschrijf de aangeleverde concepttekst volgens de gevraagde toon. Behoud alle feiten, toezeggingen
en open plekken [..] precies zoals ze er staan; je verandert de vorm en niet de inhoud. Geef alleen
de herschreven tekst terug, zonder onderwerpregel en zonder toelichting.`,
};

export async function denkMee(o: {
  wijze: Denkwijze;
  taak: { titel: string; toelichting: string | null; deadline: string | null };
  thread?: string;
  concept?: string;
  toon?: string;
}): Promise<Antwoord> {
  const delen = [
    `Taak: ${o.taak.titel}`,
    o.taak.toelichting ? `Toelichting: ${o.taak.toelichting}` : "",
    o.taak.deadline ? `Deadline: ${o.taak.deadline}` : "",
    o.thread ? `\nMailwisseling (oudste eerst):\n${o.thread.slice(0, 12000)}` : "",
    o.concept ? `\nHuidige concepttekst:\n${o.concept.slice(0, 6000)}` : "",
    o.toon ? `\nGevraagde toon: ${o.toon}` : "",
  ].filter(Boolean);
  // Stappen en hoeken zijn kort en mogen naar het snelle model; een samenvatting
  // of een herschrijving draagt de stem van de eigenaar en gaat naar het grote.
  const model = o.wijze === "stappen" || o.wijze === "hoeken" ? TRIAGE_MODEL() : WRITE_MODEL();
  const max = o.wijze === "herschrijf" ? 1200 : 700;
  const a = await call(model, OPDRACHT[o.wijze], delen.join("\n"), max);
  return { tekst: a.tekst.trim(), verbruik: a.verbruik };
}

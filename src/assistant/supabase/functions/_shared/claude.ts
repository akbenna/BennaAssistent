import { env } from "./core.ts";

export const TRIAGE_MODEL = () => Deno.env.get("CLAUDE_TRIAGE_MODEL") ?? "claude-haiku-4-5-20251001";
export const WRITE_MODEL = () => Deno.env.get("CLAUDE_WRITE_MODEL") ?? "claude-sonnet-5";

async function call(model: string, system: string, user: string, maxTokens: number): Promise<string> {
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
  return (j.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
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

export async function triage(m: { from: string; subject: string; date: Date; text: string }): Promise<Triage> {
  const user = `Van: ${m.from}\nDatum: ${m.date.toISOString()}\nOnderwerp: ${m.subject}\n\n${m.text.slice(0, 6000)}`;
  const out = await call(TRIAGE_MODEL(), TRIAGE_SYSTEM, user, 400);
  const clean = out.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const t = JSON.parse(clean.slice(start, end + 1)) as Triage;
  if (!["actie", "info", "wacht_op_ander", "nieuwsbrief"].includes(t.categorie)) t.categorie = "info";
  if (!["laag", "normaal", "hoog"].includes(t.prioriteit)) t.prioriteit = "normaal";
  if (t.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(t.deadline)) t.deadline = null;
  return t;
}

export async function schrijfConcept(o: {
  thread: string;
  instructie?: string;
  sjablonen: { naam: string; inhoud: string }[];
}): Promise<string> {
  const system = `Je schrijft conceptantwoorden namens dr. A. Bennaghmouch, huisarts en praktijkhouder.
Schrijf in het Nederlands, zakelijk en warm, beknopt, zonder opsommingstekens tenzij nodig.
Beloof niets wat niet uit de mail of de instructie volgt. Verzin geen feiten, data of bedragen;
laat een duidelijke plek [..] open waar informatie ontbreekt. Geef alleen de tekst van de mail, zonder onderwerpregel.
Eindig met: "Met vriendelijke groet,\\n\\nAbdelkader Bennaghmouch".`;
  const sj = o.sjablonen.length
    ? `\n\nSjablonen die mogen worden gebruikt als ze passen:\n${o.sjablonen.map((s) => `### ${s.naam}\n${s.inhoud}`).join("\n\n")}`
    : "";
  const user = `Gesprek (oudste eerst):\n${o.thread.slice(0, 12000)}${sj}\n\nInstructie van de eigenaar: ${o.instructie || "schrijf een passend antwoord op het laatste bericht"}`;
  return (await call(WRITE_MODEL(), system, user, 1200)).trim();
}

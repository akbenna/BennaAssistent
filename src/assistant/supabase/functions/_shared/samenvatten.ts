/**
 * VAN TRANSCRIPT NAAR NOTITIE
 *
 * OpenAI eerst, met een strikt schema, zodat er altijd dezelfde velden
 * terugkomen. Valt OpenAI weg, dan Claude met hetzelfde schema als gereedschap.
 * Dat is de verdeling die de eigenaar vroeg: de rest van de assistent draait
 * op Claude, en de lange transcripten van vergaderingen zouden daar de grootste
 * last op leggen.
 */
import { WRITE_MODEL, type Verbruik } from "./claude.ts";
import { gebruikerPrompt, schema, systeemPrompt, trekRecht, type ProjectContext, type Uitkomst } from "./notities.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;

export const openaiTekstModel = () => env("OPENAI_TEXT_MODEL", "gpt-5-mini");

/** Het antwoord van de Responses-API kan op twee plekken tekst dragen. */
export function leesResponsTekst(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  for (const item of data?.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type === "output_text") return c.text;
      if (c.type === "refusal") throw new Error(`Model weigerde: ${c.refusal}`);
    }
  }
  throw new Error("Geen tekst in het OpenAI-antwoord");
}

async function viaOpenAI(sys: string, gebruiker: string, s: unknown): Promise<{ ruw: unknown; verbruik: Verbruik }> {
  const basis = env("OPENAI_BASE_URL", "https://eu.api.openai.com/v1").replace(/\/$/, "");
  const r = await fetch(`${basis}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: openaiTekstModel(),
      input: [{ role: "system", content: sys }, { role: "user", content: gebruiker }],
      text: { format: { type: "json_schema", name: "notitie", schema: s, strict: true } },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI-samenvatting ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return {
    ruw: JSON.parse(leesResponsTekst(data)),
    verbruik: { invoer: Number(data.usage?.input_tokens ?? 0), uitvoer: Number(data.usage?.output_tokens ?? 0) },
  };
}

async function viaClaude(sys: string, gebruiker: string, s: unknown): Promise<{ ruw: unknown; verbruik: Verbruik }> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: WRITE_MODEL(),
      max_tokens: 8000,
      system: sys,
      messages: [{ role: "user", content: gebruiker }],
      tools: [{ name: "notitie", description: "Sla de gestructureerde notitie op", input_schema: s }],
      tool_choice: { type: "tool", name: "notitie" },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude-samenvatting ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const gereedschap = (j.content ?? []).find((c: any) => c.type === "tool_use");
  if (!gereedschap) throw new Error("Geen gestructureerde uitvoer van Claude");
  return { ruw: gereedschap.input, verbruik: { invoer: Number(j.usage?.input_tokens ?? 0), uitvoer: Number(j.usage?.output_tokens ?? 0) } };
}

export async function vatSamen(o: {
  transcript: string;
  mijnNaam: string;
  datum: string;
  projecten: ProjectContext[];
  agendaTitel?: string | null;
  deelnemers?: string[];
  projectHint?: string | null;
  bestandsnaam?: string | null;
}): Promise<{ uitkomst: Uitkomst; dienst: string; verbruik: Verbruik; uitval?: string }> {
  const namen = o.projecten.map((p) => p.naam);
  const s = schema(namen);
  const sys = systeemPrompt({ mijnNaam: o.mijnNaam, datum: o.datum, projecten: o.projecten });
  const gebruiker = gebruikerPrompt(o);
  let uitval: string | undefined;
  if (env("OPENAI_API_KEY")) {
    try {
      const { ruw, verbruik } = await viaOpenAI(sys, gebruiker, s);
      return { uitkomst: trekRecht(ruw, namen), dienst: `openai:${openaiTekstModel()}`, verbruik };
    } catch (e) {
      uitval = String(e instanceof Error ? e.message : e).slice(0, 300);
      if (!env("ANTHROPIC_API_KEY")) throw e;
    }
  }
  const { ruw, verbruik } = await viaClaude(sys, gebruiker, s);
  return { uitkomst: trekRecht(ruw, namen), dienst: `anthropic:${WRITE_MODEL()}`, verbruik, ...(uitval ? { uitval } : {}) };
}

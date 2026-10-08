/**
 * WELKE AI-DIENST EERST
 *
 * De volgorde staat in een omgevingsvariabele en niet in de code, omdat de
 * prijzen verschuiven. Wordt Mistral voor tekst de helft goedkoper, dan is het
 * één regel in Supabase (Edge Functions, Secrets) en geen nieuwe uitrol:
 *
 *   SPRAAK_VOLGORDE = openai,mistral
 *   TEKST_VOLGORDE  = openai,claude,mistral
 *   BEELD_VOLGORDE  = openai,claude
 *
 * Een dienst zonder sleutel wordt overgeslagen, net als een onbekende naam. De
 * eerste die antwoordt wint; de rest is uitval. Wat er uitviel gaat mee terug,
 * zodat het in de notitie te zien is en niet stil verdwijnt.
 *
 * `vraagJson` is de ene plek waar een gestructureerd antwoord wordt gevraagd,
 * voor de samenvatting, voor een foto en voor de verdieping. Elke dienst krijgt
 * hetzelfde schema; OpenAI als strikt json_schema, Claude als gereedschap,
 * Mistral als json_schema in zijn eigen vorm.
 */
import { WRITE_MODEL, type Verbruik } from "./claude.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;

export type TekstDienst = "openai" | "claude" | "mistral";
export type SpraakDienst = "openai" | "mistral";

const SLEUTEL: Record<TekstDienst, string> = {
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

/** De volgorde uit de omgeving, gefilterd op wat bestaat en een sleutel heeft. */
export function volgorde<T extends TekstDienst>(variabele: string, standaard: T[], toegestaan: readonly T[]): T[] {
  const gevraagd = env(variabele).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const lijst = (gevraagd.length ? gevraagd : standaard) as T[];
  const uniek = [...new Set(lijst)].filter((d) => toegestaan.includes(d));
  return uniek.filter((d) => Boolean(env(SLEUTEL[d])));
}

/**
 * Probeert de diensten op volgorde. Gooit pas als ze allemaal faalden, met de
 * redenen van allemaal erin.
 */
export async function opVolgorde<T, D extends string>(
  diensten: D[], doe: (d: D) => Promise<T>, geen: string,
): Promise<{ uitkomst: T; dienst: D; uitval?: string }> {
  if (!diensten.length) throw new Error(geen);
  const fouten: string[] = [];
  for (const d of diensten) {
    try {
      const uitkomst = await doe(d);
      return { uitkomst, dienst: d, ...(fouten.length ? { uitval: fouten.join(" | ").slice(0, 600) } : {}) };
    } catch (e) {
      fouten.push(`${d}: ${String(e instanceof Error ? e.message : e).slice(0, 250)}`);
    }
  }
  throw new Error(`Alle diensten faalden. ${fouten.join(" | ")}`);
}

export const tekstModel = (d: TekstDienst): string =>
  d === "openai" ? env("OPENAI_TEXT_MODEL", "gpt-5-mini")
    : d === "mistral" ? env("MISTRAL_TEXT_MODEL", "mistral-medium-latest")
    : WRITE_MODEL();

export const openaiBasis = () => env("OPENAI_BASE_URL", "https://eu.api.openai.com/v1").replace(/\/$/, "");

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

export interface Afbeelding {
  mime: string;
  base64: string;
}

export interface Vraag {
  naam: string;
  systeem: string;
  gebruiker: string;
  schema: unknown;
  afbeelding?: Afbeelding;
  maxTokens?: number;
}

async function viaOpenAI(v: Vraag): Promise<{ ruw: unknown; verbruik: Verbruik }> {
  const inhoud: unknown[] = [{ type: "input_text", text: v.gebruiker }];
  if (v.afbeelding) inhoud.push({ type: "input_image", image_url: `data:${v.afbeelding.mime};base64,${v.afbeelding.base64}` });
  const r = await fetch(`${openaiBasis()}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: tekstModel("openai"),
      input: [{ role: "system", content: v.systeem }, { role: "user", content: inhoud }],
      text: { format: { type: "json_schema", name: v.naam, schema: v.schema, strict: true } },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return {
    ruw: JSON.parse(leesResponsTekst(data)),
    verbruik: { invoer: Number(data.usage?.input_tokens ?? 0), uitvoer: Number(data.usage?.output_tokens ?? 0) },
  };
}

async function viaClaude(v: Vraag): Promise<{ ruw: unknown; verbruik: Verbruik }> {
  const inhoud: unknown[] = [];
  if (v.afbeelding) inhoud.push({ type: "image", source: { type: "base64", media_type: v.afbeelding.mime, data: v.afbeelding.base64 } });
  inhoud.push({ type: "text", text: v.gebruiker });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: tekstModel("claude"),
      max_tokens: v.maxTokens ?? 8000,
      system: v.systeem,
      messages: [{ role: "user", content: inhoud }],
      tools: [{ name: v.naam, description: "Sla het gestructureerde antwoord op", input_schema: v.schema }],
      tool_choice: { type: "tool", name: v.naam },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const gereedschap = (j.content ?? []).find((c: any) => c.type === "tool_use");
  if (!gereedschap) throw new Error("Geen gestructureerde uitvoer van Claude");
  return { ruw: gereedschap.input, verbruik: { invoer: Number(j.usage?.input_tokens ?? 0), uitvoer: Number(j.usage?.output_tokens ?? 0) } };
}

async function viaMistral(v: Vraag): Promise<{ ruw: unknown; verbruik: Verbruik }> {
  const inhoud: unknown[] = [{ type: "text", text: v.gebruiker }];
  if (v.afbeelding) inhoud.push({ type: "image_url", image_url: `data:${v.afbeelding.mime};base64,${v.afbeelding.base64}` });
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("MISTRAL_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: tekstModel("mistral"),
      messages: [{ role: "system", content: v.systeem }, { role: "user", content: inhoud }],
      response_format: { type: "json_schema", json_schema: { name: v.naam, schema: v.schema, strict: true } },
    }),
  });
  if (!r.ok) throw new Error(`Mistral ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const tekst = j.choices?.[0]?.message?.content;
  if (typeof tekst !== "string") throw new Error("Geen tekst in het Mistral-antwoord");
  return { ruw: JSON.parse(tekst), verbruik: { invoer: Number(j.usage?.prompt_tokens ?? 0), uitvoer: Number(j.usage?.completion_tokens ?? 0) } };
}

const VIA: Record<TekstDienst, (v: Vraag) => Promise<{ ruw: unknown; verbruik: Verbruik }>> = {
  openai: viaOpenAI, claude: viaClaude, mistral: viaMistral,
};

/** Een gestructureerd antwoord van de eerste dienst die het geeft. */
export async function vraagJson(v: Vraag, soort: "TEKST_VOLGORDE" | "BEELD_VOLGORDE" = "TEKST_VOLGORDE") {
  const standaard: TekstDienst[] = soort === "BEELD_VOLGORDE" ? ["openai", "claude"] : ["openai", "claude"];
  const diensten = volgorde(soort, standaard, ["openai", "claude", "mistral"] as const);
  const { uitkomst, dienst, uitval } = await opVolgorde(diensten, (d) => VIA[d](v),
    "Geen taalmodel ingesteld: zet OPENAI_API_KEY, ANTHROPIC_API_KEY of MISTRAL_API_KEY");
  return { ruw: uitkomst.ruw, verbruik: uitkomst.verbruik, dienst: `${dienst}:${tekstModel(dienst)}`, ...(uitval ? { uitval } : {}) };
}

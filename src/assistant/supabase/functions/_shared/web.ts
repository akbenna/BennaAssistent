/**
 * ZOEKEN OP HET WEB, MET EEN ANTWOORD IN EEN VASTE VORM
 *
 * Voor de congres-agent. Het model zoekt zelf (welke pagina's, hoe vaak), wij
 * bepalen de vorm van wat terugkomt. Volgorde in WEB_VOLGORDE, standaard
 * OpenAI en dan Claude, net als de rest van de notities.
 *
 * - OpenAI: de Responses-API met het gereedschap web_search en een strikt
 *   json_schema. Of zoeken op het EU-adres beschikbaar is, verschilt per
 *   project; weigert het, dan neemt Claude het over.
 * - Claude: de zoekfunctie van Anthropic (web_search_20260209) plus één eigen
 *   gereedschap dat het antwoord opslaat. Een lange zoektocht kan halverwege
 *   pauzeren (pause_turn); dan sturen we het gesprek terug en gaat hij verder.
 *
 * Wat er ook terugkomt: de pagina's die het model werkelijk opende of citeerde.
 * Die gaan als bronnen mee, los van wat het model zelf als bron opgeeft.
 */
import { WRITE_MODEL, type Verbruik } from "./claude.ts";
import { opVolgorde, openaiBasis, openaiResponses, leesResponsTekst, tekstModel, volgorde } from "./diensten.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;

export interface WebBron { titel: string; url: string }

export interface WebVraag {
  naam: string;
  systeem: string;
  gebruiker: string;
  schema: unknown;
  /** Hoeveel zoekopdrachten het model mag doen. */
  maxZoek?: number;
  /** Hoe lang één dienst mag doen voordat we opgeven, in milliseconden. */
  tijd?: number;
}

export interface WebAntwoord { ruw: unknown; bronnen: WebBron[]; verbruik: Verbruik; dienst: string; uitval?: string }

/** Unieke http(s)-bronnen, de eerste titel wint. */
export function uniekeBronnen(lijst: WebBron[]): WebBron[] {
  const gezien = new Map<string, WebBron>();
  for (const b of lijst) {
    const url = (b.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const sleutel = url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (!gezien.has(sleutel)) gezien.set(sleutel, { titel: (b.titel ?? "").trim().slice(0, 300) || url, url: url.slice(0, 1000) });
  }
  return [...gezien.values()].slice(0, 60);
}

/** De citaties uit een Responses-antwoord. */
export function citatiesOpenAI(data: any): WebBron[] {
  const uit: WebBron[] = [];
  for (const item of data?.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) for (const a of c.annotations ?? []) {
      if (a.type === "url_citation" && a.url) uit.push({ titel: a.title ?? "", url: a.url });
    }
  }
  return uit;
}

/** De zoekresultaten en citaties uit de inhoud van een Claude-antwoord. */
export function bronnenClaude(inhoud: any[]): WebBron[] {
  const uit: WebBron[] = [];
  for (const b of inhoud ?? []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result" && r.url) uit.push({ titel: r.title ?? "", url: r.url });
    }
    if (b.type === "text") for (const c of b.citations ?? []) if (c.url) uit.push({ titel: c.title ?? "", url: c.url });
  }
  return uit;
}

async function viaOpenAI(v: WebVraag): Promise<Omit<WebAntwoord, "dienst" | "uitval">> {
  const data = await openaiResponses(env("OPENAI_WEB_BASE_URL", openaiBasis()).replace(/\/$/, ""), {
    model: env("OPENAI_WEB_MODEL", tekstModel("openai")),
    input: [{ role: "system", content: v.systeem }, { role: "user", content: v.gebruiker }],
    tools: [{ type: "web_search" }],
    text: { format: { type: "json_schema", name: v.naam, schema: v.schema, strict: true } },
  }, AbortSignal.timeout(v.tijd ?? 120_000));
  return {
    ruw: JSON.parse(leesResponsTekst(data)),
    bronnen: citatiesOpenAI(data),
    verbruik: { invoer: Number(data.usage?.input_tokens ?? 0), uitvoer: Number(data.usage?.output_tokens ?? 0) },
  };
}

async function viaClaude(v: WebVraag): Promise<Omit<WebAntwoord, "dienst" | "uitval">> {
  const eind = Date.now() + (v.tijd ?? 120_000);
  const berichten: Array<{ role: "user" | "assistant"; content: unknown }> = [{ role: "user", content: v.gebruiker }];
  const bronnen: WebBron[] = [];
  const verbruik: Verbruik = { invoer: 0, uitvoer: 0 };
  const systeem = `${v.systeem}\n\nZoek eerst op het web. Sluit altijd af door het gereedschap "${v.naam}" één keer aan te roepen met je volledige antwoord; schrijf het antwoord niet als gewone tekst.`;
  for (let ronde = 0; ronde < 6; ronde++) {
    const resterend = eind - Date.now();
    if (resterend < 5_000) throw new Error("Claude: geen tijd meer");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(resterend),
      headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: env("CLAUDE_WEB_MODEL", "claude-sonnet-5-5"),
        max_tokens: 16000,
        /* Een ronde mag hooguit tweeënhalve minuut duren. Op het standaardniveau
           denkt het model zo lang na dat een verkenning daar niet in paste;
           zoeken en samenvatten vragen geen diep redeneren. */
        output_config: { effort: env("CLAUDE_WEB_EFFORT", "low") },
        system: systeem,
        messages: berichten,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: v.maxZoek ?? 6 },
          { name: v.naam, description: "Sla het eindantwoord op, in precies dit schema.", input_schema: v.schema, strict: true },
        ],
        tool_choice: { type: "auto" },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Claude ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    verbruik.invoer += Number(j.usage?.input_tokens ?? 0);
    verbruik.uitvoer += Number(j.usage?.output_tokens ?? 0);
    bronnen.push(...bronnenClaude(j.content));
    const antwoord = (j.content ?? []).find((c: any) => c.type === "tool_use" && c.name === v.naam);
    if (antwoord) return { ruw: antwoord.input, bronnen, verbruik };
    if (j.stop_reason === "refusal") throw new Error("Claude weigerde");
    berichten.push({ role: "assistant", content: j.content });
    // Bij pause_turn gaat hij vanzelf verder; anders vragen we om het eindantwoord.
    if (j.stop_reason !== "pause_turn") berichten.push({ role: "user", content: `Roep nu "${v.naam}" aan met je antwoord.` });
  }
  throw new Error("Claude gaf geen eindantwoord");
}

const VIA = { openai: viaOpenAI, claude: viaClaude } as const;

export async function zoekOpWeb(v: WebVraag): Promise<WebAntwoord> {
  const diensten = volgorde("WEB_VOLGORDE", ["openai", "claude"], ["openai", "claude"] as const);
  /* Eén Edge Function-ronde duurt hooguit tweeënhalve minuut. De eerste dienst
     krijgt er ruim één, zodat er bij uitval nog tijd is voor de tweede. */
  const eind = Date.now() + (v.tijd ?? 135_000);
  const { uitkomst, dienst, uitval } = await opVolgorde(diensten,
    (d) => VIA[d]({ ...v, tijd: d === diensten[0] && diensten.length > 1 ? Math.min(70_000, eind - Date.now()) : eind - Date.now() }),
    "Geen dienst om op het web te zoeken: zet OPENAI_API_KEY of ANTHROPIC_API_KEY");
  return { ...uitkomst, bronnen: uniekeBronnen(uitkomst.bronnen), dienst, ...(uitval ? { uitval } : {}) };
}

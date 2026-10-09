/**
 * SPRAAK NAAR TEKST
 *
 * Standaard OpenAI eerst (SPRAAK_VOLGORDE, zie `diensten.ts`), via het EU-project, met het model dat sprekers uit elkaar
 * houdt en jouw stem herkent aan een referentie van acht seconden. Valt dat
 * weg, dan Mistral Voxtral, ook in de EU, maar zonder sprekers.
 *
 * Claude staat hier niet tussen: het kan geen audio uitschrijven. De uitval
 * voor de samenvatting is wél Claude; zie `samenvatten.ts`. Zo valt bij een
 * storing bij OpenAI het werk niet stil, en draagt Claude niet de hele last.
 */
import { extensieVoor, type RuwSegment } from "./notities.ts";
import { opVolgorde, volgorde } from "./diensten.ts";

const env = (k: string, d = "") => Deno.env.get(k) || d;
const wacht = (ms: number) => new Promise((k) => setTimeout(k, ms));
const herhaalbaar = (status: number) => status === 429 || status >= 500;

async function verstuur(url: string, sleutel: string, maakFormulier: () => FormData, label: string): Promise<any> {
  for (let poging = 1; poging <= 3; poging++) {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${sleutel}` }, body: maakFormulier() });
    if (r.ok) return r.json();
    const tekst = await r.text();
    if (!herhaalbaar(r.status) || poging === 3) throw new Error(`${label} ${r.status}: ${tekst.slice(0, 300)}`);
    await wacht(1500 * poging * poging);
  }
}

export interface Stem {
  naam: string;
  /** data:audio/wav;base64,... van hooguit tien seconden. */
  referentie: string | null;
}

export const openaiModel = () => env("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe-diarize");

async function viaOpenAI(geluid: Uint8Array<ArrayBuffer>, mime: string, stem: Stem): Promise<RuwSegment[]> {
  const model = openaiModel();
  const sprekers = model.includes("diarize");
  const basis = env("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
  const data = await verstuur(`${basis}/audio/transcriptions`, env("OPENAI_API_KEY"), () => {
    const f = new FormData();
    f.append("file", new Blob([geluid], { type: mime }), `deel.${extensieVoor(mime)}`);
    f.append("model", model);
    if (sprekers) {
      f.append("response_format", "diarized_json");
      f.append("chunking_strategy", "auto");
      if (stem.referentie) {
        f.append("known_speaker_names[]", stem.naam);
        f.append("known_speaker_references[]", stem.referentie);
      }
    } else {
      f.append("response_format", "json");
      f.append("language", "nl");
    }
    return f;
  }, "OpenAI-transcriptie");
  if (sprekers && Array.isArray(data.segments)) {
    return data.segments.map((s: any) => ({ spreker: s.speaker ?? null, start: Number(s.start ?? 0), eind: s.end == null ? null : Number(s.end), tekst: String(s.text ?? "") }));
  }
  return [{ spreker: null, start: 0, eind: null, tekst: String(data.text ?? "") }];
}

async function viaMistral(geluid: Uint8Array<ArrayBuffer>, mime: string): Promise<RuwSegment[]> {
  const data = await verstuur("https://api.mistral.ai/v1/audio/transcriptions", env("MISTRAL_API_KEY"), () => {
    const f = new FormData();
    f.append("file", new Blob([geluid], { type: mime }), `deel.${extensieVoor(mime)}`);
    f.append("model", env("MISTRAL_TRANSCRIBE_MODEL", "voxtral-mini-latest"));
    // Geen taal opgeven: Mistral accepteert die niet samen met tijdstempels,
    // en de tijden zijn nodig om het transcript op volgorde te leggen.
    f.append("timestamp_granularities", "segment");
    return f;
  }, "Mistral-transcriptie");
  if (Array.isArray(data.segments) && data.segments.length) {
    return data.segments.map((s: any) => ({ spreker: null, start: Number(s.start ?? 0), eind: s.end == null ? null : Number(s.end), tekst: String(s.text ?? "") }));
  }
  return [{ spreker: null, start: 0, eind: null, tekst: String(data.text ?? "") }];
}

/** Schrijft één deel uit, in de volgorde van SPRAAK_VOLGORDE. Geeft de stukken tekst en welke dienst het deed. */
export async function schrijfUit(geluid: Uint8Array<ArrayBuffer>, mime: string, stem: Stem): Promise<{ segmenten: RuwSegment[]; dienst: string; uitval?: string }> {
  const diensten = volgorde("SPRAAK_VOLGORDE", ["openai", "mistral"], ["openai", "mistral"] as const);
  const { uitkomst, dienst, uitval } = await opVolgorde(diensten,
    (d) => d === "openai" ? viaOpenAI(geluid, mime, stem) : viaMistral(geluid, mime),
    "Geen spraakdienst ingesteld: zet OPENAI_API_KEY en/of MISTRAL_API_KEY");
  const model = dienst === "openai" ? openaiModel() : env("MISTRAL_TRANSCRIBE_MODEL", "voxtral-mini-latest");
  return { segmenten: uitkomst, dienst: `${dienst}:${model}`, ...(uitval ? { uitval } : {}) };
}

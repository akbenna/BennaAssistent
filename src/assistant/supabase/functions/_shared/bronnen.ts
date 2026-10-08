/**
 * FOTO'S LEZEN EN BRONNEN NAZOEKEN
 *
 * Een foto van een slide wordt gelezen door een taalmodel dat beelden aankan
 * (BEELD_VOLGORDE: standaard OpenAI, dan Claude). Wat eruit komt is tekst, de
 * cijfers en de bronvermeldingen, en die gaan mee in de samenvatting.
 *
 * Nazoeken gebeurt alleen op verzoek van de eigenaar, en in twee stappen die
 * met opzet gescheiden zijn:
 *
 * 1. Opzoeken in PubMed (en Crossref voor een DOI die PubMed niet kent). Dat
 *    is gewoon zoeken, geen taalmodel: wat gevonden wordt is wat er staat.
 * 2. Pas daarna vergelijkt een taalmodel de bewering van de spreker met het
 *    abstract. Het krijgt alleen het abstract en mag niets anders gebruiken;
 *    zonder abstract is het oordeel "niet te beoordelen".
 *
 * Zo komt er nooit een verzonnen studie of een verzonnen uitkomst in de notitie:
 * de bron komt van PubMed, de citatie wordt door de code opgemaakt, en het
 * model mag alleen lezen wat erin staat.
 */
import type { Verbruik } from "./claude.ts";
import { vraagJson, type Afbeelding } from "./diensten.ts";
import {
  FOTO_SYSTEEM, fotoSchema, leesPubmedXml, pubmedZoekterm, schoonDoi, trekFotoRecht, vancouver,
  VERDIEP_SYSTEEM, verdiepSchema,
  type Bron, type BronGegevens, type FotoAnalyse, type Oordeel, type Verdieping, type VerdiepteBron,
} from "./notities.ts";

export async function leesFoto(afbeelding: Afbeelding): Promise<{ analyse: FotoAnalyse; dienst: string; verbruik: Verbruik; uitval?: string }> {
  const { ruw, verbruik, dienst, uitval } = await vraagJson({
    naam: "foto", systeem: FOTO_SYSTEEM, schema: fotoSchema, afbeelding,
    gebruiker: "Lees deze foto. Neem tekst, cijfers en bronvermeldingen letterlijk over.",
    maxTokens: 3000,
  }, "BEELD_VOLGORDE");
  return { analyse: trekFotoRecht(ruw), dienst, verbruik, ...(uitval ? { uitval } : {}) };
}

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
/* NCBI vraagt om een naam en staat zonder sleutel drie verzoeken per seconde toe. */
const NCBI = "tool=bennaassistent";
const wacht = (ms: number) => new Promise((k) => setTimeout(k, ms));

async function haalPubmed(pmids: string[]): Promise<BronGegevens[]> {
  if (!pmids.length) return [];
  const r = await fetch(`${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&${NCBI}&id=${pmids.join(",")}`);
  if (!r.ok) throw new Error(`PubMed efetch ${r.status}`);
  return leesPubmedXml(await r.text());
}

async function zoekPubmed(term: string): Promise<string | null> {
  const r = await fetch(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=1&${NCBI}&term=${encodeURIComponent(term)}`);
  if (!r.ok) throw new Error(`PubMed esearch ${r.status}`);
  const j = await r.json();
  return j.esearchresult?.idlist?.[0] ?? null;
}

async function viaCrossref(doi: string): Promise<BronGegevens | null> {
  const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { "User-Agent": "BennaAssistent (notities)" } });
  if (!r.ok) return null;
  const w = (await r.json()).message ?? {};
  const jaar = String(w.issued?.["date-parts"]?.[0]?.[0] ?? "");
  return {
    pmid: "", doi: schoonDoi(w.DOI ?? doi), titel: String(w.title?.[0] ?? ""),
    auteurs: (w.author ?? []).map((a: any) => `${a.family ?? ""} ${(a.given ?? "").split(/[\s-]+/).map((x: string) => x[0] ?? "").join("")}`.trim()).filter(Boolean),
    tijdschrift: String(w["short-container-title"]?.[0] ?? w["container-title"]?.[0] ?? ""), jaar,
    abstract: String(w.abstract ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    url: `https://doi.org/${schoonDoi(w.DOI ?? doi)}`,
  };
}

/** Zoekt één bron op. Null als hij niet te vinden is; dat is een uitkomst, geen fout. */
export async function zoekBron(b: Bron): Promise<BronGegevens | null> {
  let pmid = b.pmid;
  if (!pmid) {
    const term = pubmedZoekterm(b);
    if (term) pmid = (await zoekPubmed(term)) ?? "";
    await wacht(350);
  }
  if (pmid) {
    const [g] = await haalPubmed([pmid]);
    await wacht(350);
    if (g) return g;
  }
  return b.doi ? viaCrossref(b.doi) : null;
}

/** Zoekt alle bronnen op en laat het model ze naast de beweringen leggen. */
export async function verdiep(bronnen: Bron[]): Promise<{ verdieping: Verdieping; verbruik: Verbruik; uitval?: string }> {
  const gevonden: Array<BronGegevens | null> = [];
  for (const b of bronnen.slice(0, 15)) {
    try { gevonden.push(await zoekBron(b)); } catch { gevonden.push(null); }
  }
  const blokken = bronnen.slice(0, 15).map((b, i) => {
    const g = gevonden[i];
    return `Bron ${i + 1} (${b.herkomst})
Bewering van de spreker: ${b.bewering || "(geen bewering vastgelegd)"}
Zoals genoemd: ${[b.auteurs, b.omschrijving, b.tijdschrift, b.jaar].filter(Boolean).join(", ")}
${g ? `Gevonden: ${vancouver(g)}\nAbstract: ${g.abstract || "(geen abstract beschikbaar)"}` : "Niet gevonden in PubMed of Crossref."}`;
  }).join("\n\n");

  const { ruw, verbruik, dienst, uitval } = await vraagJson({
    naam: "verdieping", systeem: VERDIEP_SYSTEEM, schema: verdiepSchema, maxTokens: 6000,
    gebruiker: `Leg elke bewering naast het abstract van de studie waar hij zich op beroept.\n\n${blokken}`,
  });
  const r = (ruw ?? {}) as { bronnen?: Array<{ nummer?: number; bevindingen?: string; oordeel?: string; toelichting?: string }>; duiding?: string };
  const OORDELEN: Oordeel[] = ["bevestigd", "genuanceerd", "afwijkend", "niet te beoordelen"];
  const uitkomst: VerdiepteBron[] = bronnen.slice(0, 15).map((b, i) => {
    const g = gevonden[i] ?? null;
    const m = (r.bronnen ?? []).find((x) => Number(x.nummer) === i + 1);
    // Zonder abstract mag het model niets beweren, ook als het dat toch doet.
    const zonderAbstract = !g?.abstract;
    return {
      herkomst: b.herkomst, bewering: b.bewering, gevonden: Boolean(g), gegevens: g,
      citaat: g ? vancouver(g) : "",
      bevindingen: zonderAbstract ? "" : String(m?.bevindingen ?? "").slice(0, 2000),
      oordeel: zonderAbstract ? "niet te beoordelen" : OORDELEN.includes(m?.oordeel as Oordeel) ? m!.oordeel as Oordeel : "niet te beoordelen",
      toelichting: zonderAbstract ? (g ? "Er is geen abstract beschikbaar." : "Deze bron is niet gevonden.") : String(m?.toelichting ?? "").slice(0, 1000),
    };
  });
  return {
    verdieping: { bronnen: uitkomst, duiding: String(r.duiding ?? "").slice(0, 6000), dienst, gemaakt_op: new Date().toISOString() },
    verbruik, ...(uitval ? { uitval } : {}),
  };
}

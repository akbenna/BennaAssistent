/**
 * VAN TRANSCRIPT NAAR NOTITIE
 *
 * Eén vraag met een strikt schema, aan de eerste dienst uit TEKST_VOLGORDE die
 * antwoordt (standaard OpenAI, dan Claude). De rest van de assistent draait op
 * Claude; de lange transcripten van vergaderingen en congressen zouden daar de
 * grootste last op leggen, en dat was precies wat de eigenaar niet wilde.
 */
import type { Verbruik } from "./claude.ts";
import { vraagJson } from "./diensten.ts";
import {
  gebruikerPrompt, schema, systeemPrompt, trekRecht,
  type FotoVoorPrompt, type ProjectContext, type Soort, type Uitkomst,
} from "./notities.ts";

export async function vatSamen(o: {
  transcript: string;
  mijnNaam: string;
  datum: string;
  projecten: ProjectContext[];
  soort?: Soort;
  agendaTitel?: string | null;
  deelnemers?: string[];
  projectHint?: string | null;
  bestandsnaam?: string | null;
  fotos?: FotoVoorPrompt[];
  markeringen?: number[];
}): Promise<{ uitkomst: Uitkomst; dienst: string; verbruik: Verbruik; uitval?: string }> {
  const namen = o.projecten.map((p) => p.naam);
  const { ruw, verbruik, dienst, uitval } = await vraagJson({
    naam: "notitie",
    systeem: systeemPrompt({ mijnNaam: o.mijnNaam, datum: o.datum, projecten: o.projecten, soort: o.soort ?? "vergadering" }),
    gebruiker: gebruikerPrompt(o),
    schema: schema(namen),
  });
  return { uitkomst: trekRecht(ruw, namen), dienst, verbruik, ...(uitval ? { uitval } : {}) };
}

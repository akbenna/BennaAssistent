import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const sleutel = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !sleutel) {
  throw new Error(
    "VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY ontbreken. Kopieer .env.example naar .env.",
  );
}

export const supabase = createClient(url, sleutel, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Roept een Edge Function aan met de sessie van de ingelogde eigenaar. */
export async function roepFunctie<T>(naam: string, lichaam?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(naam, {
    body: lichaam ?? {},
  });
  if (error) {
    // Edge Functions geven hun eigen foutmelding in de body; die is voor de lezer bruikbaarder.
    const tekst = await leesFout(error);
    throw new Error(tekst);
  }
  const d = data as { fout?: string } | null;
  if (d && typeof d.fout === "string") throw new Error(d.fout);
  return data as T;
}

async function leesFout(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { fout?: string };
      if (body?.fout) return body.fout;
    } catch {
      /* geen JSON-body; val terug op de melding zelf */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

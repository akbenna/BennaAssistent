import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Admin = SupabaseClient;

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Ontbrekende omgevingsvariabele: ${name}`);
  return v;
}

export function adminClient(): Admin {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Cron-aanroepen dragen een gedeeld geheim; zonder geheim geen toegang. */
export function isCron(req: Request): boolean {
  const s = Deno.env.get("CRON_SECRET");
  return !!s && req.headers.get("x-cron-secret") === s;
}

/** Ingelogde eigenaar uit de Authorization-header, of null. */
export async function userId(req: Request, admin: Admin): Promise<string | null> {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

export async function audit(
  admin: Admin,
  ownerId: string,
  actie: string,
  extra: { object_type?: string; object_id?: string; model?: string; details?: unknown } = {},
): Promise<void> {
  await admin.from("audit_log").insert({
    owner_id: ownerId,
    actie,
    object_type: extra.object_type ?? null,
    object_id: extra.object_id ?? null,
    model: extra.model ?? null,
    details: extra.details ?? {},
  });
}

/** Aantal werkdagen (ma–vr) tussen twee momenten, exclusief de startdag. */
export function werkdagenTussen(van: Date, tot: Date): number {
  let n = 0;
  const d = new Date(Date.UTC(van.getUTCFullYear(), van.getUTCMonth(), van.getUTCDate()));
  const eind = Date.UTC(tot.getUTCFullYear(), tot.getUTCMonth(), tot.getUTCDate());
  while (d.getTime() < eind) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Datum en uur in Europe/Amsterdam. */
export function amsterdamNu(nu = new Date()): { datum: string; uur: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(nu);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { datum: `${g("year")}-${g("month")}-${g("day")}`, uur: Number(g("hour")) % 24 };
}

/** Weergavenaam van de webapp. */
export const APP_NAME = "BennaAssistent";

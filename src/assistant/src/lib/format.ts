const ZONE = "Europe/Amsterdam";

/** Datum van vandaag in Amsterdam, als YYYY-MM-DD. */
export function vandaag(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function datumKort(waarde: string | null | undefined): string {
  if (!waarde) return "";
  const d = new Date(waarde.length === 10 ? `${waarde}T12:00:00Z` : waarde);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: ZONE, weekday: "short", day: "numeric", month: "short",
  }).format(d);
}

export function datumLang(waarde: string | null | undefined): string {
  if (!waarde) return "";
  const d = new Date(waarde.length === 10 ? `${waarde}T12:00:00Z` : waarde);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(d);
}

export function tijdKort(waarde: string | null | undefined): string {
  if (!waarde) return "";
  if (waarde.length === 10) return "hele dag";
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

/** "vandaag", "gisteren", "3 dagen geleden", "over 2 dagen". */
export function relatief(waarde: string | null | undefined): string {
  if (!waarde) return "";
  const d = new Date(waarde.length === 10 ? `${waarde}T12:00:00Z` : waarde);
  if (Number.isNaN(d.getTime())) return "";
  const dagen = dagenTussenVandaag(d);
  if (dagen === 0) return "vandaag";
  if (dagen === 1) return "morgen";
  if (dagen === -1) return "gisteren";
  const rtf = new Intl.RelativeTimeFormat("nl-NL", { numeric: "auto" });
  if (Math.abs(dagen) < 14) return rtf.format(dagen, "day");
  if (Math.abs(dagen) < 60) return rtf.format(Math.round(dagen / 7), "week");
  return rtf.format(Math.round(dagen / 30), "month");
}

function dagenTussenVandaag(d: Date): number {
  const dag = (x: Date) =>
    Date.parse(`${new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(x)}T00:00:00Z`);
  return Math.round((dag(d) - dag(new Date())) / 86400000);
}

export type DeadlineToon = "verlopen" | "vandaag" | "binnenkort" | "later" | "geen";

export function deadlineToon(datum: string | null | undefined): DeadlineToon {
  if (!datum) return "geen";
  const dagen = dagenTussenVandaag(new Date(`${datum}T12:00:00Z`));
  if (dagen < 0) return "verlopen";
  if (dagen === 0) return "vandaag";
  if (dagen <= 3) return "binnenkort";
  return "later";
}

/** "Frans Stelten <info@…>" wordt "Frans Stelten". */
export function afzenderNaam(afzender: string | null | undefined): string {
  if (!afzender) return "onbekend";
  const m = afzender.match(/^\s*"?([^"<]+?)"?\s*</);
  if (m?.[1]) return m[1].trim();
  return afzender.replace(/[<>]/g, "").trim();
}

export function knip(tekst: string | null | undefined, lengte = 160): string {
  if (!tekst) return "";
  return tekst.length > lengte ? `${tekst.slice(0, lengte - 1).trimEnd()}…` : tekst;
}

import { supabase } from "./supabase";
import { vandaag } from "./format";
import type { Ontleding } from "./bricks";
import type {
  Bron, Concept, Dagoverzicht, Filter, Item, Logregel, Notitie, NotitieSoort,
  DeclaratieImport, DeclaratieMaand,
  Koppeling, Opvolging, Prioriteit, Project, Sjabloon, TaakRij, TaakStatus,
  Terugkerend, TerugkerendRij,
} from "../types/db";

const TAAK_VELDEN = "id,project_id,titel,toelichting,status,prioriteit,deadline,aangemaakt_door,afgerond_op,gearchiveerd_op,created_at,updated_at";
const TAAK_MET_PROJECT = `${TAAK_VELDEN},projects(naam,kleur)`;

function controleer<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const LOPEND: TaakStatus[] = ["open", "wacht_op_antwoord", "antwoord_binnen"];

/** Telquery zonder filters: alle niet-gearchiveerde taken van de eigenaar. */
const telBasis = () =>
  supabase.from("tasks").select("id", { count: "exact", head: true }).is("gearchiveerd_op", null);

export async function haalTaken(opties: {
  statussen?: TaakStatus[];
  projectId?: string | null;
  deadlineTot?: string;
  limiet?: number;
} = {}): Promise<TaakRij[]> {
  let q = supabase.from("tasks").select(TAAK_MET_PROJECT).is("gearchiveerd_op", null);
  if (opties.statussen?.length) q = q.in("status", opties.statussen);
  if (opties.projectId) q = q.eq("project_id", opties.projectId);
  if (opties.deadlineTot) q = q.lte("deadline", opties.deadlineTot);
  q = q
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opties.limiet ?? 200);
  return controleer(await q.returns<TaakRij[]>());
}

export async function haalTaak(id: string): Promise<TaakRij | null> {
  const { data, error } = await supabase.from("tasks").select(TAAK_MET_PROJECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TaakRij | null) ?? null;
}

export interface Tellingen {
  voorstellen: number;
  vandaag: number;
  wachten: number;
  antwoord: number;
}

export async function haalTellingen(): Promise<Tellingen> {
  const [voorstellen, vandaagAantal, wachten, antwoord] = await Promise.all([
    telUit(telBasis().eq("status", "voorstel")),
    telUit(telBasis().in("status", ["open", "antwoord_binnen"]).lte("deadline", vandaag())),
    telUit(telBasis().eq("status", "wacht_op_antwoord")),
    telUit(telBasis().eq("status", "antwoord_binnen")),
  ]);
  return { voorstellen, vandaag: vandaagAantal, wachten, antwoord };
}

async function telUit(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function haalDagoverzicht(datum = vandaag()): Promise<Dagoverzicht | null> {
  const { data, error } = await supabase.from("briefs").select("inhoud").eq("datum", datum).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.inhoud as Dagoverzicht | undefined) ?? null;
}

export async function haalProjecten(metArchief = false): Promise<Project[]> {
  let q = supabase.from("projects").select("id,naam,kleur,trefwoorden,afzenders,gearchiveerd,created_at");
  if (!metArchief) q = q.eq("gearchiveerd", false);
  return controleer(await q.order("naam").returns<Project[]>());
}

export async function haalBronnenVanTaak(taakId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("task_links")
    .select("items(id,source_id,extern_id,thread_id,deeplink,afzender,onderwerp,samenvatting,ontvangen_op,uitgesloten,uitsluitreden)")
    .eq("task_id", taakId)
    .returns<Array<{ items: Item | null }>>();
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => r.items)
    .filter((i): i is Item => Boolean(i));
}

export async function haalNotities(taakId: string): Promise<Notitie[]> {
  return controleer(
    await supabase.from("task_notes").select("id,task_id,soort,inhoud,created_at")
      .eq("task_id", taakId).order("created_at", { ascending: false }).returns<Notitie[]>(),
  );
}

export async function haalConcepten(taakId: string): Promise<Concept[]> {
  return controleer(
    await supabase.from("drafts").select("id,task_id,gmail_draft_id,thread_id,status,goedgekeurd_op,verstuurd_op,created_at")
      .eq("task_id", taakId).neq("status", "weggegooid")
      .order("created_at", { ascending: false }).returns<Concept[]>(),
  );
}

export async function haalOpvolging(taakId: string): Promise<Opvolging[]> {
  return controleer(
    await supabase.from("followups").select("id,task_id,thread_id,verstuurd_op,herinner_na_werkdagen,beantwoord_op,laatste_herinnering_op")
      .eq("task_id", taakId).order("verstuurd_op", { ascending: false }).returns<Opvolging[]>(),
  );
}

export interface TaakWijziging {
  titel?: string;
  toelichting?: string | null;
  status?: TaakStatus;
  prioriteit?: Prioriteit;
  deadline?: string | null;
  project_id?: string | null;
  afgerond_op?: string | null;
  gearchiveerd_op?: string | null;
}

export async function werkTaakBij(id: string, wijziging: TaakWijziging): Promise<void> {
  const { error } = await supabase.from("tasks").update(wijziging).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function maakTaak(velden: {
  titel: string;
  toelichting?: string | null;
  deadline?: string | null;
  prioriteit?: Prioriteit;
  project_id?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...velden, status: "open", aangemaakt_door: "eigenaar" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function rondTaakAf(id: string): Promise<void> {
  await werkTaakBij(id, { status: "afgerond", afgerond_op: new Date().toISOString() });
}

export async function voegNotitieToe(taakId: string, inhoud: string, soort: NotitieSoort = "notitie"): Promise<void> {
  const { error } = await supabase.from("task_notes").insert({ task_id: taakId, inhoud, soort });
  if (error) throw new Error(error.message);
}

export async function haalBronnen(): Promise<Bron[]> {
  return controleer(
    await supabase.from("sources").select("id,kind,account,actief,laatst_gesynct,laatste_fout")
      .order("kind").returns<Bron[]>(),
  );
}

export async function haalFilters(): Promise<Filter[]> {
  return controleer(
    await supabase.from("filters").select("id,soort,waarde,omschrijving,actief")
      .order("soort").order("waarde").returns<Filter[]>(),
  );
}

export async function bewaarFilter(f: Omit<Filter, "id"> & { id?: string }): Promise<void> {
  const { id, ...rest } = f;
  const { error } = id
    ? await supabase.from("filters").update(rest).eq("id", id)
    : await supabase.from("filters").insert(rest);
  if (error) throw new Error(error.message);
}

export async function verwijderFilter(id: string): Promise<void> {
  const { error } = await supabase.from("filters").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function haalSjablonen(): Promise<Sjabloon[]> {
  return controleer(
    await supabase.from("templates").select("id,naam,wanneer,inhoud,actief").order("naam").returns<Sjabloon[]>(),
  );
}

export async function bewaarSjabloon(s: Omit<Sjabloon, "id"> & { id?: string }): Promise<void> {
  const { id, ...rest } = s;
  const { error } = id
    ? await supabase.from("templates").update(rest).eq("id", id)
    : await supabase.from("templates").insert(rest);
  if (error) throw new Error(error.message);
}

export async function verwijderSjabloon(id: string): Promise<void> {
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bewaarProject(p: Omit<Project, "id" | "created_at"> & { id?: string }): Promise<void> {
  const { id, ...rest } = p;
  const { error } = id
    ? await supabase.from("projects").update(rest).eq("id", id)
    : await supabase.from("projects").insert(rest);
  if (error) throw new Error(error.message);
}

export async function haalLogboek(limiet = 60): Promise<Logregel[]> {
  return controleer(
    await supabase.from("audit_log").select("id,actie,object_type,object_id,model,details,created_at")
      .order("created_at", { ascending: false }).limit(limiet).returns<Logregel[]>(),
  );
}

/** Aantal taken per project, voor de projectenweergave. */
export async function haalProjectTellingen(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tasks").select("project_id").is("gearchiveerd_op", null).in("status", LOPEND);
  if (error) throw new Error(error.message);
  const uit: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ project_id: string | null }>) {
    if (r.project_id) uit[r.project_id] = (uit[r.project_id] ?? 0) + 1;
  }
  return uit;
}

/**
 * De documenten die Drive sinds kort heeft zien veranderen. Uitgesloten items
 * blijven weg: daar staat alleen van vast dát ze zijn overgeslagen, en een lege
 * regel op het scherm helpt niemand.
 */
export async function haalDocumenten(limiet = 6): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id,source_id,extern_id,thread_id,deeplink,afzender,onderwerp,samenvatting,ontvangen_op,uitgesloten,uitsluitreden,sources!inner(kind)")
    .eq("sources.kind", "drive").eq("uitgesloten", false)
    .order("ontvangen_op", { ascending: false }).limit(limiet)
    .returns<Item[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Hoeveel taken je op elk van de afgelopen `dagen` dagen hebt afgerond.
 * Voor de strook in de hero: één dag zegt niets, veertien dagen zeggen of je
 * bezig bent. De datum wordt in Amsterdam geteld en niet in UTC, anders valt
 * alles wat je na tweeën 's nachts afrondt op de verkeerde dag.
 */
export async function haalAfrondingenPerDag(dagen = 14): Promise<Array<{ datum: string; aantal: number }>> {
  const start = new Date(Date.now() - (dagen - 1) * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("tasks").select("afgerond_op")
    .not("afgerond_op", "is", null).gte("afgerond_op", start.toISOString())
    .returns<Array<{ afgerond_op: string }>>();
  if (error) throw new Error(error.message);

  const dag = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const tel: Record<string, number> = {};
  for (const r of data ?? []) tel[dag.format(new Date(r.afgerond_op))] = (tel[dag.format(new Date(r.afgerond_op))] ?? 0) + 1;

  const uit: Array<{ datum: string; aantal: number }> = [];
  for (let i = dagen - 1; i >= 0; i--) {
    const d = dag.format(new Date(Date.now() - i * 86400000));
    uit.push({ datum: d, aantal: tel[d] ?? 0 });
  }
  return uit;
}

/**
 * Een taak naar later schuiven. De status gaat naar open (een voorstel dat je
 * uitstelt heb je impliciet geaccepteerd) en de deadline naar vandaag plus
 * `dagen`. Nul dagen betekent vandaag.
 */
export async function stelUit(id: string, dagen: number): Promise<void> {
  const d = new Date(Date.now() + dagen * 86400000);
  const datum = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  await werkTaakBij(id, { status: "open", deadline: datum });
}

/** Het e-mailadres uit "Frans Stelten <info@…>", in kleine letters. */
export function adresUit(afzender: string | null | undefined): string | null {
  if (!afzender) return null;
  const m = afzender.match(/<([^>]+)>/);
  const kaal = (m?.[1] ?? afzender).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kaal) ? kaal : null;
}

/**
 * Deze afzender of dit hele domein voortaan overslaan. Het gaat als filterregel
 * de database in, en het privacyfilter in de serverfuncties leest dezelfde
 * tabel — het werkt dus meteen bij de volgende ophaalronde.
 */
export async function sluitUit(
  soort: "afzender" | "domein",
  waarde: string,
  omschrijving: string | null = null,
): Promise<void> {
  const { error } = await supabase.from("filters")
    .insert({ soort, waarde: waarde.toLowerCase(), omschrijving, actief: true });
  if (error) throw new Error(error.message);
}

/** Bronberichten voor meerdere taken tegelijk, voor lijstweergaven. */
export async function haalBronnenVoorTaken(taakIds: string[]): Promise<Record<string, Item[]>> {
  if (taakIds.length === 0) return {};
  const { data, error } = await supabase
    .from("task_links")
    .select("task_id,items(id,source_id,extern_id,thread_id,deeplink,afzender,onderwerp,samenvatting,ontvangen_op,uitgesloten,uitsluitreden)")
    .in("task_id", taakIds)
    .returns<Array<{ task_id: string; items: Item | null }>>();
  if (error) throw new Error(error.message);
  const uit: Record<string, Item[]> = {};
  for (const r of data ?? []) {
    if (!r.items) continue;
    (uit[r.task_id] ??= []).push(r.items);
  }
  return uit;
}

/* ---------------------------------------------------- declaratiedata ----- */

/**
 * Een ontleed Bricks-rapport wegschrijven.
 *
 * Opnieuw importeren van dezelfde maand overschrijft: de bestaande regels voor
 * die maanden gaan er eerst uit. Dat is met opzet, want een export wordt vaak
 * een tweede keer gemaakt nadat er is nagedeclareerd, en twee halve waarheden
 * naast elkaar zijn erger dan één bijgewerkte.
 */
export async function bewaarDeclaraties(
  o: Ontleding,
  bestandsnaam: string,
): Promise<{ import_id: string; weggeschreven: number }> {
  const { data: imp, error: impFout } = await supabase
    .from("declaratie_import")
    .insert({
      rapport: o.rapport,
      bestandsnaam,
      praktijknummer: o.praktijknummer,
      periode: o.periode,
      stand_database: o.standDatabase,
      aantal_regels: o.prestaties.length + o.facturen.length,
    })
    .select("id").single();
  if (impFout) throw new Error(impFout.message);
  const importId = (imp as { id: string }).id;

  if (o.prestaties.length) {
    const maanden = [...new Set(o.prestaties.map((p) => p.maand))];
    // Rapport 05 en 25 wonen in dezelfde tabel; `medewerker` scheidt ze. Een
    // herimport van het ene mag het andere niet wissen.
    let wis = supabase.from("declaratie_prestatie").delete().in("maand", maanden);
    wis = o.rapport === "25" ? wis.not("medewerker", "is", null) : wis.is("medewerker", null);
    const { error } = await wis;
    if (error) throw new Error(error.message);

    for (const brok of inStukken(o.prestaties, 500)) {
      const { error: e } = await supabase.from("declaratie_prestatie")
        .insert(brok.map((p) => ({ ...p, import_id: importId })));
      if (e) throw new Error(e.message);
    }
  }

  if (o.facturen.length) {
    const nummers = [...new Set(o.facturen.map((f) => f.factuurnummer))];
    for (const brok of inStukken(nummers, 300)) {
      const { error } = await supabase.from("declaratie_factuur").delete().in("factuurnummer", brok);
      if (error) throw new Error(error.message);
    }
    for (const brok of inStukken(o.facturen, 500)) {
      const { error: e } = await supabase.from("declaratie_factuur")
        .insert(brok.map((f) => ({ ...f, import_id: importId })));
      if (e) throw new Error(e.message);
    }
  }

  return { import_id: importId, weggeschreven: o.prestaties.length + o.facturen.length };
}

/** PostgREST slikt geen duizenden rijen in één keer; vandaar deze hapjes. */
function inStukken<T>(rijen: T[], maat: number): T[][] {
  const uit: T[][] = [];
  for (let i = 0; i < rijen.length; i += maat) uit.push(rijen.slice(i, i + maat));
  return uit;
}

export async function haalMaandstaat(): Promise<DeclaratieMaand[]> {
  return controleer(
    await supabase.from("declaratie_maand").select("*").order("maand").returns<DeclaratieMaand[]>(),
  );
}

export async function haalDeclaratieImports(): Promise<DeclaratieImport[]> {
  return controleer(
    await supabase.from("declaratie_import")
      .select("id,rapport,bestandsnaam,praktijknummer,periode,stand_database,aantal_regels,created_at")
      .order("created_at", { ascending: false }).limit(20).returns<DeclaratieImport[]>(),
  );
}

/* ------------------------------------------------------- cockpit --------- */

const KOPPELING_VELDEN = "id,naam,url,omschrijving,groep,volgorde,actief";

export async function haalKoppelingen(metInactief = false): Promise<Koppeling[]> {
  let q = supabase.from("koppelingen").select(KOPPELING_VELDEN);
  if (!metInactief) q = q.eq("actief", true);
  return controleer(
    await q.order("groep", { ascending: true, nullsFirst: false })
      .order("volgorde").order("naam").returns<Koppeling[]>(),
  );
}

export async function bewaarKoppeling(k: Omit<Koppeling, "id"> & { id?: string }): Promise<void> {
  const { error } = k.id
    ? await supabase.from("koppelingen").update(k).eq("id", k.id)
    : await supabase.from("koppelingen").insert(k);
  if (error) throw new Error(error.message);
}

export async function verwijderKoppeling(id: string): Promise<void> {
  const { error } = await supabase.from("koppelingen").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const RITME_VELDEN =
  "id,project_id,titel,toelichting,link,ritme,dag_van_week,dag_van_maand,maand,alleen_werkdagen,prioriteit,actief,laatst_gepland";

export async function haalTerugkerend(): Promise<TerugkerendRij[]> {
  return controleer(
    await supabase.from("terugkerend").select(`${RITME_VELDEN},projects(naam,kleur)`)
      .order("ritme").order("titel").returns<TerugkerendRij[]>(),
  );
}

export async function bewaarTerugkerend(t: Partial<Terugkerend> & { id: string }): Promise<void> {
  const { id, ...rest } = t;
  const { error } = await supabase.from("terugkerend").update(rest).eq("id", id);
  if (error) throw new Error(error.message);
}

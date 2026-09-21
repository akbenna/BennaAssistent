import { supabase } from "./supabase";
import { vandaag } from "./format";
import type {
  Bron, Concept, Dagoverzicht, Filter, Item, Logregel, Notitie, NotitieSoort,
  Opvolging, Prioriteit, Project, Sjabloon, TaakRij, TaakStatus,
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

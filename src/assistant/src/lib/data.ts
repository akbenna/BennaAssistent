import { maakVoorbereiding, type Voorbereiding, type VorigeNotitie } from "./voorbereiding";
import { roepFunctie, supabase } from "./supabase";
import { vandaag } from "./format";
import { metActueleDeadlines, weekVan } from "./week";
import type {
  Bron, Concept, Dagoverzicht, Filter, Item, Logregel, Notitie, NotitieSoort,
  Foto, Gezondheid, Koppeling, NascholingRegel, NotitieAntwoord, Opname, OpnameInstellingen, OpnameRegel, Opvolging, Prioriteit, Project, Schuldig, Sjabloon,
  TaakRij, TaakStatus, Terugkerend, TerugkerendRij, Verbruik, Weekoverzicht,
} from "../types/db";

const TAAK_VELDEN = "id,project_id,titel,toelichting,status,prioriteit,deadline,aangemaakt_door,afgerond_op,gearchiveerd_op,created_at,updated_at";
const TAAK_MET_PROJECT = `${TAAK_VELDEN},projects(naam,kleur)`;

function controleer<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
}

export const LOPEND: TaakStatus[] = ["open", "wacht_op_antwoord", "antwoord_binnen"];

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
  /** Notities die klaarstaan om na te lezen, of op een bevestiging wachten. */
  notities?: number;
}

/* Eén rondje in plaats van vier. De tabbalk vraagt dit bij elke navigatie en
   elke minuut; vier losse HEAD-verzoeken waren daar een verspilling. De dag
   wordt in de database bepaald, in Amsterdamse tijd — de browser van een
   reizende gebruiker mag daar niet over meebeslissen. */
export async function haalTellingen(): Promise<Tellingen> {
  const { data, error } = await supabase.rpc("tellingen");
  if (error) throw new Error(error.message);
  return data as Tellingen;
}

export async function haalDagoverzicht(datum = vandaag()): Promise<Dagoverzicht | null> {
  // Op maandag staan er twee overzichten op dezelfde datum: het dagoverzicht
  // en het weekoverzicht. Zonder deze filter zou `maybeSingle` daarop stuklopen.
  const { data, error } = await supabase.from("briefs").select("inhoud")
    .eq("datum", datum).eq("soort", "dag").maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.inhoud as Dagoverzicht | undefined) ?? null;
}

/**
 * Het weekoverzicht van de week waarin `datum` valt. Het wordt op maandag
 * gemaakt en staat op de maandag; op donderdag kijk je dus nog steeds naar
 * hetzelfde stuk, en dat is de bedoeling.
 */
export async function haalWeekoverzicht(datum = vandaag()): Promise<Weekoverzicht | null> {
  const week = weekVan(datum);
  const [opname, taken] = await Promise.all([
    supabase.from("briefs").select("inhoud")
      .eq("datum", week.maandag).eq("soort", "week").maybeSingle(),
    supabase.from("tasks").select("id,titel,deadline,prioriteit,status")
      .is("gearchiveerd_op", null).in("status", ["open", "antwoord_binnen"])
      .gte("deadline", week.maandag).lte("deadline", week.zondag).order("deadline"),
  ]);
  if (opname.error) throw new Error(opname.error.message);
  if (taken.error) throw new Error(taken.error.message);
  return metActueleDeadlines((opname.data?.inhoud as Weekoverzicht | undefined) ?? null, week, taken.data ?? []);
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


/* ------------------------------------------------------- cockpit --------- */

const KOPPELING_VELDEN = "id,naam,url,omschrijving,groep,volgorde,actief";

export async function haalKoppelingen(metInactief = false): Promise<Koppeling[]> {
  let q = supabase.from("koppelingen").select(KOPPELING_VELDEN);
  if (!metInactief) q = q.eq("actief", true);
  // Op volgorde en niet op groepsnaam: alfabetisch zou "Dagelijks" tussen
  // Analyse en Zorg zetten. De nummers staan per groep in een eigen honderdtal,
  // zodat één sortering zowel de groepen als de tegels erbinnen ordent.
  return controleer(await q.order("volgorde").order("naam").returns<Koppeling[]>());
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

/* --------------------------------------------------------- toezicht ------ */

/** Hoe het de nachtploeg vergaat. Leest `cron.job_run_details` via een functie
    met definer-rechten; de opdracht zelf komt niet mee terug. */
export async function haalGezondheid(): Promise<Gezondheid[]> {
  const { data, error } = await supabase.rpc("cron_gezondheid");
  if (error) throw new Error(error.message);
  return (data ?? []) as Gezondheid[];
}

/**
 * Wat de modellen deze maand hebben gekost, in tokens.
 *
 * De aantallen staan in het logboek bij elke aanroep. Optellen gebeurt hier en
 * niet in de database: het zijn een paar honderd regels per maand, en een
 * aparte view voor een getal dat je één keer per week bekijkt is overdaad.
 */
export async function haalVerbruik(): Promise<Verbruik[]> {
  const eersteVanDeMaand = `${vandaag().slice(0, 7)}-01T00:00:00Z`;
  const { data, error } = await supabase
    .from("audit_log").select("model,details")
    .not("model", "is", null).gte("created_at", eersteVanDeMaand)
    .returns<Array<{ model: string; details: Record<string, unknown> }>>();
  if (error) throw new Error(error.message);

  const per = new Map<string, Verbruik>();
  for (const r of data ?? []) {
    const v = per.get(r.model) ?? { model: r.model, aanroepen: 0, invoer: 0, uitvoer: 0 };
    v.aanroepen++;
    v.invoer += Number(r.details?.invoer ?? 0);
    v.uitvoer += Number(r.details?.uitvoer ?? 0);
    per.set(r.model, v);
  }
  return [...per.values()].sort((a, b) => b.aanroepen - a.aanroepen);
}

/**
 * Wie is mij nog een antwoord schuldig?
 *
 * Dezelfde opvolgingen als op het taakpaneel, maar gesorteerd op persoon in
 * plaats van op taak. Dat is de vorm die je vóór een vergadering nodig hebt:
 * niet "welke taak wacht", maar "wat heb ik nog van Van Dijk tegoed".
 */
export async function haalSchuldig(): Promise<Schuldig[]> {
  const { data, error } = await supabase
    .from("followups").select("task_id,verstuurd_op,tasks(titel)")
    .is("beantwoord_op", null).order("verstuurd_op")
    .returns<Array<{ task_id: string; verstuurd_op: string; tasks: { titel: string } | null }>>();
  if (error) throw new Error(error.message);
  const rijen = data ?? [];
  if (!rijen.length) return [];

  const bronnen = await haalBronnenVoorTaken([...new Set(rijen.map((r) => r.task_id))]);
  const per = new Map<string, Schuldig>();

  for (const r of rijen) {
    const bron = (bronnen[r.task_id] ?? []).find((i) => !i.uitgesloten && i.afzender);
    const adres = adresUit(bron?.afzender) ?? "onbekend";
    const bestaand = per.get(adres);
    if (bestaand) {
      bestaand.aantal++;
      bestaand.taken.push({ id: r.task_id, titel: r.tasks?.titel ?? null });
    } else {
      per.set(adres, {
        adres,
        naam: bron?.afzender ?? adres,
        aantal: 1,
        oudste: r.verstuurd_op,
        taken: [{ id: r.task_id, titel: r.tasks?.titel ?? null }],
      });
    }
  }
  // Oudste schuld bovenaan: dat is waar je als eerste achteraan wilt.
  return [...per.values()].sort((a, b) => a.oudste.localeCompare(b.oudste));
}

/* -------------------------------------------------------------- notities -- */

const OPNAME_REGEL = "id,status,titel,gestart_op,duur_sec,project_id,bron,soort,labels,projects(naam,kleur)";

export async function haalOpnames(o: { zoek?: string; projectId?: string | null; statussen?: Opname["status"][]; limiet?: number; label?: string | null } = {}): Promise<OpnameRegel[]> {
  let q = supabase.from("notities").select(OPNAME_REGEL);
  if (o.label) q = q.contains("labels", [o.label]);
  if (o.projectId) q = q.eq("project_id", o.projectId);
  if (o.statussen?.length) q = q.in("status", o.statussen);
  /* Komma's en haakjes zijn syntaxis in het filter, % en _ zijn jokers: wie op
     "50%" zoekt, bedoelt niet "50 en dan wat dan ook". */
  const veilig = (o.zoek ?? "").replace(/[%_,()\\*"]/g, " ").trim();
  if (veilig) q = q.or(`titel.ilike.%${veilig}%,transcript.ilike.%${veilig}%,invoer.ilike.%${veilig}%`);
  return controleer(await q.order("gestart_op", { ascending: false }).limit(o.limiet ?? 100).returns<OpnameRegel[]>());
}

export async function haalOpname(id: string): Promise<Opname | null> {
  const { data, error } = await supabase.from("notities").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Opname | null) ?? null;
}

export async function werkOpnameBij(id: string, velden: Partial<Opname>): Promise<void> {
  const { error } = await supabase.from("notities").update(velden).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Wist de notitie en alle audio. Taken die eruit voortkwamen blijven staan. */
export async function verwijderOpname(o: Pick<Opname, "id">, eigenaar: string): Promise<void> {
  const { data: delen } = await supabase.from("notitie_delen").select("volgnummer").eq("notitie_id", o.id);
  for (const d of (delen ?? []) as Array<{ volgnummer: number }>) {
    const map = `${eigenaar}/${o.id}/deel-${String(d.volgnummer).padStart(3, "0")}`;
    const { data: bestanden } = await supabase.storage.from("opnames").list(map, { limit: 1000 });
    if (bestanden?.length) await supabase.storage.from("opnames").remove(bestanden.map((b) => `${map}/${b.name}`));
  }
  const { error } = await supabase.from("notities").delete().eq("id", o.id);
  if (error) throw new Error(error.message);
}

/** De taken die uit deze notitie voortkwamen, via de vergadering als bron. */
export async function haalTakenVanOpname(itemId: string | null): Promise<TaakRij[]> {
  if (!itemId) return [];
  const { data, error } = await supabase.from("task_links")
    .select(`tasks(${TAAK_MET_PROJECT})`).eq("item_id", itemId)
    .returns<Array<{ tasks: TaakRij | null }>>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.tasks).filter((t): t is TaakRij => Boolean(t));
}

/** Een actiepunt van een ander, of een vervolgstap, als eigen taak met de vergadering als herkomst. */
export async function maakTaakUitOpname(o: Opname, titel: string, deadline: string | null): Promise<string> {
  const id = await maakTaak({
    titel, deadline, project_id: o.project_id,
    toelichting: `Uit ${o.titel ?? "een opgenomen gesprek"}.`,
  });
  if (o.item_id) {
    const { error } = await supabase.from("task_links").insert({ task_id: id, item_id: o.item_id, rol: "bron" });
    if (error) throw new Error(error.message);
  }
  return id;
}

export async function haalOpnameInstellingen(): Promise<OpnameInstellingen | null> {
  const { data, error } = await supabase.from("notitie_instellingen")
    .select("owner_id,mijn_naam,stemreferentie_pad,bewaartermijn_audio_dagen").maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OpnameInstellingen | null) ?? null;
}

export async function bewaarOpnameInstellingen(eigenaar: string, velden: Partial<OpnameInstellingen>): Promise<void> {
  const { error } = await supabase.from("notitie_instellingen").upsert({ owner_id: eigenaar, ...velden });
  if (error) throw new Error(error.message);
}

/** Stoot de verwerking aan. Mislukt het, dan pakt de planner het binnen twee minuten op. */
export async function verwerkOpnames(): Promise<void> {
  await roepFunctie("notitie-verwerk").catch(() => { /* de planner is het vangnet */ });
}

/** De foto's bij een notitie, met een link die een uur geldig is. */
export async function haalFotos(notitieId: string): Promise<Foto[]> {
  const rijen = controleer(await supabase.from("notitie_fotos")
    .select("id,volgnummer,pad,moment_sec,status,lezing,fout").eq("notitie_id", notitieId).order("volgnummer").returns<Foto[]>());
  if (!rijen.length) return rijen;
  /* Lukt het ondertekenen niet, dan blijven de foto's met hun lezing staan,
     alleen zonder plaatje: de inhoud is belangrijker dan het beeld. */
  let urls = new Map<string, string>();
  try {
    const { data } = await supabase.storage.from("opnames").createSignedUrls(rijen.map((f) => f.pad), 3600);
    if (Array.isArray(data)) urls = new Map(data.filter((d) => d.path && d.signedUrl).map((d) => [d.path!, d.signedUrl!] as [string, string]));
  } catch { /* zonder plaatjes */ }
  return rijen.map((f) => ({ ...f, url: urls.get(f.pad) ?? undefined }));
}

/** Een foto bij een notitie zetten. `moment` is het aantal seconden in de opname, of null achteraf. */
export async function voegFotoToe(notitieId: string, eigenaar: string, foto: Blob, moment: number | null): Promise<void> {
  const { data: laatst } = await supabase.from("notitie_fotos").select("volgnummer").eq("notitie_id", notitieId)
    .order("volgnummer", { ascending: false }).limit(1).maybeSingle();
  const nr = ((laatst as { volgnummer?: number } | null)?.volgnummer ?? 0) + 1;
  const pad = `${eigenaar}/${notitieId}/foto-${String(nr).padStart(4, "0")}.jpg`;
  const { error: e1 } = await supabase.storage.from("opnames").upload(pad, foto, { contentType: "image/jpeg", upsert: true });
  if (e1) throw new Error(`Foto uploaden mislukt: ${e1.message}`);
  const { error: e2 } = await supabase.from("notitie_fotos").insert({ notitie_id: notitieId, volgnummer: nr, pad, moment_sec: moment, status: "klaar" });
  if (e2) throw new Error(e2.message);
}

export async function notitieActie(notitieId: string, actie: "agenda" | "bevestig" | "verdiep", index?: number): Promise<{ link?: string | null }> {
  return roepFunctie("notitie-actie", { notitie_id: notitieId, actie, index });
}

/**
 * Alles wat er over dit overleg al bekend is: de laatste drie notities van het
 * project (of, zonder project, van een overleg met dezelfde agendatitel) en de
 * taken die eruit voortkwamen.
 */
export async function haalVoorbereiding(o: { projectId: string | null; titel: string }): Promise<Voorbereiding> {
  let q = supabase.from("notities").select("id,titel,gestart_op,samenvatting,item_id")
    .in("status", ["gereed", "goedgekeurd"]);
  if (o.projectId) q = q.eq("project_id", o.projectId);
  else {
    const veilig = o.titel.replace(/[%_\\]/g, (t) => `\\${t}`).trim();
    if (!veilig) return maakVoorbereiding([], []);
    q = q.ilike("agenda_titel", veilig);
  }
  const notities = controleer(await q.order("gestart_op", { ascending: false }).limit(3).returns<VorigeNotitie[]>());
  const items = notities.map((n) => n.item_id).filter((x): x is string => Boolean(x));
  let taken: TaakRij[] = [];
  if (items.length) {
    const { data, error } = await supabase.from("task_links")
      .select(`tasks(${TAAK_MET_PROJECT})`).in("item_id", items)
      .returns<Array<{ tasks: TaakRij | null }>>();
    if (error) throw new Error(error.message);
    taken = (data ?? []).map((r) => r.tasks).filter((t): t is TaakRij => Boolean(t));
  }
  return maakVoorbereiding(notities, taken);
}

/**
 * Een snelle notitie zonder opname. Eerst als 'opname' neerzetten, dan de
 * foto's erbij, en pas dan op 'verwerken': anders vat de server hem samen
 * voordat de foto's boven staan.
 */
export async function maakSnelleNotitie(o: {
  eigenaar: string; tekst: string; link: string | null; projectId: string | null; labels: string[]; fotos: Blob[];
}): Promise<string> {
  const { data, error } = await supabase.from("notities").insert({
    bron: "tekst", soort: "notitie", status: "opname", gestart_op: new Date().toISOString(),
    invoer: o.tekst, link: o.link, labels: o.labels,
    project_id: o.projectId, project_vast: Boolean(o.projectId),
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Kon geen notitie aanmaken");
  const id = (data as { id: string }).id;
  for (const f of o.fotos) await voegFotoToe(id, o.eigenaar, f, null);
  const { error: e2 } = await supabase.from("notities").update({ status: "verwerken" }).eq("id", id);
  if (e2) throw new Error(e2.message);
  void verwerkOpnames();
  return id;
}

/** Alle labels die je gebruikt, met hoe vaak. */
export async function haalLabels(): Promise<Array<{ label: string; aantal: number }>> {
  const rijen = controleer(await supabase.from("notities").select("labels").returns<Array<{ labels: string[] | null }>>());
  const tel = new Map<string, number>();
  for (const r of rijen) for (const l of r.labels ?? []) tel.set(l, (tel.get(l) ?? 0) + 1);
  return [...tel].map(([label, aantal]) => ({ label, aantal })).sort((a, b) => b.aantal - a.aantal || a.label.localeCompare(b.label, "nl"));
}

/** Notities die een label delen met deze, nieuwste eerst. */
export async function haalVerwant(id: string, labels: string[]): Promise<OpnameRegel[]> {
  if (!labels.length) return [];
  return controleer(await supabase.from("notities").select(OPNAME_REGEL).overlaps("labels", labels).neq("id", id)
    .in("status", ["gereed", "goedgekeurd"]).order("gestart_op", { ascending: false }).limit(6).returns<OpnameRegel[]>());
}

export async function vraagNotities(vraag: string): Promise<NotitieAntwoord> {
  return roepFunctie("notitie-vraag", { vraag });
}

/** Congressen, symposia en webinars van één jaar, voor het nascholingslogboek. */
export async function haalNascholing(jaar: number): Promise<NascholingRegel[]> {
  return controleer(await supabase.from("notities")
    .select("id,titel,gestart_op,duur_sec,status,nascholing_punten,nascholing_organisator,verdieping,labels,samenvatting")
    .eq("soort", "congres").in("status", ["gereed", "goedgekeurd"])
    .gte("gestart_op", `${jaar}-01-01T00:00:00+01:00`).lt("gestart_op", `${jaar + 1}-01-01T00:00:00+01:00`)
    .order("gestart_op").returns<NascholingRegel[]>());
}

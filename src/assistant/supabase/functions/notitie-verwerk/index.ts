/**
 * EEN OPNAME VERWERKEN
 *
 * Drie stappen, elk los te herhalen:
 *
 * 1. Delen uitschrijven. Een opname bestaat uit delen van hooguit vijf
 *    minuten; elk deel is een zelfstandig geluidsbestand in blokken van dertig
 *    seconden. De app zet een deel op 'klaar' zodra het laatste blok boven
 *    staat, dus het uitschrijven loopt al tijdens de vergadering. Na het
 *    stoppen hoeft alleen het laatste deel nog.
 * 2. Samenvatten, zodra alle delen uit zijn. Eerst het privacyfilter over het
 *    transcript, dan het taalmodel, dan wat eruit komt naar de rest van de
 *    assistent: actiepunten van jou worden taakvoorstellen, de vergadering
 *    wordt hun herkomst, en een Google Doc komt in de projectmap.
 * 3. Opruimen: audio na de bewaartermijn, en opnames die bleven hangen omdat
 *    de telefoon halverwege uitviel.
 *
 * Aangeroepen door de planner (elke twee minuten, met het cron-geheim) en door
 * de app (met de sessie van de eigenaar, en dan alleen voor zijn eigen werk).
 * Een ronde stopt ruim voor de tijdslimiet van de Edge Function; wat
 * overblijft pakt de volgende.
 *
 * Er wordt niets automatisch op je takenlijst gezet. Een actiepunt wordt een
 * voorstel, precies als een mail, en het voorstellenscherm is waar je beslist.
 */
import { adminClient, audit, cors, isCron, json, userId, type Admin } from "../_shared/core.ts";
import { accessToken, CAL, DRIVE, g, GoogleError } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";
import { kiesProject } from "../_shared/verwerk.ts";
import { schrijfUit } from "../_shared/spraak.ts";
import { vatSamen } from "../_shared/samenvatten.ts";
import { leesFoto, verdiep } from "../_shared/bronnen.ts";
import {
  docHtml, GEEN_PROJECT, maakTranscript, plaatsDeel, SOORTEN, verzamelBronnen,
  type FotoAnalyse, type FotoVoorPrompt, type RuwSegment, type Segment, type Soort, type Uitkomst, type Verdieping,
} from "../_shared/notities.ts";

/* De Edge Function mag langer, maar een ronde die halverwege een
   samenvatting wordt afgebroken heeft voor niets betaald. Ruim eronder blijven,
   en het laatste stuk werk alleen beginnen als het nog past. */
const BUDGET_MS = 150_000;
const SAMENVATTEN_MIN_MS = 60_000;
/* Een opname die drie uur niets meer bijwerkt is van een telefoon die uitviel
   of een app die gesloten werd. Wat boven staat, wordt alsnog verwerkt. */
const HANGEND_NA_MS = 3 * 3600_000;
const BUCKET = "opnames";

interface Deel {
  id: string; owner_id: string; notitie_id: string; volgnummer: number; mime: string;
  begin_sec: number; duur_sec: number | null; pogingen: number;
}

const map = (owner: string, notitie: string, volgnummer: number) =>
  `${owner}/${notitie}/deel-${String(volgnummer).padStart(3, "0")}`;

function naarBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

async function instellingen(admin: Admin, owner: string) {
  const { data } = await admin.from("notitie_instellingen").select("*").eq("owner_id", owner).maybeSingle();
  return (data ?? { owner_id: owner, mijn_naam: "Abdelkader", stemreferentie_pad: null, bewaartermijn_audio_dagen: 30, drive_map_id: null }) as {
    owner_id: string; mijn_naam: string; stemreferentie_pad: string | null; bewaartermijn_audio_dagen: number; drive_map_id: string | null;
  };
}

/* ---------------------------------------------------------- 1. uitschrijven */

async function schrijfDeelUit(admin: Admin, deel: Deel, stemCache: Map<string, string | null>) {
  const { data: blokken, error } = await admin.storage.from(BUCKET)
    .list(map(deel.owner_id, deel.notitie_id, deel.volgnummer), { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Opslag: ${error.message}`);
  const namen = (blokken ?? []).map((b) => b.name).filter((n) => /^blok-\d+\./.test(n)).sort();
  if (!namen.length) throw new Error("Geen geluid gevonden voor dit deel");

  /* Blokken van één opnamesessie vormen achter elkaar weer één geldig bestand:
     alleen het eerste draagt de kop van het formaat. */
  const stukken: Uint8Array[] = [];
  for (const n of namen) {
    const { data, error: e } = await admin.storage.from(BUCKET).download(`${map(deel.owner_id, deel.notitie_id, deel.volgnummer)}/${n}`);
    if (e || !data) throw new Error(`Downloaden ${n} mislukt: ${e?.message ?? "leeg"}`);
    stukken.push(new Uint8Array(await data.arrayBuffer()));
  }
  const geluid = new Uint8Array(stukken.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of stukken) { geluid.set(b, o); o += b.length; }

  const inst = await instellingen(admin, deel.owner_id);
  if (!stemCache.has(deel.owner_id)) {
    let ref: string | null = null;
    if (inst.stemreferentie_pad) {
      const { data } = await admin.storage.from(BUCKET).download(inst.stemreferentie_pad);
      if (data) ref = `data:audio/wav;base64,${naarBase64(new Uint8Array(await data.arrayBuffer()))}`;
    }
    stemCache.set(deel.owner_id, ref);
  }

  const { segmenten, dienst, uitval } = await schrijfUit(geluid, deel.mime, { naam: inst.mijn_naam, referentie: stemCache.get(deel.owner_id) ?? null });
  const { error: e2 } = await admin.from("notitie_delen")
    .update({ status: "gereed", segmenten, dienst, fout: uitval ? `uitval: ${uitval}` : null }).eq("id", deel.id);
  if (e2) throw new Error(e2.message);
  await audit(admin, deel.owner_id, "notitie_deel_uitgeschreven", {
    object_type: "notitie", object_id: deel.notitie_id, model: dienst,
    details: { deel: deel.volgnummer, bytes: geluid.length, ...(uitval ? { uitval } : {}) },
  });
}

async function deelMislukt(admin: Admin, deel: Deel, e: unknown) {
  const reden = String(e instanceof Error ? e.message : e).slice(0, 500);
  const definitief = deel.pogingen >= 3;
  await admin.from("notitie_delen").update({ status: definitief ? "fout" : "klaar", fout: reden }).eq("id", deel.id);
  if (definitief) {
    await admin.from("notities").update({ status: "fout", fout: `Deel ${deel.volgnummer} kon niet worden uitgeschreven: ${reden}` })
      .eq("id", deel.notitie_id).in("status", ["opname", "verwerken"]);
  }
}

/* -------------------------------------------------------------- foto's lezen */

interface Foto { id: string; owner_id: string; notitie_id: string; volgnummer: number; pad: string; pogingen: number }

/* Een foto van een slide gaat naar een taalmodel dat beelden leest. Wat eruit
   komt gaat langs hetzelfde privacyfilter als een transcript: een casus met
   een geboortedatum op een slide hoort niet in een notitie. */
async function leesFotoUit(admin: Admin, f: Foto) {
  const { data, error } = await admin.storage.from(BUCKET).download(f.pad);
  if (error || !data) throw new Error(`Downloaden mislukt: ${error?.message ?? "leeg"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const mime = data.type && data.type.startsWith("image/") ? data.type : "image/jpeg";
  const { analyse, dienst, verbruik, uitval } = await leesFoto({ mime, base64: naarBase64(bytes) });
  const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", f.owner_id);
  const pc = checkPrivacy({ from: "", subject: analyse.kern, text: analyse.tekst }, (filters ?? []) as FilterRow[]);
  const patient = /patiëntgegevens/i.test(analyse.kern);
  if (pc.excluded || patient) {
    await admin.from("notitie_fotos").update({ status: "geweigerd", lezing: null, dienst, fout: pc.reason ?? "mogelijk patiëntgegevens op de foto" }).eq("id", f.id);
  } else {
    await admin.from("notitie_fotos").update({ status: "gereed", lezing: analyse, dienst, fout: uitval ? `uitval: ${uitval}` : null }).eq("id", f.id);
  }
  await audit(admin, f.owner_id, "notitie_foto_gelezen", {
    object_type: "notitie", object_id: f.notitie_id, model: dienst,
    details: { foto: f.volgnummer, geweigerd: pc.excluded || patient, referenties: analyse.referenties.length, ...verbruik },
  });
}

async function fotoMislukt(admin: Admin, f: Foto, e: unknown) {
  const reden = String(e instanceof Error ? e.message : e).slice(0, 500);
  // Een foto die niet te lezen is houdt de notitie niet tegen; hij telt dan gewoon niet mee.
  await admin.from("notitie_fotos").update({ status: f.pogingen >= 3 ? "fout" : "klaar", fout: reden }).eq("id", f.id);
}

/* ------------------------------------------------------------ 2. samenvatten */

/** Klaar om samen te vatten: gestopt, minstens één deel, en alle delen uit. */
async function zetKlaarVoorSamenvatten(admin: Admin, eigenaar: string | null) {
  let q = admin.from("notities").select("id, notitie_delen(status), notitie_fotos(status)").eq("status", "verwerken").limit(20);
  if (eigenaar) q = q.eq("owner_id", eigenaar);
  const { data } = await q;
  for (const n of (data ?? []) as Array<{ id: string; notitie_delen: Array<{ status: string }>; notitie_fotos: Array<{ status: string }> }>) {
    const delen = n.notitie_delen ?? [];
    // Een foto die nog gelezen wordt hoort in de samenvatting; daar wachten we op.
    const fotosKlaar = (n.notitie_fotos ?? []).every((f) => f.status !== "klaar" && f.status !== "bezig");
    if (delen.length === 0) {
      await admin.from("notities").update({ status: "fout", fout: "Opname zonder geluid" }).eq("id", n.id);
    } else if (delen.every((d) => d.status === "gereed") && fotosKlaar) {
      await admin.from("notities").update({ status: "samenvatten" }).eq("id", n.id).eq("status", "verwerken");
    }
  }
}

async function lopendeAfspraak(admin: Admin, owner: string, moment: string) {
  const { data: cal } = await admin.from("sources").select("id").eq("owner_id", owner)
    .eq("kind", "calendar").eq("actief", true).limit(1).maybeSingle();
  if (!cal) return null;
  const t = Date.parse(moment);
  const token = await accessToken(admin, cal.id);
  const u = new URL(`${CAL}/calendars/primary/events`);
  u.searchParams.set("timeMin", new Date(t - 3 * 3600_000).toISOString());
  u.searchParams.set("timeMax", new Date(t + 30 * 60_000).toISOString());
  u.searchParams.set("singleEvents", "true");
  u.searchParams.set("orderBy", "startTime");
  const ev = await g(token, u.toString());
  const kandidaten = (ev.items ?? [])
    .filter((e: any) => e.start?.dateTime && e.status !== "cancelled")
    .map((e: any) => ({ e, start: Date.parse(e.start.dateTime), eind: Date.parse(e.end?.dateTime ?? e.start.dateTime) }))
    .filter(({ start, eind }: { start: number; eind: number }) => start - 15 * 60_000 <= t && t <= eind)
    .sort((a: { start: number }, b: { start: number }) => Math.abs(a.start - t) - Math.abs(b.start - t));
  const e = kandidaten[0]?.e;
  if (!e) return null;
  return {
    id: e.id as string,
    titel: (e.summary ?? "") as string,
    deelnemers: (e.attendees ?? []).filter((a: any) => !a.self && !a.resource).map((a: any) => a.displayName || a.email) as string[],
  };
}

/** De bron 'opname' van deze eigenaar; bestaat hij nog niet, dan maken we hem. */
async function opnameBron(admin: Admin, owner: string): Promise<string> {
  const { data, error } = await admin.from("sources")
    .upsert({ owner_id: owner, kind: "opname", account: "notities", actief: true }, { onConflict: "owner_id,kind,account" })
    .select("id").single();
  if (error || !data) throw new Error(`Bron opname: ${error?.message}`);
  return data.id as string;
}

async function zorgMap(token: string, naam: string, ouder: string): Promise<string> {
  const q = `name='${naam.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${ouder}' in parents and trashed=false`;
  const gevonden = await g(token, `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (gevonden.files?.length) return gevonden.files[0].id;
  const nieuw = await g(token, `${DRIVE}/files?fields=id`, {
    method: "POST", body: JSON.stringify({ name: naam, mimeType: "application/vnd.google-apps.folder", parents: [ouder] }),
  });
  return nieuw.id;
}

async function maakDoc(admin: Admin, owner: string, titel: string, html: string, projectNaam: string | null, oudDoc: string | null): Promise<string> {
  const { data: drive } = await admin.from("sources").select("id").eq("owner_id", owner)
    .eq("kind", "drive").eq("actief", true).limit(1).maybeSingle();
  if (!drive) throw new Error("Geen Drive-koppeling");
  const token = await accessToken(admin, drive.id);
  const inst = await instellingen(admin, owner);
  let wortel = inst.drive_map_id;
  if (!wortel) {
    wortel = await zorgMap(token, "Notities", "root");
    await admin.from("notitie_instellingen").upsert({ owner_id: owner, drive_map_id: wortel });
  }
  const doel = await zorgMap(token, projectNaam ?? "Overig", wortel);
  if (oudDoc) {
    await g(token, `${DRIVE}/files/${oudDoc}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) }).catch(() => {});
  }
  const grens = "notitie" + crypto.randomUUID().replace(/-/g, "");
  const meta = { name: titel, mimeType: "application/vnd.google-apps.document", parents: [doel] };
  const lichaam = `--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
    + `--${grens}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${grens}--`;
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${grens}` },
    body: lichaam,
  });
  if (!r.ok) throw new GoogleError(r.status, `Drive: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).id as string;
}

async function vatNotitieSamen(admin: Admin, n: any) {
  const owner = n.owner_id as string;
  const inst = await instellingen(admin, owner);
  const modellen: Record<string, unknown> = { ...(n.modellen ?? {}) };

  const { data: delen } = await admin.from("notitie_delen").select("volgnummer,begin_sec,duur_sec,segmenten,dienst")
    .eq("notitie_id", n.id).order("volgnummer");
  const alle: Segment[] = [];
  const diensten = new Set<string>();
  for (const d of delen ?? []) {
    alle.push(...plaatsDeel((d.segmenten ?? []) as RuwSegment[], { volgnummer: d.volgnummer, begin: Number(d.begin_sec), duur: d.duur_sec }, inst.mijn_naam));
    if (d.dienst) diensten.add(d.dienst);
  }
  if (!alle.length) {
    await admin.from("notities").update({ status: "fout", fout: "Geen spraak herkend in de opname" }).eq("id", n.id);
    return;
  }
  const transcript = maakTranscript(alle);
  const duur = Math.round(Math.max(...alle.map((s) => s.eind)));
  modellen.transcriptie = [...diensten];

  /* Het privacyfilter, vóór het taalmodel. Dezelfde regels als bij mail: ze
     staan in de code en zijn niet uit te zetten. Wat de eigenaar wel kan, is
     ná nalezen bevestigen dat het een vals alarm was; dat moment staat dan in
     de notitie en in het logboek. Tot die tijd gaat het transcript nergens heen
     en wordt de audio over zeven dagen gewist. */
  if (!n.privacy_bevestigd_op) {
    const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", owner);
    const pc = checkPrivacy({ from: "", subject: n.titel ?? "", text: transcript }, (filters ?? []) as FilterRow[]);
    if (pc.excluded) {
      await admin.from("notities").update({
        status: "geweigerd", privacy_reden: pc.reason, transcript, duur_sec: duur, modellen, samenvatting: null,
        audio_verwijderen_na: new Date(Date.now() + 7 * 86400_000).toISOString(),
      }).eq("id", n.id);
      await audit(admin, owner, "notitie_geweigerd", { object_type: "notitie", object_id: n.id, details: { reden: pc.reason } });
      return;
    }
  }

  // Agenda: alleen bij een opname in de app, want alleen dan klopt het tijdstip.
  let agenda = n.agenda_event_id ? { id: n.agenda_event_id, titel: n.agenda_titel, deelnemers: n.deelnemers ?? [] } : null;
  if (!agenda && n.bron === "app") {
    try { agenda = await lopendeAfspraak(admin, owner, n.gestart_op); } catch (e) { modellen.agenda_fout = String(e).slice(0, 200); }
  }

  const { data: projectRijen } = await admin.from("projects").select("id,naam,trefwoorden,afzenders")
    .eq("owner_id", owner).eq("gearchiveerd", false).order("naam");
  const projecten = (projectRijen ?? []) as Array<{ id: string; naam: string; trefwoorden: string[]; afzenders: string[] }>;
  const vast = n.project_vast ? projecten.find((p) => p.id === n.project_id) ?? null : null;
  const hintId = vast?.id ?? kiesProject(projecten, (agenda?.deelnemers ?? []).join(" "), agenda?.titel ?? "", n.titel ?? "");
  const hint = projecten.find((p) => p.id === hintId) ?? null;

  const { data: fotoRijen } = await admin.from("notitie_fotos").select("volgnummer,moment_sec,lezing")
    .eq("notitie_id", n.id).eq("status", "gereed").order("volgnummer");
  const fotos: FotoVoorPrompt[] = ((fotoRijen ?? []) as Array<{ volgnummer: number; moment_sec: number | null; lezing: FotoAnalyse }>)
    .map((f) => ({ volgnummer: f.volgnummer, moment: f.moment_sec, analyse: f.lezing }));
  const markeringen = (Array.isArray(n.markeringen) ? n.markeringen : []).map(Number).filter(Number.isFinite);
  const soort: Soort = SOORTEN.includes(n.soort) ? n.soort : "vergadering";

  const datum = new Date(n.gestart_op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "long", timeStyle: "short" });
  const { uitkomst: r, dienst, verbruik, uitval } = await vatSamen({
    transcript, mijnNaam: inst.mijn_naam, datum, soort, fotos, markeringen,
    projecten: vast ? [vast] : projecten,
    agendaTitel: agenda?.titel ?? null, deelnemers: agenda?.deelnemers ?? [],
    projectHint: hint?.naam ?? null, bestandsnaam: (n.modellen?.bestandsnaam as string | undefined) ?? null,
  });
  r.bronnen = verzamelBronnen(fotos, r.genoemde_bronnen);
  modellen.samenvatting = dienst;
  if (uitval) modellen.samenvatting_uitval = uitval;
  const project = vast ?? projecten.find((p) => p.naam === r.project && r.project !== GEEN_PROJECT) ?? hint;

  // De vergadering wordt een item, zodat taken ernaar kunnen wijzen.
  const bron = await opnameBron(admin, owner);
  const app = Deno.env.get("APP_URL")?.replace(/\/$/, "");
  const { data: item, error: eItem } = await admin.from("items").upsert({
    owner_id: owner, source_id: bron, extern_id: n.id, thread_id: null,
    deeplink: app ? `${app}/notities/${n.id}` : null,
    afzender: agenda?.titel ?? "Opname", onderwerp: r.titel,
    samenvatting: r.samenvatting.split(/\n/)[0]!.slice(0, 400), ontvangen_op: n.gestart_op,
  }, { onConflict: "source_id,extern_id" }).select("id").single();
  if (eItem || !item) throw new Error(`Item: ${eItem?.message}`);

  await zetVoorstellen(admin, owner, item.id, r, project?.id ?? null, datum);

  // Het Google Doc. Mislukt dat, dan is de notitie er nog steeds.
  let docId: string | null = n.drive_doc_id ?? null;
  try {
    const d = new Date(n.gestart_op).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    docId = await maakDoc(admin, owner, `${d} ${r.titel}`, docHtml({ r, datum, project: project?.naam ?? null, agendaTitel: agenda?.titel ?? null, transcript }), project?.naam ?? null, docId);
    delete modellen.drive_fout;
  } catch (e) {
    modellen.drive_fout = e instanceof GoogleError && e.status === 403
      ? "Google gaf geen toestemming om een document te maken. Koppel Google opnieuw op Instellingen; daarna kan het."
      : String(e).slice(0, 300);
  }

  /* Afspraken die al in de agenda staan houden hun verwijzing bij opnieuw
     samenvatten; anders zet de volgende klik ze er een tweede keer in. */
  const oud = (n.samenvatting?.afspraken ?? []) as Array<{ wat: string; datum: string; event_id?: string }>;
  for (const a of r.afspraken) {
    const zelfde = oud.find((x) => x.event_id && x.wat === a.wat && x.datum === a.datum);
    if (zelfde?.event_id) a.event_id = zelfde.event_id;
  }

  const { error } = await admin.from("notities").update({
    status: "gereed", titel: r.titel, samenvatting: r, transcript, duur_sec: duur, fout: null,
    project_id: project?.id ?? null, deelnemers: r.deelnemers.length ? r.deelnemers : agenda?.deelnemers ?? [],
    agenda_event_id: agenda?.id ?? null, agenda_titel: agenda?.titel ?? null,
    drive_doc_id: docId, item_id: item.id, modellen,
    // Een nieuwe samenvatting kan andere bronnen hebben; een oude verdieping
    // zou dan beweringen beoordelen die er niet meer staan.
    verdieping: null, verdieping_status: null,
  }).eq("id", n.id);
  if (error) throw new Error(error.message);
  await audit(admin, owner, "notitie_samengevat", {
    object_type: "notitie", object_id: n.id, model: dienst,
    details: { actiepunten: r.actiepunten.length, afspraken: r.afspraken.length, ...verbruik },
  });
}

/**
 * Actiepunten van jou worden voorstellen, met de vergadering als herkomst.
 *
 * Bij opnieuw samenvatten vervallen de voorstellen van de vorige ronde die je
 * nog niet had beoordeeld; wat je al hebt geaccepteerd blijft staan en komt
 * niet nog eens langs.
 */
async function zetVoorstellen(admin: Admin, owner: string, itemId: string, r: Uitkomst, projectId: string | null, datum: string) {
  const { data: links } = await admin.from("task_links").select("tasks(id,titel,status)").eq("item_id", itemId);
  const bestaand = ((links ?? []) as unknown as Array<{ tasks: { id: string; titel: string; status: string } | null }>)
    .map((l) => l.tasks).filter((t): t is { id: string; titel: string; status: string } => Boolean(t));
  const openVoorstel = bestaand.filter((t) => t.status === "voorstel").map((t) => t.id);
  if (openVoorstel.length) await admin.from("tasks").update({ status: "vervallen" }).in("id", openVoorstel);
  const al = new Set(bestaand.filter((t) => t.status !== "voorstel").map((t) => t.titel.toLowerCase()));

  for (const a of r.actiepunten.filter((x) => x.van_mij)) {
    const titel = a.wat.slice(0, 200);
    if (al.has(titel.toLowerCase())) continue;
    const { data: taak, error } = await admin.from("tasks").insert({
      owner_id: owner, project_id: projectId, titel, status: "voorstel", prioriteit: "normaal",
      deadline: a.deadline || null, aangemaakt_door: "assistent",
      toelichting: `Afgesproken in ${r.titel} (${datum}).`,
    }).select("id").single();
    if (error || !taak) throw new Error(`Taakvoorstel: ${error?.message}`);
    await admin.from("task_links").insert({ owner_id: owner, task_id: taak.id, item_id: itemId, rol: "bron" });
  }
}

/* ------------------------------------------------------------- verdiepen -- */

/** Op verzoek: de bronnen nazoeken in PubMed en naast de beweringen leggen. */
async function verdiepNotitie(admin: Admin, n: any) {
  const owner = n.owner_id as string;
  const r = n.samenvatting as Uitkomst | null;
  const bronnen = r?.bronnen ?? [];
  const modellen: Record<string, unknown> = { ...(n.modellen ?? {}) };
  if (!r || !bronnen.length) {
    await admin.from("notities").update({ verdieping_status: "fout", modellen: { ...modellen, verdieping_fout: "Er zijn geen bronnen om na te zoeken." } }).eq("id", n.id);
    return;
  }
  const { verdieping, verbruik, uitval } = await verdiep(bronnen);
  modellen.verdieping = verdieping.dienst;
  delete modellen.verdieping_fout;
  if (uitval) modellen.verdieping_uitval = uitval;

  // Het Google Doc opnieuw, nu met de nagezochte bronnen erin.
  let docId: string | null = n.drive_doc_id ?? null;
  try {
    const datum = new Date(n.gestart_op).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "long", timeStyle: "short" });
    const d = new Date(n.gestart_op).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    const { data: p } = n.project_id ? await admin.from("projects").select("naam").eq("id", n.project_id).maybeSingle() : { data: null };
    docId = await maakDoc(admin, owner, `${d} ${r.titel}`, docHtml({ r, datum, project: p?.naam ?? null, agendaTitel: n.agenda_titel, transcript: n.transcript ?? "", verdieping }), p?.naam ?? null, docId);
  } catch (e) {
    modellen.drive_fout = String(e).slice(0, 300);
  }
  await admin.from("notities").update({ verdieping, verdieping_status: "gereed", drive_doc_id: docId, modellen }).eq("id", n.id);
  await audit(admin, owner, "notitie_verdiept", {
    object_type: "notitie", object_id: n.id, model: verdieping.dienst,
    details: { bronnen: verdieping.bronnen.length, gevonden: verdieping.bronnen.filter((b: Verdieping["bronnen"][number]) => b.gevonden).length, ...verbruik },
  });
}

/* --------------------------------------------------------------- 3. opruimen */

async function ruimOp(admin: Admin) {
  // Een verdieping die een kwartier 'bezig' staat is van een ronde die omviel.
  await admin.from("notities").update({ verdieping_status: "gevraagd" }).eq("verdieping_status", "bezig")
    .lt("updated_at", new Date(Date.now() - 15 * 60_000).toISOString());
  // Een samenvatting die een kwartier 'bezig' staat is van een ronde die omviel.
  await admin.from("notities").update({ status: "samenvatten" }).eq("status", "bezig")
    .lt("updated_at", new Date(Date.now() - 15 * 60_000).toISOString());

  // Opnames die bleven hangen: wat boven staat alsnog verwerken.
  const grens = new Date(Date.now() - HANGEND_NA_MS).toISOString();
  const { data: hangend } = await admin.from("notities").select("id").eq("status", "opname").lt("updated_at", grens).limit(20);
  for (const n of hangend ?? []) {
    const { data: laatst } = await admin.from("notitie_delen").select("bijgewerkt").eq("notitie_id", n.id)
      .order("bijgewerkt", { ascending: false }).limit(1).maybeSingle();
    if (laatst && Date.parse(laatst.bijgewerkt) > Date.parse(grens)) continue;
    await admin.from("notitie_delen").update({ status: "klaar" }).eq("notitie_id", n.id).eq("status", "opname");
    await admin.from("notities").update({ status: "verwerken" }).eq("id", n.id).eq("status", "opname");
  }

  // Audio na de bewaartermijn. Transcript en samenvatting blijven.
  const { data: oud } = await admin.from("notities").select("id,owner_id")
    .lt("audio_verwijderen_na", new Date().toISOString()).eq("audio_verwijderd", false).limit(20);
  for (const n of oud ?? []) {
    const { data: delen } = await admin.from("notitie_delen").select("volgnummer").eq("notitie_id", n.id);
    let aantal = 0;
    for (const d of delen ?? []) {
      const m = map(n.owner_id, n.id, d.volgnummer);
      const { data: bestanden } = await admin.storage.from(BUCKET).list(m, { limit: 1000 });
      const paden = (bestanden ?? []).map((b) => `${m}/${b.name}`);
      if (paden.length) {
        const { error } = await admin.storage.from(BUCKET).remove(paden);
        if (error) throw new Error(`Wissen: ${error.message}`);
        aantal += paden.length;
      }
    }
    await admin.from("notities").update({ audio_verwijderd: true }).eq("id", n.id);
    await audit(admin, n.owner_id, "notitie_audio_gewist", { object_type: "notitie", object_id: n.id, details: { bestanden: aantal } });
  }
}

/* ------------------------------------------------------------------- ronde */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const cron = isCron(req);
  const eigenaar = cron ? null : await userId(req, admin);
  if (!cron && !eigenaar) return json({ fout: "geen toegang" }, 401);

  const tot = Date.now() + BUDGET_MS;
  const verslag = { delen: 0, fotos: 0, samengevat: 0, verdiept: 0, fouten: [] as string[] };
  const stemCache = new Map<string, string | null>();

  if (cron) {
    try { await ruimOp(admin); } catch (e) { verslag.fouten.push(`opruimen: ${String(e).slice(0, 200)}`); }
  }

  while (Date.now() < tot - 30_000) {
    const { data, error } = await admin.rpc("pak_notitie_deel", { p_eigenaar: eigenaar });
    if (error) { verslag.fouten.push(error.message); break; }
    const deel = ((data ?? []) as Deel[])[0];
    if (!deel) break;
    try {
      await schrijfDeelUit(admin, deel, stemCache);
      verslag.delen++;
    } catch (e) {
      await deelMislukt(admin, deel, e);
      verslag.fouten.push(`deel ${deel.volgnummer}: ${String(e).slice(0, 200)}`);
    }
  }

  while (Date.now() < tot - 30_000) {
    const { data, error } = await admin.rpc("pak_notitie_foto", { p_eigenaar: eigenaar });
    if (error) { verslag.fouten.push(error.message); break; }
    const foto = ((data ?? []) as Foto[])[0];
    if (!foto) break;
    try {
      await leesFotoUit(admin, foto);
      verslag.fotos++;
    } catch (e) {
      await fotoMislukt(admin, foto, e);
      verslag.fouten.push(`foto ${foto.volgnummer}: ${String(e).slice(0, 200)}`);
    }
  }

  await zetKlaarVoorSamenvatten(admin, eigenaar);

  while (Date.now() < tot - SAMENVATTEN_MIN_MS) {
    let q = admin.from("notities").select("*").eq("status", "samenvatten").order("updated_at").limit(1);
    if (eigenaar) q = q.eq("owner_id", eigenaar);
    const { data } = await q;
    const n = data?.[0];
    if (!n) break;
    // Eerst claimen, zodat een kruisende ronde dezelfde notitie niet ook pakt.
    const { data: geclaimd } = await admin.from("notities").update({ status: "bezig", fout: null })
      .eq("id", n.id).eq("status", "samenvatten").select("id");
    if (!geclaimd?.length) continue;
    try {
      await vatNotitieSamen(admin, n);
      verslag.samengevat++;
    } catch (e) {
      const reden = String(e instanceof Error ? e.message : e).slice(0, 500);
      await admin.from("notities").update({ status: "fout", fout: reden }).eq("id", n.id);
      await audit(admin, n.owner_id, "notitie_fout", { object_type: "notitie", object_id: n.id, details: { reden } });
      verslag.fouten.push(`notitie: ${reden.slice(0, 200)}`);
    }
  }

  while (Date.now() < tot - SAMENVATTEN_MIN_MS) {
    let q = admin.from("notities").select("*").eq("verdieping_status", "gevraagd").order("updated_at").limit(1);
    if (eigenaar) q = q.eq("owner_id", eigenaar);
    const { data } = await q;
    const n = data?.[0];
    if (!n) break;
    const { data: geclaimd } = await admin.from("notities").update({ verdieping_status: "bezig" })
      .eq("id", n.id).eq("verdieping_status", "gevraagd").select("id");
    if (!geclaimd?.length) continue;
    try {
      await verdiepNotitie(admin, n);
      verslag.verdiept++;
    } catch (e) {
      const reden = String(e instanceof Error ? e.message : e).slice(0, 500);
      await admin.from("notities").update({ verdieping_status: "fout", modellen: { ...(n.modellen ?? {}), verdieping_fout: reden } }).eq("id", n.id);
      verslag.fouten.push(`verdieping: ${reden.slice(0, 200)}`);
    }
  }

  return json(verslag);
});

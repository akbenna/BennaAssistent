import { adminClient, amsterdamNu, APP_NAME, audit, isCron, json, type Admin } from "../_shared/core.ts";
import { accessToken, buildRaw, CAL, g, GMAIL } from "../_shared/google.ts";

function dagGrenzen(datum: string): { van: string; tot: string } {
  const utc = Date.parse(`${datum}T00:00:00Z`);
  const offsetUur = amsterdamNu(new Date(utc)).uur; // 1 (winter) of 2 (zomer)
  const van = new Date(utc - offsetUur * 3600e3);
  return { van: van.toISOString(), tot: new Date(van.getTime() + 24 * 3600e3).toISOString() };
}

async function maakBrief(admin: Admin, owner: string, datum: string) {
  const inhoud: Record<string, unknown> = {};

  const { data: cal } = await admin.from("sources").select("id").eq("owner_id", owner)
    .eq("kind", "calendar").eq("actief", true).limit(1).maybeSingle();
  if (cal) {
    try {
      const token = await accessToken(admin, cal.id);
      const { van, tot } = dagGrenzen(datum);
      const u = new URL(`${CAL}/calendars/primary/events`);
      u.searchParams.set("timeMin", van); u.searchParams.set("timeMax", tot);
      u.searchParams.set("singleEvents", "true"); u.searchParams.set("orderBy", "startTime");
      u.searchParams.set("timeZone", "Europe/Amsterdam");
      const ev = await g(token, u.toString());
      inhoud.afspraken = (ev.items ?? []).map((e: any) => ({
        titel: e.summary ?? "(zonder titel)", start: e.start?.dateTime ?? e.start?.date,
        locatie: e.location ?? null, link: e.htmlLink,
      }));
    } catch (e) { inhoud.afspraken_fout = String(e).slice(0, 200); }
  }

  const actief = () => admin.from("tasks").select("id,titel,deadline,prioriteit,status")
    .eq("owner_id", owner).is("gearchiveerd_op", null);
  const { data: deadlines } = await actief().in("status", ["open", "antwoord_binnen"]).lte("deadline", datum)
    .order("deadline");
  const { data: antwoorden } = await actief().eq("status", "antwoord_binnen");
  const { data: voorstellen } = await actief().eq("status", "voorstel").order("created_at", { ascending: false }).limit(8);
  const { count: aantalVoorstellen } = await admin.from("tasks").select("id", { count: "exact", head: true })
    .eq("owner_id", owner).eq("status", "voorstel").is("gearchiveerd_op", null);
  const { data: verlopen } = await admin.from("followups").select("task_id,thread_id,verstuurd_op,tasks(titel)")
    .eq("owner_id", owner).is("beantwoord_op", null).not("laatste_herinnering_op", "is", null);

  Object.assign(inhoud, {
    deadlines: deadlines ?? [], antwoorden: antwoorden ?? [],
    voorstellen: voorstellen ?? [], aantal_voorstellen: aantalVoorstellen ?? 0,
    opvolging_verlopen: (verlopen ?? []).map((f: any) => ({ task_id: f.task_id, titel: f.tasks?.titel, sinds: f.verstuurd_op })),
  });
  await admin.from("briefs").upsert({ owner_id: owner, datum, inhoud }, { onConflict: "owner_id,datum" });
  return inhoud;
}

function alsTekst(datum: string, b: any): string {
  const r: string[] = [`${APP_NAME} — dagoverzicht ${datum}`, ""];
  const blok = (kop: string, regels: string[]) => { if (regels.length) r.push(kop, ...regels.map((x) => `- ${x}`), ""); };
  blok("Afspraken", (b.afspraken ?? []).map((a: any) => `${String(a.start).slice(11, 16) || "hele dag"} ${a.titel}`));
  blok("Deadline vandaag of verlopen", (b.deadlines ?? []).map((t: any) => `${t.titel} (${t.deadline})`));
  blok("Antwoord binnen", (b.antwoorden ?? []).map((t: any) => t.titel));
  blok("Nog geen antwoord", (b.opvolging_verlopen ?? []).map((t: any) => t.titel));
  if (b.aantal_voorstellen) r.push(`${b.aantal_voorstellen} nieuwe taakvoorstellen wachten op je beoordeling.`, "");
  const app = Deno.env.get("APP_URL"); if (app) r.push(`Open ${APP_NAME}: ${app}`);
  return r.join("\n");
}

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const force = req.method === "POST" && (await req.json().catch(() => ({}))).force === true;
  const { datum, uur } = amsterdamNu();
  if (!force && uur !== 6) return json({ overgeslagen: `lokaal uur ${uur}` });

  const admin = adminClient();
  const { data: rijen } = await admin.from("sources").select("owner_id,id,kind,account").eq("actief", true);
  const eigenaren = [...new Set((rijen ?? []).map((r: any) => r.owner_id))];
  for (const owner of eigenaren) {
    const b = await maakBrief(admin, owner, datum);
    await audit(admin, owner, "dagoverzicht", { details: { datum } });
    if (Deno.env.get("BRIEF_EMAIL") === "true") {
      const gm = (rijen ?? []).find((r: any) => r.owner_id === owner && r.kind === "gmail");
      if (gm?.account) {
        const token = await accessToken(admin, gm.id);
        // Alleen aan jezelf; nooit aan derden.
        await g(token, `${GMAIL}/messages/send`, { method: "POST",
          body: JSON.stringify({ raw: buildRaw({ to: gm.account, subject: `${APP_NAME} — dagoverzicht ${datum}`, body: alsTekst(datum, b) }) }) });
      }
    }
  }
  return json({ datum, eigenaren: eigenaren.length });
});

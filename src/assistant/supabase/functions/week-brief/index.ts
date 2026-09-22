/**
 * DE WEEKSTART
 *
 * Het dagoverzicht vertelt wat er vandaag ligt. Wat het niet vertelt is wat er
 * aankomt, en wat er stil is geworden. Dat eerste kost je een maandagochtend
 * aan verrassingen; dat tweede merk je pas als een dossier al weken ligt.
 *
 * Vier dingen dus: de deadlines van deze week, het terugkerende onderhoud dat
 * deze week verschijnt, wie je nog een antwoord schuldig is, en welke projecten
 * veertien dagen niets van zich hebben laten horen. Dat laatste is het signaal
 * dat nergens anders in de app te zien is.
 *
 * De verschijndatum van het onderhoud wordt hier opnieuw uitgerekend en niet
 * uit `plan_terugkerend` gehaald: die plant pas op de dag zelf, en dit overzicht
 * gaat juist over wat er nog komt.
 */
import { adminClient, amsterdamNu, APP_NAME, audit, isCron, json, type Admin } from "../_shared/core.ts";

const MS = 86400e3;

/** Maandag van de week waarin `datum` valt, en de zondag erna. */
function week(datum: string): { maandag: string; zondag: string } {
  const d = new Date(`${datum}T12:00:00Z`);
  const verschuiving = (d.getUTCDay() + 6) % 7; // maandag = 0
  const maandag = new Date(d.getTime() - verschuiving * MS);
  const zondag = new Date(maandag.getTime() + 6 * MS);
  return { maandag: maandag.toISOString().slice(0, 10), zondag: zondag.toISOString().slice(0, 10) };
}

/** Dezelfde rekenwijze als de planner: de verschijndatum binnen deze periode,
    doorgeschoven als hij in het weekend valt. */
function verschijntIn(r: any, maandag: string, zondag: string): string | null {
  const dagenInMaand = (jaar: number, maand: number) => new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  const werkdag = (d: Date) => {
    const uit = new Date(d);
    while (uit.getUTCDay() === 0 || uit.getUTCDay() === 6) uit.setUTCDate(uit.getUTCDate() + 1);
    return uit;
  };

  const kandidaten: Date[] = [];
  const start = new Date(`${maandag}T12:00:00Z`);
  if (r.ritme === "dagelijks") {
    for (let i = 0; i < 7; i++) kandidaten.push(new Date(start.getTime() + i * MS));
  } else if (r.ritme === "wekelijks") {
    kandidaten.push(new Date(start.getTime() + ((r.dag_van_week ?? 1) - 1) * MS));
  } else {
    // Maandelijks, kwartaal en jaarlijks kunnen hooguit één keer in een week
    // vallen; we kijken naar de maanden die deze week aanraakt.
    const maanden = new Set([start.getUTCMonth() + 1, new Date(`${zondag}T12:00:00Z`).getUTCMonth() + 1]);
    for (const maand of maanden) {
      const jaar = start.getUTCFullYear();
      if (r.ritme === "kwartaal" && ![1, 4, 7, 10].includes(maand)) continue;
      if (r.ritme === "jaarlijks" && maand !== (r.maand ?? 1)) continue;
      const dag = Math.min(r.dag_van_maand ?? 1, dagenInMaand(jaar, maand));
      kandidaten.push(new Date(Date.UTC(jaar, maand - 1, dag, 12)));
    }
  }

  for (const k of kandidaten) {
    const d = r.alleen_werkdagen ? werkdag(k) : k;
    const s = d.toISOString().slice(0, 10);
    if (s >= maandag && s <= zondag) return s;
  }
  return null;
}

async function maakWeek(admin: Admin, owner: string, datum: string) {
  const { maandag, zondag } = week(datum);
  const inhoud: Record<string, unknown> = { maandag, zondag };

  const { data: deadlines } = await admin.from("tasks")
    .select("id,titel,deadline,prioriteit,status").eq("owner_id", owner)
    .is("gearchiveerd_op", null).in("status", ["open", "antwoord_binnen"])
    .gte("deadline", maandag).lte("deadline", zondag).order("deadline");

  const { data: ritmes } = await admin.from("terugkerend")
    .select("titel,ritme,dag_van_week,dag_van_maand,maand,alleen_werkdagen,link")
    .eq("owner_id", owner).eq("actief", true);
  const onderhoud = (ritmes ?? [])
    .map((r: any) => ({ titel: r.titel, link: r.link, wanneer: verschijntIn(r, maandag, zondag) }))
    .filter((x) => x.wanneer)
    .sort((a, b) => String(a.wanneer).localeCompare(String(b.wanneer)));

  const { data: open } = await admin.from("followups")
    .select("task_id,verstuurd_op,tasks(titel)").eq("owner_id", owner)
    .is("beantwoord_op", null).order("verstuurd_op");

  /* Een project is stil als er in veertien dagen geen taak bij is gekomen of
     afgerond. Niet alarmerend, wel goed om één keer per week te zien. */
  const grens = new Date(Date.now() - 14 * MS).toISOString();
  const { data: projecten } = await admin.from("projects").select("id,naam")
    .eq("owner_id", owner).eq("gearchiveerd", false);
  const stil: Array<{ naam: string }> = [];
  for (const p of projecten ?? []) {
    const { count } = await admin.from("tasks").select("id", { count: "exact", head: true })
      .eq("project_id", p.id).is("gearchiveerd_op", null).gt("updated_at", grens);
    if (!count) stil.push({ naam: p.naam });
  }

  Object.assign(inhoud, {
    deadlines: deadlines ?? [],
    onderhoud,
    wachten: (open ?? []).map((f: any) => ({ task_id: f.task_id, titel: f.tasks?.titel, sinds: f.verstuurd_op })),
    stille_projecten: stil,
  });

  await admin.from("briefs").upsert(
    { owner_id: owner, datum: maandag, soort: "week", inhoud },
    { onConflict: "owner_id,datum,soort" },
  );
  return inhoud;
}

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const geforceerd = req.method === "POST" && (await req.json().catch(() => ({}))).force === true;
  const { datum } = amsterdamNu();
  // Maandag, tenzij met de hand aangeroepen om het te bekijken.
  if (!geforceerd && new Date(`${datum}T12:00:00Z`).getUTCDay() !== 1) {
    return json({ overgeslagen: "alleen op maandag" });
  }

  const admin = adminClient();
  const { data: rijen } = await admin.from("sources").select("owner_id").eq("actief", true);
  const eigenaren = [...new Set((rijen ?? []).map((r: any) => r.owner_id))];
  for (const owner of eigenaren) {
    await maakWeek(admin, owner, datum);
    await audit(admin, owner, "weekoverzicht", { details: { datum } });
  }
  return json({ datum, eigenaren: eigenaren.length, app: APP_NAME });
});

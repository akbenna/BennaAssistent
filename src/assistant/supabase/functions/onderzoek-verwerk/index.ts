/**
 * DE CONGRES-AGENT AAN HET WERK
 *
 * Elke ronde één stap: een congres verkennen, een vraag beantwoorden, of één
 * gekozen thema uitwerken tot een notitie. Een stap met zoeken op het web
 * duurt een halve tot twee minuten, en een Edge Function hooguit tweeënhalf;
 * meer dan één per ronde past dus niet. Wat overblijft pakt de volgende ronde
 * op, van de planner (elke twee minuten) of van de app.
 *
 * Een stap die halverwege afbrak (time-out, uitval) wordt na tien minuten
 * opnieuw geprobeerd, tot drie keer. Daarna staat de fout in het onderzoek.
 */
import { adminClient, audit, cors, isCron, json, userId, type Admin } from "../_shared/core.ts";
import { zoekOpWeb } from "../_shared/web.ts";
import {
  antwoordPrompt, antwoordSchema, bronnenTekst, leesThemas, naarUitkomst, uitwerkPrompt, uitwerkSchema,
  verkenPrompt, verkenSchema, type Bericht, type Thema,
} from "../_shared/onderzoek.ts";
import type { Verbruik } from "../_shared/claude.ts";

const BUDGET_MS = 145_000;
const VAST_NA_MS = 10 * 60_000;

/* Verbruik optellen, en bij elke stap vastleggen of er een dienst uitviel en
   waarom. Zonder dat laatste zie je alleen dat Claude het deed, niet dat
   OpenAI het weigerde. */
const telOp = (modellen: Record<string, unknown>, dienst: string, v: Verbruik, uitval?: string) => {
  const oud = (modellen.verbruik ?? { invoer: 0, uitvoer: 0, stappen: 0 }) as { invoer: number; uitvoer: number; stappen: number };
  const { uitval: _oud, ...rest } = modellen;
  return {
    ...rest, laatste_dienst: dienst, ...(uitval ? { uitval } : {}),
    verbruik: { invoer: oud.invoer + v.invoer, uitvoer: oud.uitvoer + v.uitvoer, stappen: oud.stappen + 1 },
  };
};

async function verkennen(admin: Admin, o: any) {
  const vandaag = new Date().toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "long" });
  const p = verkenPrompt({ onderwerp: o.onderwerp, url: o.url, focus: o.focus, vandaag });
  const a = await zoekOpWeb({ naam: "verkenning", ...p, schema: verkenSchema, maxZoek: 6 });
  const r = a.ruw as { overzicht?: string; themas?: unknown };
  const themas = leesThemas(r.themas);
  if (!themas.length) throw new Error("De agent vond geen thema's. Probeer een preciezere naam of zet de website erbij.");
  await admin.from("onderzoeken").update({
    fase: "kiezen", werk: null, werk_sinds: null, pogingen: 0, fout: null,
    overzicht: String(r.overzicht ?? "").slice(0, 8000), themas, bronnen: a.bronnen,
    modellen: telOp(o.modellen ?? {}, a.dienst, a.verbruik, a.uitval),
  }).eq("id", o.id);
  await audit(admin, o.owner_id, "onderzoek_verkend", { object_type: "onderzoek", object_id: o.id, model: a.dienst, details: { themas: themas.length, ...a.verbruik } });
}

async function antwoorden(admin: Admin, o: any) {
  const gesprek = (o.gesprek ?? []) as Bericht[];
  const vraag = [...gesprek].reverse().find((b) => b.rol === "ik");
  if (!vraag) { await admin.from("onderzoeken").update({ werk: null, werk_sinds: null }).eq("id", o.id); return; }
  const themas = (o.themas ?? []) as Thema[];
  const p = antwoordPrompt({ onderwerp: o.onderwerp, overzicht: o.overzicht ?? "", themas, gesprek: gesprek.slice(0, -1), vraag: vraag.tekst });
  const a = await zoekOpWeb({ naam: "antwoord", ...p, schema: antwoordSchema, maxZoek: 5 });
  const r = a.ruw as { antwoord?: string; nieuwe_themas?: unknown };
  const nieuw = leesThemas(r.nieuwe_themas, themas);
  const bronnen = a.bronnen.slice(0, 8).map((b) => `- ${b.titel}: ${b.url}`).join("\n");
  const tekst = `${String(r.antwoord ?? "").trim() || "Daar vond ik niets over."}${nieuw.length ? `\n\nNieuw in de lijst: ${nieuw.map((t) => t.titel).join(", ")}.` : ""}${bronnen ? `\n\nBronnen:\n${bronnen}` : ""}`;
  await admin.from("onderzoeken").update({
    werk: null, werk_sinds: null, pogingen: 0, fout: null,
    themas: [...themas, ...nieuw],
    gesprek: [...gesprek, { rol: "agent", tekst: tekst.slice(0, 8000), op: new Date().toISOString() }],
    modellen: telOp(o.modellen ?? {}, a.dienst, a.verbruik, a.uitval),
  }).eq("id", o.id);
}

async function uitwerken(admin: Admin, o: any) {
  const themas = (o.themas ?? []) as Thema[];
  const t = themas.find((x) => x.gekozen && x.status === "wacht");
  if (!t) {
    await admin.from("onderzoeken").update({ fase: "gereed", werk: null, werk_sinds: null, pogingen: 0 }).eq("id", o.id);
    return;
  }
  const p = uitwerkPrompt({ onderwerp: o.onderwerp, thema: t });
  const a = await zoekOpWeb({ naam: "uitwerking", ...p, schema: uitwerkSchema, maxZoek: 6 });
  const r = naarUitkomst(a.ruw, t);
  /* Een gewone notitie, zodat zoeken, vragen, labels en het nazoeken in PubMed
     er vanzelf mee werken. Bron 'onderzoek' houdt hem uit het
     nascholingslogboek (je was er niet) en zet het document in Wetenschap. */
  const { data: n, error } = await admin.from("notities").insert({
    owner_id: o.owner_id, bron: "onderzoek", soort: "congres", status: "gereed",
    titel: r.titel, gestart_op: new Date().toISOString(), agenda_titel: o.onderwerp,
    samenvatting: r, transcript: bronnenTekst(o.onderwerp, t, a.bronnen),
    labels: r.labels, link: t.bronnen[0]?.url ?? null,
    modellen: { onderzoek: a.dienst, onderzoek_id: o.id, drive_opnieuw: true, ...(a.uitval ? { samenvatting_uitval: a.uitval } : {}) },
    // Wat er aan publicaties genoemd is, wordt meteen nagezocht in PubMed.
    verdieping_status: r.bronnen?.length ? "gevraagd" : null,
  }).select("id").single();
  if (error || !n) throw new Error(`Notitie: ${error?.message}`);
  const bijgewerkt = themas.map((x) => x.id === t.id ? { ...x, status: "gereed" as const, notitie_id: n.id, fout: undefined } : x);
  const nogTeDoen = bijgewerkt.some((x) => x.gekozen && x.status === "wacht");
  await admin.from("onderzoeken").update({
    themas: bijgewerkt, fase: nogTeDoen ? "uitwerken" : "gereed", werk: nogTeDoen ? "uitwerken" : null,
    werk_sinds: null, pogingen: 0, fout: null, modellen: telOp(o.modellen ?? {}, a.dienst, a.verbruik, a.uitval),
  }).eq("id", o.id);
  await audit(admin, o.owner_id, "onderzoek_uitgewerkt", { object_type: "notitie", object_id: n.id, model: a.dienst, details: { thema: t.titel, ...a.verbruik } });
}

const STAP = { verkennen, antwoorden, uitwerken } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const cron = isCron(req);
  const eigenaar = cron ? null : await userId(req, admin);
  if (!cron && !eigenaar) return json({ fout: "geen toegang" }, 401);
  const tot = Date.now() + BUDGET_MS;
  const verslag = { stappen: 0, fouten: [] as string[] };

  // Een stap die bleef hangen (de functie werd afgebroken) krijgt een nieuwe kans.
  await admin.from("onderzoeken").update({ werk_sinds: null })
    .not("werk", "is", null).lt("werk_sinds", new Date(Date.now() - VAST_NA_MS).toISOString());

  while (Date.now() < tot - 120_000 || verslag.stappen === 0) {
    let q = admin.from("onderzoeken").select("*").not("werk", "is", null).is("werk_sinds", null).order("updated_at").limit(1);
    if (eigenaar) q = q.eq("owner_id", eigenaar);
    const { data } = await q;
    const o = data?.[0];
    if (!o) break;
    // Eerst claimen; een kruisende ronde pakt hem dan niet ook.
    const { data: geclaimd } = await admin.from("onderzoeken").update({ werk_sinds: new Date().toISOString(), pogingen: (o.pogingen ?? 0) + 1 })
      .eq("id", o.id).is("werk_sinds", null).select("id");
    if (!geclaimd?.length) continue;
    verslag.stappen++;
    try {
      await STAP[o.werk as keyof typeof STAP](admin, o);
    } catch (e) {
      const reden = String(e instanceof Error ? e.message : e).slice(0, 500);
      verslag.fouten.push(reden.slice(0, 200));
      const op = (o.pogingen ?? 0) + 1 >= 3;
      const themas = o.werk === "uitwerken" && op
        ? (o.themas as Thema[]).map((x) => x.gekozen && x.status === "wacht" && x === (o.themas as Thema[]).find((y) => y.gekozen && y.status === "wacht") ? { ...x, status: "fout" as const, fout: reden } : x)
        : o.themas;
      await admin.from("onderzoeken").update({
        werk_sinds: null, fout: reden, themas,
        // Na drie pogingen: bij verkennen is het onderzoek mislukt; bij een thema gaat de agent door met het volgende.
        ...(op ? (o.werk === "verkennen" ? { werk: null, fase: "fout" } : o.werk === "antwoorden" ? { werk: null } : { pogingen: 0 }) : {}),
      }).eq("id", o.id);
    }
  }
  return json(verslag);
});

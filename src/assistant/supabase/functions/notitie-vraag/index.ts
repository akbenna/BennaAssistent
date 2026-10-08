/**
 * VRAAG HET JE NOTITIES
 *
 * Met jouw sessie, alleen over jouw notities. Zoeken doet Postgres
 * (`zoek_notities`), antwoorden het eerste taalmodel uit TEKST_VOLGORDE. Vindt
 * het zoeken niets, dan wordt er ook geen model aangeroepen: dat kost niets
 * en er valt niets te verzinnen.
 */
import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { vraagJson } from "../_shared/diensten.ts";
import { leesAantekeningen, type Uitkomst } from "../_shared/notities.ts";
import { trekAntwoordRecht, VRAAG_SYSTEEM, vraagContext, vraagSchema, type NotitieVoorVraag } from "../_shared/vraag.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);

  const { vraag } = await req.json().catch(() => ({}));
  const v = typeof vraag === "string" ? vraag.trim().slice(0, 500) : "";
  if (v.length < 3) return json({ fout: "stel een vraag" }, 400);

  const { data: treffers, error } = await admin.rpc("zoek_notities", { vraag: v, aantal: 8, eigenaar: uid });
  if (error) return json({ fout: error.message }, 500);
  const ids = ((treffers ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (!ids.length) return json({ antwoord: "Daar vond ik niets over in je notities.", gevonden: false, bronnen: [] });

  const { data: rijen } = await admin.from("notities")
    .select("id,titel,gestart_op,soort,samenvatting,invoer,aantekeningen,transcript,projects(naam)")
    .eq("owner_id", uid).in("id", ids);
  // In de volgorde van de rangschikking: het model leest de beste eerst.
  const notities: NotitieVoorVraag[] = ids.map((id) => (rijen ?? []).find((r) => r.id === id)).filter(Boolean).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: x.id as string, titel: (x.titel as string | null) ?? null, gestart_op: x.gestart_op as string, soort: x.soort as string,
      project: ((x.projects as { naam: string } | null)?.naam) ?? null,
      samenvatting: (x.samenvatting as Uitkomst | null) ?? null, invoer: (x.invoer as string | null) ?? null,
      aantekeningen: leesAantekeningen(x.aantekeningen), transcript: (x.transcript as string | null) ?? null,
    };
  });

  try {
    const { ruw, dienst, verbruik } = await vraagJson({
      naam: "antwoord", systeem: VRAAG_SYSTEEM,
      gebruiker: `Vraag: ${v}\n\nNotities:\n\n${vraagContext(notities, v)}`, schema: vraagSchema,
    });
    const a = trekAntwoordRecht(ruw, notities);
    await audit(admin, uid, "notities_gevraagd", { object_type: "notitie", model: dienst, details: { notities: notities.length, gevonden: a.gevonden, ...verbruik } });
    return json({ ...a, dienst });
  } catch (e) {
    return json({ fout: e instanceof Error ? e.message : String(e) }, 502);
  }
});

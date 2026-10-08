/**
 * WAT JE MET EEN NOTITIE DOET, ALS HET VIA GOOGLE OF HET LOGBOEK MOET
 *
 * Twee handelingen, allebei op jouw klik en met jouw sessie:
 *
 * - agenda: een afspraak die in het gesprek is gemaakt ("volgende vergadering
 *   12 november, half acht") in je Google Agenda zetten. Nooit vanzelf: een
 *   afspraak die je niet zelf hebt gezien hoort niet in je agenda.
 * - bevestig: het privacyfilter sloeg aan op het transcript, je hebt het
 *   nagelezen, en het is een vals alarm. Dat moment wordt vastgelegd in de
 *   notitie én in het logboek, en pas dan gaat het transcript naar het
 *   taalmodel. Het filter zelf blijft staan zoals het staat.
 *
 * Taken maken gebeurt in de app zelf: daar gelden de gewone regels van de
 * takentabel, en die zijn hier niet nodig.
 */
import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { accessToken, CAL, g } from "../_shared/google.ts";
import { agendaGebeurtenis, type Afspraak, type Uitkomst } from "../_shared/notities.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);

  const { notitie_id, actie, index } = await req.json().catch(() => ({}));
  if (!notitie_id) return json({ fout: "notitie_id ontbreekt" }, 400);
  const { data: n } = await admin.from("notities").select("*").eq("id", notitie_id).eq("owner_id", uid).maybeSingle();
  if (!n) return json({ fout: "notitie niet gevonden" }, 404);

  if (actie === "bevestig") {
    if (n.status !== "geweigerd") return json({ fout: "deze notitie wacht niet op een bevestiging" }, 409);
    await admin.from("notities").update({
      status: "samenvatten", privacy_bevestigd_op: new Date().toISOString(), audio_verwijderen_na: null,
    }).eq("id", n.id);
    await audit(admin, uid, "notitie_privacy_bevestigd", { object_type: "notitie", object_id: n.id, details: { reden: n.privacy_reden } });
    return json({ ok: true });
  }

  if (actie === "agenda") {
    const r = n.samenvatting as Uitkomst | null;
    const a = r?.afspraken?.[Number(index)] as Afspraak | undefined;
    if (!r || !a) return json({ fout: "afspraak niet gevonden" }, 404);
    if (a.event_id) return json({ fout: "deze afspraak staat al in je agenda" }, 409);
    const { data: cal } = await admin.from("sources").select("id").eq("owner_id", uid)
      .eq("kind", "calendar").eq("actief", true).limit(1).maybeSingle();
    if (!cal) return json({ fout: "geen agenda gekoppeld" }, 422);
    const token = await accessToken(admin, cal.id);
    const app = Deno.env.get("APP_URL")?.replace(/\/$/, "");
    const ev = await g(token, `${CAL}/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify(agendaGebeurtenis(a, { notitieTitel: n.titel ?? r.titel, link: app ? `${app}/notities/${n.id}` : null })),
    });
    a.event_id = ev.id;
    await admin.from("notities").update({ samenvatting: r }).eq("id", n.id);
    await audit(admin, uid, "notitie_agenda", { object_type: "notitie", object_id: n.id, details: { wat: a.wat, datum: a.datum } });
    return json({ ok: true, link: ev.htmlLink ?? null });
  }

  return json({ fout: "onbekende actie" }, 400);
});

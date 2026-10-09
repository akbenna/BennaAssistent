/**
 * VERSLAG EN HERINNERING ALS CONCEPT IN GMAIL
 *
 * Met jouw sessie, voor jouw notities. Er wordt niets verstuurd: het concept
 * staat in Gmail, en daar lees je het na en druk je zelf op verzenden.
 *
 * - notulen: het verslag aan de genodigden van de afspraak (de adressen komen
 *   uit de agenda, want de notitie kent alleen namen);
 * - herinnering: aan één persoon over één toezegging, met het adres alleen
 *   als de naam eenduidig bij een genodigde past.
 */
import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { accessToken, buildRaw, CAL, g, GMAIL } from "../_shared/google.ts";
import type { Uitkomst } from "../_shared/notities.ts";
import { adresVoor, herinneringMail, verslagMail, type Deelnemer } from "../_shared/opvolging.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);

  const { notitie_id, actie, index } = await req.json().catch(() => ({}));
  const { data: n } = await admin.from("notities").select("*").eq("id", notitie_id ?? "").eq("owner_id", uid).maybeSingle();
  if (!n) return json({ fout: "notitie niet gevonden" }, 404);
  const r = n.samenvatting as Uitkomst | null;
  if (!r) return json({ fout: "deze notitie heeft nog geen verslag" }, 422);
  if (n.status !== "gereed" && n.status !== "goedgekeurd") return json({ fout: "lees de notitie eerst na" }, 409);

  const { data: gmail } = await admin.from("sources").select("id,account").eq("owner_id", uid).eq("kind", "gmail").eq("actief", true).limit(1).maybeSingle();
  if (!gmail) return json({ fout: "geen Gmail gekoppeld" }, 422);
  const token = await accessToken(admin, gmail.id);
  const { data: inst } = await admin.from("notitie_instellingen").select("mijn_naam").eq("owner_id", uid).maybeSingle();
  const mijnNaam = (inst?.mijn_naam as string | undefined) || "Abdelkader";
  const titel = (n.agenda_titel as string | null) || (n.titel as string | null) || r.titel;

  // De genodigden, met adres, uit de afspraak in de agenda.
  let deelnemers: Deelnemer[] = [];
  if (n.agenda_event_id) {
    try {
      const { data: cal } = await admin.from("sources").select("id").eq("owner_id", uid).eq("kind", "calendar").eq("actief", true).limit(1).maybeSingle();
      if (cal) {
        const ev = await g(await accessToken(admin, cal.id), `${CAL}/calendars/primary/events/${encodeURIComponent(n.agenda_event_id)}`);
        deelnemers = (ev.attendees ?? []).filter((a: any) => a.email && !a.self && !a.resource)
          .map((a: any) => ({ email: String(a.email), naam: String(a.displayName ?? "") }));
      }
    } catch { /* zonder agenda: dan vul je de ontvangers zelf in */ }
  }

  let mail: { onderwerp: string; tekst: string };
  let aan: string[];
  if (actie === "notulen") {
    mail = verslagMail({ titel, datum: n.gestart_op, r, mijnNaam });
    aan = deelnemers.map((d) => d.email);
  } else if (actie === "herinnering") {
    const a = r.actiepunten?.[Number(index)];
    if (!a || a.van_mij) return json({ fout: "toezegging niet gevonden" }, 404);
    mail = herinneringMail({ a, titel, datum: n.gestart_op, mijnNaam });
    const adres = adresVoor(a.wie, deelnemers);
    aan = adres ? [adres] : [];
    a.herinnerd_op = new Date().toISOString();
    await admin.from("notities").update({ samenvatting: r }).eq("id", n.id);
  } else {
    return json({ fout: "onbekende actie" }, 400);
  }

  const d = await g(token, `${GMAIL}/drafts`, {
    method: "POST",
    body: JSON.stringify({ message: { raw: buildRaw({ to: aan.join(", "), subject: mail.onderwerp, body: mail.tekst }) } }),
  });
  await audit(admin, uid, actie === "notulen" ? "notulen_concept" : "herinnering_concept", {
    object_type: "notitie", object_id: n.id, details: { ontvangers: aan.length },
  });
  return json({ ok: true, ontvangers: aan, gmail_link: `https://mail.google.com/mail/#drafts?compose=${encodeURIComponent(d.message?.id ?? "")}` });
});

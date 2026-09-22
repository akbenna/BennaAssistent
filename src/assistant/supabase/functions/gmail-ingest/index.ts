import { adminClient, audit, isCron, json, type Admin } from "../_shared/core.ts";
import { accessToken, g, GMAIL, GoogleError, parseMessage, threadLink } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";
import { triageEnVoorstel, type Projectje } from "../_shared/verwerk.ts";

const OVERSLAAN = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS", "SPAM", "TRASH", "DRAFT"];
const domein = (a: string) => (a.toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? "");

/* Hoe ver we terugkijken als er geen peil is, of als Google het peil niet meer
   kent. Drie dagen was te krap: na een storing van een week zat er een gat in
   de mail dat nooit meer werd ingehaald. Zeven dagen kost bij een eerste ronde
   wat meer modelaanroepen en is dat waard. */
const TERUGKIJKEN = "newer_than:7d";

async function nieuweIds(token: string, cursor: string | null): Promise<{ ids: string[]; cursor: string }> {
  const beginOpnieuw = async () => {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const u = new URL(`${GMAIL}/messages`);
      u.searchParams.set("q", TERUGKIJKEN);
      u.searchParams.set("maxResults", "100");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const l = await g(token, u.toString());
      for (const m of l.messages ?? []) ids.push(m.id);
      pageToken = l.nextPageToken;
      // Twee bladzijden is genoeg: meer dan tweehonderd berichten in een week
      // wil je niet in één ronde door het model halen.
    } while (pageToken && ids.length < 200);
    const p = await g(token, `${GMAIL}/profile`);
    return { ids, cursor: String(p.historyId) };
  };
  if (!cursor) return beginOpnieuw();
  try {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let laatste = cursor;
    do {
      const u = new URL(`${GMAIL}/history`);
      u.searchParams.set("startHistoryId", cursor);
      u.searchParams.set("historyTypes", "messageAdded");
      u.searchParams.set("maxResults", "100");
      if (pageToken) u.searchParams.set("pageToken", pageToken);
      const h = await g(token, u.toString());
      for (const rec of h.history ?? []) for (const a of rec.messagesAdded ?? []) ids.push(a.message.id);
      laatste = String(h.historyId ?? laatste);
      pageToken = h.nextPageToken;
    } while (pageToken);
    return { ids, cursor: laatste };
  } catch (e) {
    // Een peil ouder dan ongeveer een week kent Google niet meer; dan maar
    // opnieuw beginnen in plaats van niets ophalen.
    if (e instanceof GoogleError && e.status === 404) return beginOpnieuw();
    throw e;
  }
}

async function verwerkBron(admin: Admin, src: any) {
  const token = await accessToken(admin, src.id);
  const { ids, cursor } = await nieuweIds(token, src.sync_cursor);
  const uniek = [...new Set(ids)];

  const bestaand = new Set<string>();
  if (uniek.length) {
    const { data } = await admin.from("items").select("extern_id").eq("source_id", src.id).in("extern_id", uniek);
    for (const r of data ?? []) bestaand.add(r.extern_id);
  }
  const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", src.owner_id);
  const { data: projects } = await admin.from("projects").select("id,afzenders,trefwoorden")
    .eq("owner_id", src.owner_id).eq("gearchiveerd", false);
  const labelLijst = await g(token, `${GMAIL}/labels`);
  const labelNaam = new Map<string, string>((labelLijst.labels ?? []).map((l: any) => [l.id, l.name]));

  let verwerkt = 0, uitgesloten = 0, voorstellen = 0, verdwenen = 0, mislukt = 0;
  for (const id of uniek) {
    if (bestaand.has(id)) continue;

    /* De geschiedenis noemt ook berichten die inmiddels weg zijn: verwijderd,
       of definitief uit de prullenbak gegooid. Google antwoordt dan met 404.
       Dat is geen storing maar een mail die er niet meer is. */
    let ruw: unknown;
    try {
      ruw = await g(token, `${GMAIL}/messages/${id}?format=full`);
    } catch (e) {
      if (e instanceof GoogleError && e.status === 404) { verdwenen++; continue; }
      throw e;
    }
    const m = parseMessage(ruw);
    if (m.labels.some((l) => OVERSLAAN.includes(l))) continue;
    if (m.labels.includes("SENT") && !m.labels.includes("INBOX")) continue; // eigen verzonden mail

    const labels = m.labels.map((l) => labelNaam.get(l) ?? l);
    const pc = checkPrivacy({ from: m.from, to: m.to, cc: m.cc, subject: m.subject, text: m.text, labels },
      (filters ?? []) as FilterRow[]);
    const basis = {
      owner_id: src.owner_id, source_id: src.id, extern_id: m.id, thread_id: m.threadId,
      deeplink: threadLink(m.threadId), ontvangen_op: m.date.toISOString(),
    };

    if (pc.excluded) {
      await admin.from("items").insert({ ...basis, afzender: domein(m.from), onderwerp: null,
        uitgesloten: true, uitsluitreden: pc.reason });
      uitgesloten++;
      continue;
    }

    /* Eerst opslaan, dan pas het model. Zo overleeft het bericht een storing
       bij Claude, schuift de cursor door en blijft de rest van de post niet
       achter één rotbericht steken. `retriage` haalt vannacht de samenvatting
       alsnog op. */
    const { data: item, error } = await admin.from("items")
      .insert({ ...basis, afzender: m.from, onderwerp: m.subject, samenvatting: null })
      .select("id").single();
    if (error || !item) { mislukt++; continue; }
    verwerkt++;

    try {
      const uit = await triageEnVoorstel(admin, src.owner_id, item.id, m, (projects ?? []) as Projectje[]);
      if (uit === "voorstel") voorstellen++;
    } catch (e) {
      mislukt++;
      await audit(admin, src.owner_id, "triage_fout", {
        object_type: "gmail", object_id: m.id, details: { fout: String(e).slice(0, 300) },
      });
    }
  }
  await admin.from("sources").update({ sync_cursor: cursor, laatst_gesynct: new Date().toISOString(), laatste_fout: null })
    .eq("id", src.id);
  return { bron: src.account, verwerkt, uitgesloten, voorstellen, verdwenen, mislukt };
}

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const admin = adminClient();
  const { data: bronnen } = await admin.from("sources").select("*").eq("kind", "gmail").eq("actief", true);
  const resultaat = [];
  for (const src of bronnen ?? []) {
    try {
      resultaat.push(await verwerkBron(admin, src));
    } catch (e) {
      const fout = e instanceof Error ? e.message : String(e);
      await admin.from("sources").update({ laatste_fout: fout.slice(0, 500) }).eq("id", src.id);
      resultaat.push({ bron: src.account, fout });
    }
  }
  return json({ resultaat });
});

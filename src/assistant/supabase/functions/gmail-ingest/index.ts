import { adminClient, audit, isCron, json, type Admin } from "../_shared/core.ts";
import { accessToken, g, GMAIL, GoogleError, parseMessage, threadLink } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";
import { triage, TRIAGE_MODEL } from "../_shared/claude.ts";

const OVERSLAAN = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS", "SPAM", "TRASH", "DRAFT"];
const domein = (a: string) => (a.toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? "");

async function nieuweIds(token: string, cursor: string | null): Promise<{ ids: string[]; cursor: string }> {
  const beginOpnieuw = async (q: string) => {
    const l = await g(token, `${GMAIL}/messages?q=${encodeURIComponent(q)}&maxResults=50`);
    const p = await g(token, `${GMAIL}/profile`);
    return { ids: (l.messages ?? []).map((m: any) => m.id), cursor: String(p.historyId) };
  };
  if (!cursor) return beginOpnieuw("newer_than:3d");
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
    if (e instanceof GoogleError && e.status === 404) return beginOpnieuw("newer_than:1d");
    throw e;
  }
}

function kiesProject(projects: any[], from: string, subject: string, text: string): string | null {
  const f = from.toLowerCase();
  const inhoud = `${subject}\n${text}`.toLowerCase();
  for (const p of projects) {
    if ((p.afzenders ?? []).some((a: string) => a && f.includes(a.toLowerCase()))) return p.id;
    if ((p.trefwoorden ?? []).some((t: string) => t && inhoud.includes(t.toLowerCase()))) return p.id;
  }
  return null;
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

  let verwerkt = 0, uitgesloten = 0, voorstellen = 0;
  for (const id of uniek) {
    if (bestaand.has(id)) continue;
    const m = parseMessage(await g(token, `${GMAIL}/messages/${id}?format=full`));
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

    const t = await triage(m);
    await audit(admin, src.owner_id, "triage", { object_type: "gmail", object_id: m.id, model: TRIAGE_MODEL(),
      details: { categorie: t.categorie } });
    const { data: item } = await admin.from("items").insert({ ...basis, afzender: m.from, onderwerp: m.subject,
      samenvatting: t.samenvatting }).select("id").single();
    verwerkt++;

    if (t.categorie === "actie" && item) {
      const { data: taak } = await admin.from("tasks").insert({
        owner_id: src.owner_id, titel: t.titel, toelichting: t.toelichting, status: "voorstel",
        prioriteit: t.prioriteit, deadline: t.deadline, aangemaakt_door: "assistent",
        project_id: kiesProject(projects ?? [], m.from, m.subject, m.text),
      }).select("id").single();
      if (taak) {
        await admin.from("task_links").insert({ owner_id: src.owner_id, task_id: taak.id, item_id: item.id, rol: "bron" });
        voorstellen++;
      }
    }
  }
  await admin.from("sources").update({ sync_cursor: cursor, laatst_gesynct: new Date().toISOString(), laatste_fout: null })
    .eq("id", src.id);
  return { bron: src.account, verwerkt, uitgesloten, voorstellen };
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

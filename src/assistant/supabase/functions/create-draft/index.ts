import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { accessToken, buildRaw, g, GMAIL, parseMessage, type ParsedMessage, threadLink } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";
import { schrijfConcept, WRITE_MODEL } from "../_shared/claude.ts";

const adres = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);
  const { task_id, instructie } = await req.json().catch(() => ({}));
  if (!task_id) return json({ fout: "task_id ontbreekt" }, 400);

  const { data: taak } = await admin.from("tasks").select("id,owner_id").eq("id", task_id).eq("owner_id", uid).maybeSingle();
  if (!taak) return json({ fout: "taak niet gevonden" }, 404);
  const { data: links } = await admin.from("task_links").select("items(thread_id, source_id, sources(kind))")
    .eq("task_id", task_id);
  const bron = (links ?? []).map((l: any) => l.items).find((i: any) => i?.thread_id && i?.sources?.kind === "gmail");
  if (!bron) return json({ fout: "geen gekoppelde mail bij deze taak" }, 422);

  const { data: src } = await admin.from("sources").select("id,account").eq("id", bron.source_id).single();
  if (!src) return json({ fout: "bron niet gevonden" }, 404);
  const token = await accessToken(admin, src.id);
  const thread = await g(token, `${GMAIL}/threads/${bron.thread_id}?format=full`);
  const berichten: ParsedMessage[] = (thread.messages ?? []).map(parseMessage);
  if (!berichten.length) return json({ fout: "lege mailwisseling" }, 422);
  const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", uid);

  for (const m of berichten) {
    const pc = checkPrivacy({ from: m.from, to: m.to, cc: m.cc, subject: m.subject, text: m.text }, (filters ?? []) as FilterRow[]);
    if (pc.excluded) {
      await audit(admin, uid, "concept_geweigerd", { object_type: "task", object_id: task_id, details: { reden: pc.reason } });
      return json({ fout: "Deze mailwisseling bevat mogelijk patiëntgegevens; geen concept gemaakt." }, 422);
    }
  }

  const eigen = (src.account ?? "").toLowerCase();
  const laatsteAnder = [...berichten].reverse().find((m) => adres(m.from) !== eigen) ?? berichten[berichten.length - 1];
  const tekst = berichten.slice(-5)
    .map((m) => `Van: ${m.from}\nDatum: ${m.date.toISOString()}\nOnderwerp: ${m.subject}\n\n${m.text}`).join("\n\n---\n\n");
  const { data: sjablonen } = await admin.from("templates").select("naam,inhoud").eq("owner_id", uid).eq("actief", true);

  const { tekst: body, verbruik } = await schrijfConcept({ thread: tekst, instructie, sjablonen: sjablonen ?? [] });
  const onderwerp = /^re:/i.test(laatsteAnder.subject) ? laatsteAnder.subject : `Re: ${laatsteAnder.subject}`;
  const raw = buildRaw({ to: laatsteAnder.from, subject: onderwerp, body, inReplyTo: laatsteAnder.messageIdHeader });
  const d = await g(token, `${GMAIL}/drafts`, { method: "POST",
    body: JSON.stringify({ message: { raw, threadId: bron.thread_id } }) });

  const { data: rij } = await admin.from("drafts").insert({
    owner_id: uid, task_id, gmail_draft_id: d.id, thread_id: bron.thread_id, status: "klaar",
  }).select("id").single();
  await audit(admin, uid, "concept_gemaakt", {
    object_type: "draft", object_id: rij?.id, model: WRITE_MODEL(), details: verbruik,
  });
  return json({ draft_id: rij?.id, tekst: body, gmail_link: threadLink(bron.thread_id) });
});

import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { accessToken, g, GMAIL, GoogleError } from "../_shared/google.ts";

// Eén tik = goedkeuren én versturen. Alleen door de ingelogde eigenaar; nooit vanuit cron.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);
  const { draft_id, herinner_na_werkdagen } = await req.json().catch(() => ({}));
  if (!draft_id) return json({ fout: "draft_id ontbreekt" }, 400);

  const { data: d } = await admin.from("drafts").select("*").eq("id", draft_id).eq("owner_id", uid).maybeSingle();
  if (!d) return json({ fout: "concept niet gevonden" }, 404);
  if (!["klaar", "aangepast", "goedgekeurd"].includes(d.status)) return json({ fout: `status is ${d.status}` }, 409);

  const { data: src } = await admin.from("sources").select("id").eq("owner_id", uid).eq("kind", "gmail")
    .eq("actief", true).limit(1).maybeSingle();
  if (!src) return json({ fout: "geen actieve Gmail-koppeling" }, 409);
  const token = await accessToken(admin, src.id);
  const nu = new Date().toISOString();
  let verstuurd: any;
  try {
    verstuurd = await g(token, `${GMAIL}/drafts/send`, { method: "POST", body: JSON.stringify({ id: d.gmail_draft_id }) });
  } catch (e) {
    if (e instanceof GoogleError && e.status === 404) {
      return json({ fout: "Concept staat niet meer in Gmail (al verstuurd of verwijderd)." }, 409);
    }
    throw e;
  }

  await admin.from("drafts").update({ status: "verstuurd", goedgekeurd_op: d.goedgekeurd_op ?? nu, verstuurd_op: nu })
    .eq("id", d.id);
  if (d.task_id) {
    await admin.from("followups").insert({
      owner_id: uid, task_id: d.task_id, thread_id: verstuurd.threadId ?? d.thread_id, verstuurd_op: nu,
      herinner_na_werkdagen: Number(herinner_na_werkdagen) || 5,
    });
    await admin.from("tasks").update({ status: "wacht_op_antwoord" }).eq("id", d.task_id);
  }
  await audit(admin, uid, "mail_verstuurd", { object_type: "draft", object_id: d.id, details: { thread: d.thread_id } });
  return json({ verstuurd: true });
});

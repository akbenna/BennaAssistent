import { adminClient, audit, isCron, json, werkdagenTussen } from "../_shared/core.ts";
import { accessToken, g, GMAIL } from "../_shared/google.ts";
import { bronVanTaak } from "../_shared/verwerk.ts";

const adres = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const admin = adminClient();
  const { data: open } = await admin.from("followups").select("*").is("beantwoord_op", null);
  // Per bron één token, niet per eigenaar: een opvolging hoort bij de mailbox
  // waaruit hij is verstuurd, en dat hoeft niet de enige van de eigenaar te zijn.
  const tokens = new Map<string, { token: string; account: string }>();
  let beantwoord = 0, herinnerd = 0;

  for (const f of open ?? []) {
    try {
      const bron = await bronVanTaak(admin, f.owner_id, f.task_id);
      if (!bron) continue;
      if (!tokens.has(bron.id)) {
        tokens.set(bron.id, { token: await accessToken(admin, bron.id), account: (bron.account ?? "").toLowerCase() });
      }
      const { token, account } = tokens.get(bron.id)!;
      const t = await g(token, `${GMAIL}/threads/${f.thread_id}?format=metadata&metadataHeaders=From`);
      const sinds = new Date(f.verstuurd_op).getTime();
      const antwoord = (t.messages ?? []).find((m: any) => {
        const from = m.payload?.headers?.find((h: any) => h.name === "From")?.value ?? "";
        return Number(m.internalDate) > sinds && adres(from) !== account;
      });

      if (antwoord) {
        const op = new Date(Number(antwoord.internalDate)).toISOString();
        await admin.from("followups").update({ beantwoord_op: op }).eq("id", f.id);
        await admin.from("tasks").update({ status: "antwoord_binnen" }).eq("id", f.task_id).eq("status", "wacht_op_antwoord");
        await audit(admin, f.owner_id, "antwoord_ontvangen", { object_type: "task", object_id: f.task_id });
        beantwoord++;
        continue;
      }

      const basis = f.laatste_herinnering_op ? new Date(f.laatste_herinnering_op) : new Date(f.verstuurd_op);
      if (werkdagenTussen(basis, new Date()) >= f.herinner_na_werkdagen) {
        await admin.from("followups").update({ laatste_herinnering_op: new Date().toISOString() }).eq("id", f.id);
        await audit(admin, f.owner_id, "opvolging_verlopen", { object_type: "task", object_id: f.task_id });
        herinnerd++;
      }
    } catch (e) {
      await audit(admin, f.owner_id, "opvolging_fout", { object_id: f.id, details: { fout: String(e).slice(0, 300) } });
    }
  }
  return json({ beantwoord, herinnerd });
});

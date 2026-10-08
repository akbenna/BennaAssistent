import { adminClient, audit, env } from "../_shared/core.ts";
import { exchangeCode, g, GMAIL, SCOPES } from "../_shared/google.ts";

const DRIVE_FILE = "https://www.googleapis.com/auth/drive.file";
const ontbrekend = (gegeven: string[]) => SCOPES.filter((s) => s.startsWith("https://") && !gegeven.includes(s));

const terug = (q: string) => Response.redirect(`${env("APP_URL")}?google=${q}`, 302);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return terug("geweigerd");

  const admin = adminClient();
  const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
  await admin.from("oauth_states").delete().eq("state", state);
  if (!st || new Date(st.verloopt_op) < new Date()) return terug("verlopen");

  /* Google kan de code weigeren (te oud, al gebruikt, client opnieuw ingesteld)
     en het profiel kan mislukken als de toestemming halverwege is ingetrokken.
     Zonder deze vangst kreeg je een kale 500 van de Edge Function te zien in
     plaats van het inlogscherm met een reden. */
  let tok: Record<string, unknown>;
  let profiel: { emailAddress: string };
  try {
    tok = await exchangeCode(code);
    const refresh = tok.refresh_token as string | undefined;
    if (!refresh) return terug("geen-refresh-token");
    profiel = await g<{ emailAddress: string }>(tok.access_token as string, `${GMAIL}/profile`);
  } catch {
    return terug("tokenfout");
  }
  const refresh = tok.refresh_token as string;
  /* Google laat je per toestemming een vinkje zetten. Wat je niet aanvinkt,
     krijgt de app niet, en dat merk je pas wanneer hij het nodig heeft. Daarom
     leggen we vast wat er werkelijk is gegeven, en zeggen we het meteen. */
  const scopes = String(tok.scope ?? "").split(/\s+/).filter(Boolean);
  for (const kind of ["gmail", "calendar", "drive"] as const) {
    const { data: src, error } = await admin.from("sources")
      .upsert({ owner_id: st.owner_id, kind, account: profiel.emailAddress, actief: true, scopes },
        { onConflict: "owner_id,kind,account" })
      .select("id").single();
    if (error) return terug("opslagfout");
    const { error: e2 } = await admin.rpc("bewaar_token", { p_source: src.id, p_token: refresh });
    if (e2) return terug("vaultfout");
  }
  await audit(admin, st.owner_id, "google_gekoppeld", { details: { account: profiel.emailAddress, ontbreekt: ontbrekend(scopes) } });

  if (!scopes.includes(DRIVE_FILE)) return terug("geen-docs");
  // Notities waar Google eerder geen document voor wilde maken, krijgen er nu alsnog een.
  const { data: wachtend } = await admin.from("notities").select("id,modellen")
    .eq("owner_id", st.owner_id).is("drive_doc_id", null).in("status", ["gereed", "goedgekeurd"]).limit(200);
  for (const n of (wachtend ?? []) as Array<{ id: string; modellen: Record<string, unknown> | null }>) {
    if (!n.modellen?.drive_fout) continue;
    await admin.from("notities").update({ modellen: { ...n.modellen, drive_opnieuw: true } }).eq("id", n.id);
  }
  return terug(ontbrekend(scopes).length ? "deels" : "gekoppeld");
});

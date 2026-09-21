import { adminClient, audit, env } from "../_shared/core.ts";
import { exchangeCode, g, GMAIL } from "../_shared/google.ts";

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

  const tok = await exchangeCode(code);
  const refresh = tok.refresh_token as string | undefined;
  if (!refresh) return terug("geen-refresh-token");

  const profiel = await g<{ emailAddress: string }>(tok.access_token as string, `${GMAIL}/profile`);
  for (const kind of ["gmail", "calendar", "drive"] as const) {
    const { data: src, error } = await admin.from("sources")
      .upsert({ owner_id: st.owner_id, kind, account: profiel.emailAddress, actief: true },
        { onConflict: "owner_id,kind,account" })
      .select("id").single();
    if (error) return terug("opslagfout");
    const { error: e2 } = await admin.rpc("bewaar_token", { p_source: src.id, p_token: refresh });
    if (e2) return terug("vaultfout");
  }
  await audit(admin, st.owner_id, "google_gekoppeld", { details: { account: profiel.emailAddress } });
  return terug("gekoppeld");
});

import { adminClient, cors, json, userId } from "../_shared/core.ts";
import { authUrl } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);
  const state = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await admin.from("oauth_states").insert({ state, owner_id: uid });
  if (error) return json({ fout: error.message }, 500);
  return json({ url: authUrl(state) });
});

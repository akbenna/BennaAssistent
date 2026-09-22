/**
 * DE HERKANSING
 *
 * Bij de ophaalronde wordt een bericht eerst opgeslagen en daarna pas
 * getriageerd. Gaat die triage mis, dan blijft het item staan zonder
 * samenvatting. Dat is geen verlies maar uitstel — en dit is het inhalen.
 *
 * Alleen berichten van de afgelopen zeven dagen: wat langer geleden is
 * misgegaan haal je niet meer in door het alsnog samen te vatten, en een
 * eeuwige wachtrij die elke nacht opnieuw faalt is erger dan geen wachtrij.
 * Een item waar al een taak aan hangt wordt overgeslagen; dat is al behandeld.
 */
import { adminClient, audit, isCron, json } from "../_shared/core.ts";
import { accessToken, g, GMAIL, GoogleError, parseMessage } from "../_shared/google.ts";
import { triageEnVoorstel, type Projectje } from "../_shared/verwerk.ts";

const DAGEN = 7;
const HOOGUIT = 40;

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const admin = adminClient();

  const { data: bronnen } = await admin.from("sources").select("id,owner_id,account")
    .eq("kind", "gmail").eq("actief", true);

  const resultaat = [];
  for (const src of bronnen ?? []) {
    let gelukt = 0, verdwenen = 0, mislukt = 0;
    try {
      const sinds = new Date(Date.now() - DAGEN * 86400e3).toISOString();
      const { data: open } = await admin.from("items").select("id,extern_id")
        .eq("source_id", src.id).is("samenvatting", null).eq("uitgesloten", false)
        .gte("created_at", sinds).order("created_at", { ascending: false }).limit(HOOGUIT);
      if (!open?.length) { resultaat.push({ bron: src.account, gelukt, verdwenen, mislukt }); continue; }

      const token = await accessToken(admin, src.id);
      const { data: projects } = await admin.from("projects").select("id,afzenders,trefwoorden")
        .eq("owner_id", src.owner_id).eq("gearchiveerd", false);

      for (const rij of open) {
        // Hangt er al een taak aan, dan is dit item al behandeld.
        const { count } = await admin.from("task_links").select("task_id", { count: "exact", head: true })
          .eq("item_id", rij.id);
        if (count) continue;

        try {
          const m = parseMessage(await g(token, `${GMAIL}/messages/${rij.extern_id}?format=full`));
          await triageEnVoorstel(admin, src.owner_id, rij.id, m, (projects ?? []) as Projectje[]);
          gelukt++;
        } catch (e) {
          if (e instanceof GoogleError && e.status === 404) { verdwenen++; continue; }
          mislukt++;
          await audit(admin, src.owner_id, "hertriage_fout", {
            object_type: "gmail", object_id: rij.extern_id, details: { fout: String(e).slice(0, 300) },
          });
        }
      }
      resultaat.push({ bron: src.account, gelukt, verdwenen, mislukt });
    } catch (e) {
      resultaat.push({ bron: src.account, fout: String(e).slice(0, 300) });
    }
  }
  return json({ resultaat });
});

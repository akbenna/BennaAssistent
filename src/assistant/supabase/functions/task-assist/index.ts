/**
 * MEEDENKEN BIJ EEN TAAK
 *
 * Vier wijzen, één ingang. Stappen en hoeken kunnen op de taak alleen; een
 * samenvatting vraagt om de mailwisseling, en een herschrijving om een tekst.
 *
 * Het privacyfilter draait hier net zo streng als bij `create-draft`, en om
 * dezelfde reden: zodra er een mailwisseling wordt opgehaald, gaat die naar het
 * model. Eén bericht in de draad dat patiëntinformatie bevat, en de hele
 * aanvraag wordt geweigerd. Niet het bericht overslaan en de rest doorsturen:
 * een draad is een geheel, en wat in bericht drie staat wordt in bericht vier
 * aangehaald.
 *
 * Wat het model teruggeeft wordt niet automatisch weggeschreven. De uitkomst
 * gaat als tekst terug naar het scherm, en de eigenaar beslist of het een
 * notitie wordt. Dat is hetzelfde uitgangspunt als bij de concepten: het model
 * stelt voor, de mens legt vast.
 */
import { adminClient, audit, cors, json, userId } from "../_shared/core.ts";
import { accessToken, buildRaw, g, GMAIL, parseMessage, type ParsedMessage } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";
import { denkMee, TRIAGE_MODEL, WRITE_MODEL, type Denkwijze } from "../_shared/claude.ts";

const WIJZEN: Denkwijze[] = ["stappen", "samenvatting", "hoeken", "herschrijf"];
const HEEFT_DRAAD_NODIG: Denkwijze[] = ["samenvatting", "hoeken"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = adminClient();
  const uid = await userId(req, admin);
  if (!uid) return json({ fout: "niet ingelogd" }, 401);

  const { task_id, wijze, concept, toon, draft_id } = await req.json().catch(() => ({}));
  if (!task_id) return json({ fout: "task_id ontbreekt" }, 400);
  if (!WIJZEN.includes(wijze)) return json({ fout: "onbekende wijze" }, 400);
  if (wijze === "herschrijf" && !concept?.trim()) {
    return json({ fout: "herschrijven kan alleen met een bestaande tekst" }, 400);
  }
  if (wijze === "herschrijf" && !draft_id) {
    // Zonder concept om bij te werken zou de herschrijving alleen op het scherm
    // staan terwijl versturen de oude tekst uit Gmail pakt. Dat is precies het
    // soort stille afwijking waar een verkeerde mail uit komt.
    return json({ fout: "draft_id ontbreekt bij herschrijven" }, 400);
  }

  const { data: taak } = await admin
    .from("tasks").select("id,titel,toelichting,deadline,owner_id")
    .eq("id", task_id).eq("owner_id", uid).maybeSingle();
  if (!taak) return json({ fout: "taak niet gevonden" }, 404);

  let draad: string | undefined;
  if (HEEFT_DRAAD_NODIG.includes(wijze)) {
    const { data: links } = await admin
      .from("task_links").select("items(thread_id, source_id, sources(kind))").eq("task_id", task_id);
    const bron = (links ?? [])
      .map((l: any) => l.items)
      .find((i: any) => i?.thread_id && i?.sources?.kind === "gmail");
    if (!bron) return json({ fout: "geen gekoppelde mail bij deze taak" }, 422);

    const token = await accessToken(admin, bron.source_id);
    const thread = await g(token, `${GMAIL}/threads/${bron.thread_id}?format=full`);
    const berichten: ParsedMessage[] = (thread.messages ?? []).map(parseMessage);
    if (!berichten.length) return json({ fout: "lege mailwisseling" }, 422);

    const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", uid);
    for (const m of berichten) {
      const pc = checkPrivacy(
        { from: m.from, to: m.to, cc: m.cc, subject: m.subject, text: m.text },
        (filters ?? []) as FilterRow[],
      );
      if (pc.excluded) {
        await audit(admin, uid, "meedenken_geweigerd", {
          object_type: "task", object_id: task_id, details: { wijze, reden: pc.reason },
        });
        return json({ fout: "Deze mailwisseling bevat mogelijk patiëntgegevens; er is niets naar het model gestuurd." }, 422);
      }
    }
    draad = berichten.slice(-6)
      .map((m) => `Van: ${m.from}\nDatum: ${m.date.toISOString()}\nOnderwerp: ${m.subject}\n\n${m.text}`)
      .join("\n\n---\n\n");
  }

  const { tekst, verbruik } = await denkMee({
    wijze,
    taak: { titel: taak.titel, toelichting: taak.toelichting, deadline: taak.deadline },
    thread: draad,
    concept: typeof concept === "string" ? concept : undefined,
    toon: typeof toon === "string" ? toon : undefined,
  });

  /*
   * Een herschrijving die alleen op het scherm staat is een val: versturen pakt
   * het concept uit Gmail, en dat is dan nog de oude tekst. Dus gaat de nieuwe
   * tekst hier het concept in, met dezelfde geadresseerde, hetzelfde onderwerp
   * en dezelfde antwoordkop als het concept al had — die worden uit het bestaande
   * concept gelezen en niet opnieuw afgeleid, want het concept kan in Gmail met
   * de hand zijn bijgewerkt.
   */
  if (wijze === "herschrijf") {
    const { data: rij } = await admin
      .from("drafts").select("id,gmail_draft_id,thread_id,owner_id,status")
      .eq("id", draft_id).eq("owner_id", uid).maybeSingle();
    if (!rij?.gmail_draft_id) return json({ fout: "concept niet gevonden" }, 404);
    if (rij.status === "verstuurd") return json({ fout: "dit concept is al verstuurd" }, 409);

    const { data: links } = await admin
      .from("task_links").select("items(source_id, sources(kind))").eq("task_id", task_id);
    const bron = (links ?? []).map((l: any) => l.items).find((i: any) => i?.sources?.kind === "gmail");
    if (!bron) return json({ fout: "geen gekoppelde mailbron" }, 422);

    const token = await accessToken(admin, bron.source_id);
    const bestaand = await g(token, `${GMAIL}/drafts/${rij.gmail_draft_id}?format=full`);
    // De koppen komen rechtstreeks uit het concept. `parseMessage` geeft bij
    // `messageIdHeader` de Message-ID van het concept zélf terug, en die in
    // In-Reply-To zetten laat het antwoord naar zichzelf verwijzen: Gmail hangt
    // het dan buiten de draad.
    const kop = (naam: string): string | null =>
      bestaand.message?.payload?.headers
        ?.find((h: { name: string; value: string }) => h.name.toLowerCase() === naam)?.value ?? null;
    const raw = buildRaw({
      to: kop("to") ?? "",
      subject: kop("subject") ?? "",
      body: tekst,
      inReplyTo: kop("in-reply-to"),
    });
    await g(token, `${GMAIL}/drafts/${rij.gmail_draft_id}`, {
      method: "PUT",
      body: JSON.stringify({ message: { raw, threadId: rij.thread_id } }),
    });
    await admin.from("drafts").update({ status: "aangepast" }).eq("id", rij.id);
  }

  const model = wijze === "stappen" || wijze === "hoeken" ? TRIAGE_MODEL() : WRITE_MODEL();
  await audit(admin, uid, "meegedacht", {
    object_type: "task", object_id: task_id, model, details: { wijze, toon, ...verbruik },
  });
  return json({ tekst, wijze });
});

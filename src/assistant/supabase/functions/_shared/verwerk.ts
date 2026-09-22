/**
 * WAT ER MET ÉÉN BERICHT GEBEURT NADAT HET IS OPGESLAGEN
 *
 * Dit stuk stond in `gmail-ingest` en is hierheen verhuisd omdat de nachtelijke
 * herkansing het ook nodig heeft. Twee kopieën van dezelfde vijftig regels
 * lopen na een half jaar uiteen, en dan verschilt wat je 's nachts krijgt van
 * wat je overdag krijgt.
 *
 * De volgorde is met opzet: het bericht staat al in de database vóórdat het
 * taalmodel eraan te pas komt. Gaat de triage mis — Claude even onbereikbaar,
 * een antwoord dat geen JSON is — dan staat het bericht er nog steeds, alleen
 * zonder samenvatting. De ophaalronde kan doorlopen en `retriage` pakt het
 * later op. Eerder gebeurde het omgekeerde: één mislukte triage brak de hele
 * ronde af, de cursor bleef staan en alle mail erna bleef ongezien.
 */
import { audit, type Admin } from "./core.ts";
import { triage, TRIAGE_MODEL } from "./claude.ts";
import type { ParsedMessage } from "./google.ts";

export interface Projectje {
  id: string;
  afzenders?: string[] | null;
  trefwoorden?: string[] | null;
}

/** Het eerste project waarvan een afzender of trefwoord raak is. */
export function kiesProject(projecten: Projectje[], from: string, subject: string, text: string): string | null {
  const f = from.toLowerCase();
  const inhoud = `${subject}\n${text}`.toLowerCase();
  for (const p of projecten) {
    if ((p.afzenders ?? []).some((a) => a && f.includes(a.toLowerCase()))) return p.id;
    if ((p.trefwoorden ?? []).some((t) => t && inhoud.includes(t.toLowerCase()))) return p.id;
  }
  return null;
}

export type Uitkomst = "voorstel" | "gelezen";

/**
 * Triageer een bericht dat al als item in de database staat, schrijf de
 * samenvatting erbij en maak er zo nodig een taakvoorstel van.
 *
 * Gooit door bij een fout: de aanroeper beslist of dat één bericht kost of de
 * hele ronde. Bij de ophaalronde is dat het eerste.
 */
export async function triageEnVoorstel(
  admin: Admin,
  ownerId: string,
  itemId: string,
  m: ParsedMessage,
  projecten: Projectje[],
): Promise<Uitkomst> {
  const t = await triage(m);
  await audit(admin, ownerId, "triage", {
    object_type: "gmail", object_id: m.id, model: TRIAGE_MODEL(),
    details: { categorie: t.categorie },
  });

  const { error } = await admin.from("items").update({ samenvatting: t.samenvatting }).eq("id", itemId);
  if (error) throw new Error(error.message);

  if (t.categorie !== "actie") return "gelezen";

  const { data: taak, error: e2 } = await admin.from("tasks").insert({
    owner_id: ownerId, titel: t.titel, toelichting: t.toelichting, status: "voorstel",
    prioriteit: t.prioriteit, deadline: t.deadline, aangemaakt_door: "assistent",
    project_id: kiesProject(projecten, m.from, m.subject, m.text),
  }).select("id").single();
  if (e2) throw new Error(e2.message);

  if (taak) {
    await admin.from("task_links").insert({ owner_id: ownerId, task_id: taak.id, item_id: itemId, rol: "bron" });
    return "voorstel";
  }
  return "gelezen";
}

/**
 * Welke Gmail-bron hoort bij deze taak?
 *
 * Eerder pakten `send-draft` en `followup-check` simpelweg de eerste actieve
 * Gmail-bron van de eigenaar. Met één gekoppeld account valt dat niet op, maar
 * zodra er een tweede bij komt — de praktijkmailbox naast de persoonlijke —
 * kan een antwoord vanuit het verkeerde adres de deur uit gaan. Een concept
 * hoort bij de mailwisseling waaruit het is ontstaan, en die wisseling weet
 * zelf uit welke bron hij komt.
 *
 * Valt er niets af te leiden (een taak die inmiddels weg is, bijvoorbeeld),
 * dan is de enige actieve bron nog altijd een redelijk antwoord — maar alleen
 * als er echt één is.
 */
export async function bronVanTaak(
  admin: Admin,
  ownerId: string,
  taskId: string | null,
): Promise<{ id: string; account: string | null } | null> {
  if (taskId) {
    const { data } = await admin.from("task_links")
      .select("items(source_id, sources(id, kind, account, actief))")
      .eq("task_id", taskId);
    for (const rij of (data ?? []) as Array<{ items: { sources?: { id: string; kind: string; account: string | null; actief: boolean } | null } | null }>) {
      const s = rij.items?.sources;
      if (s && s.kind === "gmail" && s.actief) return { id: s.id, account: s.account };
    }
  }
  const { data: alle } = await admin.from("sources").select("id,account")
    .eq("owner_id", ownerId).eq("kind", "gmail").eq("actief", true).limit(2);
  return (alle ?? []).length === 1 ? { id: alle![0]!.id, account: alle![0]!.account } : null;
}

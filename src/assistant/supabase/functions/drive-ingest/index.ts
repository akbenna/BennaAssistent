/**
 * WAT DRIVE HIER DOET, EN WAT NIET
 *
 * De koppeling met Drive bestond al, maar er was geen functie die er iets mee
 * deed: een deur zonder kamer erachter. Dit is de kamer.
 *
 * Wat hij doet: bijhouden welke documenten sinds de vorige ronde zijn gewijzigd
 * of met je gedeeld, en die als item vastleggen met hun naam, hun eigenaar en
 * een link. Zo kun je bij een taak over de jaarrekening zien dat de accountant
 * gisteren een blad heeft bijgewerkt, zonder je Drive door te spitten.
 *
 * Wat hij NIET doet: taakvoorstellen maken. Bij mail is dat zinnig — een mail
 * vraagt meestal iets van je. Een document dat verandert vraagt zelden iets;
 * een voorstel per gewijzigd bestand zou het voorstellenscherm onbruikbaar
 * maken. De documenten staan er, en jij beslist of er een taak bij hoort.
 *
 * Hij leest ook de inhoud niet. Voor het doel — weten dát er iets is veranderd
 * en waar het staat — is de naam genoeg, en wat je niet ophaalt kan ook niet
 * uitlekken. Er gaat hier dan ook niets naar een taalmodel.
 *
 * HET PRIVACYFILTER DRAAIT ALSNOG, EN DAT IS GEEN OVERBODIGE VOORZICHTIGHEID
 *
 * Een bestandsnaam kan een patiëntnaam dragen ("verwijsbrief mevrouw De Wit",
 * "uitslag 12-03"). Die naam gaat de database in en verschijnt op het scherm,
 * dus hij gaat langs dezelfde controle als een mailtekst. Valt een document af,
 * dan blijft alleen staan dát er iets is overgeslagen en waarom — niet welk
 * bestand.
 */
import { adminClient, audit, isCron, json, type Admin } from "../_shared/core.ts";
import { accessToken, DRIVE, g } from "../_shared/google.ts";
import { checkPrivacy, type FilterRow } from "../_shared/privacy.ts";

/* Google-eigen soorten hebben een mimetype dat niemand leest. De rest houdt
   zijn eigen type; daar zegt de extensie in de naam al genoeg. */
const SOORT: Record<string, string> = {
  "application/vnd.google-apps.document": "Document",
  "application/vnd.google-apps.spreadsheet": "Spreadsheet",
  "application/vnd.google-apps.presentation": "Presentatie",
  "application/vnd.google-apps.form": "Formulier",
  "application/vnd.google-apps.drawing": "Tekening",
  "application/pdf": "PDF",
};

/* Hoe ver terug we kijken als er nog geen peil is. Veertien dagen is genoeg om
   bij een eerste ronde te zien waar je mee bezig bent, en weinig genoeg om niet
   je halve archief binnen te trekken. */
const EERSTE_RONDE_DAGEN = 14;

interface DriveBestand {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
  lastModifyingUser?: { emailAddress?: string; displayName?: string };
  sharedWithMeTime?: string;
}

const wie = (b: DriveBestand): string => {
  const p = b.lastModifyingUser ?? b.owners?.[0];
  return p?.displayName ?? p?.emailAddress ?? "onbekend";
};

const domeinVan = (adres: string): string => adres.toLowerCase().match(/@([a-z0-9.-]+)/)?.[1] ?? "onbekend";

async function haalOp(admin: Admin, src: { id: string; owner_id: string; account: string | null; sync_cursor: string | null }) {
  const token = await accessToken(admin, src.id);

  const sinds = src.sync_cursor
    ?? new Date(Date.now() - EERSTE_RONDE_DAGEN * 86400e3).toISOString();

  const u = new URL(`${DRIVE}/files`);
  u.searchParams.set("q", `trashed = false and mimeType != 'application/vnd.google-apps.folder' and modifiedTime > '${sinds}'`);
  u.searchParams.set("orderBy", "modifiedTime desc");
  u.searchParams.set("pageSize", "50");
  u.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress,displayName),lastModifyingUser(emailAddress,displayName),sharedWithMeTime)");
  const lijst = await g(token, u.toString());
  const bestanden: DriveBestand[] = lijst.files ?? [];

  const { data: filters } = await admin.from("filters").select("soort,waarde,actief").eq("owner_id", src.owner_id);
  const { data: al } = await admin.from("items").select("extern_id").eq("source_id", src.id);
  const bekend = new Set((al ?? []).map((r: { extern_id: string }) => r.extern_id));

  let verwerkt = 0, uitgesloten = 0;
  let hoogste = sinds;

  for (const b of bestanden) {
    if (b.modifiedTime > hoogste) hoogste = b.modifiedTime;
    // Een document dat opnieuw wordt gewijzigd krijgt geen tweede rij; het item
    // wijst naar het bestand en niet naar de versie.
    if (bekend.has(b.id)) continue;

    const eigenaar = b.owners?.[0]?.emailAddress ?? b.lastModifyingUser?.emailAddress ?? "";
    const pc = checkPrivacy(
      { from: eigenaar, subject: b.name, text: b.name },
      (filters ?? []) as FilterRow[],
    );

    const basis = {
      owner_id: src.owner_id, source_id: src.id, extern_id: b.id, thread_id: null,
      deeplink: b.webViewLink ?? null, ontvangen_op: b.modifiedTime,
    };

    if (pc.excluded) {
      // Geen naam, geen link: alleen het domein van de eigenaar en de reden.
      await admin.from("items").insert({
        ...basis, deeplink: null, afzender: eigenaar ? domeinVan(eigenaar) : null,
        onderwerp: null, uitgesloten: true, uitsluitreden: pc.reason,
      });
      uitgesloten++;
      continue;
    }

    const soort = SOORT[b.mimeType] ?? "Bestand";
    await admin.from("items").insert({
      ...basis, afzender: wie(b), onderwerp: b.name,
      samenvatting: b.sharedWithMeTime ? `${soort}, met je gedeeld` : `${soort}, gewijzigd door ${wie(b)}`,
    });
    verwerkt++;
  }

  await admin.from("sources")
    .update({ sync_cursor: hoogste, laatst_gesynct: new Date().toISOString(), laatste_fout: null })
    .eq("id", src.id);

  return { bron: src.account, verwerkt, uitgesloten };
}

Deno.serve(async (req) => {
  if (!isCron(req)) return json({ fout: "geen toegang" }, 401);
  const admin = adminClient();
  const { data: bronnen } = await admin.from("sources").select("id,owner_id,account,sync_cursor")
    .eq("kind", "drive").eq("actief", true);

  const resultaat = [];
  for (const src of bronnen ?? []) {
    try {
      const r = await haalOp(admin, src as never);
      await audit(admin, (src as { owner_id: string }).owner_id, "drive_gelezen", { details: r });
      resultaat.push(r);
    } catch (e) {
      const reden = String(e).slice(0, 300);
      await admin.from("sources").update({ laatste_fout: reden }).eq("id", (src as { id: string }).id);
      resultaat.push({ bron: (src as { account: string | null }).account, fout: reden });
    }
  }
  return json({ bronnen: resultaat });
});

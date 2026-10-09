import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { adresVoor, eersteAlinea, herinneringMail, verslagMail } from "./opvolging.ts";
import { trekRecht } from "./notities.ts";
import { aanvulPrompt, zonderOpmaak } from "./onderzoek.ts";
import { buildRaw } from "./google.ts";

const r = trekRecht({
  titel: "Bestuur", samenvatting: "Eerste alinea over de begroting.\n\nTweede alinea die niet in de mail hoort.",
  besluiten: ["Begroting 2027 goedgekeurd"],
  actiepunten: [
    { wie: "Jan de Vries", wat: "Offerte zaal opvragen", deadline: "2026-11-01", van_mij: false },
    { wie: "Abdelkader", wat: "Accountant bellen", deadline: "", van_mij: true },
    { wie: "Jan de Vries", wat: "Notulen nalezen", deadline: "", van_mij: false },
  ],
  afspraken: [{ wat: "Volgende vergadering", datum: "2026-11-12", begintijd: "19:30", eindtijd: "", locatie: "Roermond" }],
  open_vragen: ["Wie zit de ALV voor?"],
}, []);

Deno.test("verslagMail: eerste alinea, besluiten, acties per persoon, afspraken en open vragen", () => {
  const m = verslagMail({ titel: "Bestuursvergadering", datum: "2026-10-08T18:00:00Z", r, mijnNaam: "Abdelkader" });
  assertEquals(m.onderwerp, "Verslag: Bestuursvergadering (8 oktober 2026)");
  assertStringIncludes(m.tekst, "Eerste alinea over de begroting.");
  assert(!m.tekst.includes("Tweede alinea"));
  assertStringIncludes(m.tekst, "Besluiten\n- Begroting 2027 goedgekeurd");
  assertStringIncludes(m.tekst, "Jan de Vries:\n- Offerte zaal opvragen (vóór 1 november 2026)\n- Notulen nalezen");
  assertStringIncludes(m.tekst, "Abdelkader:\n- Accountant bellen");
  assertStringIncludes(m.tekst, "- 12 november 2026 om 19:30: Volgende vergadering, Roermond");
  assertStringIncludes(m.tekst, "Nog open\n- Wie zit de ALV voor?");
  assert(m.tekst.endsWith("Met vriendelijke groet,\nAbdelkader"));
});

Deno.test("herinneringMail: voornaam, het actiepunt letterlijk, en de streefdatum", () => {
  const m = herinneringMail({ a: r.actiepunten[0]!, titel: "Bestuursvergadering", datum: "2026-10-08T18:00:00Z", mijnNaam: "Abdelkader" });
  assert(m.tekst.startsWith("Beste Jan,"));
  assertStringIncludes(m.tekst, "met als streefdatum 1 november 2026");
  assertStringIncludes(m.tekst, "\nOfferte zaal opvragen\n");
  assertEquals(herinneringMail({ a: { ...r.actiepunten[0]!, wie: "onbekend" }, titel: "x", datum: "2026-10-08", mijnNaam: "A" }).tekst.split("\n")[0], "Beste,");
});

Deno.test("adresVoor: alleen bij een eenduidige match, anders geen adres", () => {
  const d = [
    { email: "jan.devries@zorggroep.nl", naam: "Jan de Vries" },
    { email: "jan.jansen@x.nl", naam: "Jan Jansen" },
    { email: "p.smeets@x.nl", naam: "" },
  ];
  assertEquals(adresVoor("Jan de Vries", d), "jan.devries@zorggroep.nl");
  assertEquals(adresVoor("Jan", d), null, "twee keer Jan: geen gok");
  assertEquals(adresVoor("Smeets", d), "p.smeets@x.nl", "naam uit het adres als de weergavenaam ontbreekt");
  assertEquals(adresVoor("", d), null);
});

Deno.test("eersteAlinea en buildRaw zonder ontvanger", () => {
  assertEquals(eersteAlinea("\n\nA\n\nB"), "A");
  const raw = atob(buildRaw({ to: "", subject: "x", body: "y" }).replace(/-/g, "+").replace(/_/g, "/"));
  assert(!raw.includes("To:"));
});

Deno.test("zonderOpmaak: sterretjes en kopjes weg, de tekst blijft", () => {
  assertEquals(zonderOpmaak("**1. BRIDGE-studie**\n\n## Kop\n* punt\nLDL *daalde* 3*4"), "1. BRIDGE-studie\n\nKop\n- punt\nLDL daalde 3*4");
});

Deno.test("aanvulPrompt: alle aandachtsgebieden, de eigen focus en de bestaande thema's", () => {
  const p = aanvulPrompt({ onderwerp: "ESC 2026", focus: "GLP-1 bij obesitas", themas: [{ titel: "SINGLE-AF" } as never] });
  for (const g of ["lipiden en Lp(a)", "hypertensie", "diabetes type 2", "obesitas en leefstijl", "GLP-1 bij obesitas"]) assertStringIncludes(p.gebruiker, g);
  assertStringIncludes(p.gebruiker, "- SINGLE-AF");
  assertStringIncludes(p.systeem, "esc365.escardio.org");
});

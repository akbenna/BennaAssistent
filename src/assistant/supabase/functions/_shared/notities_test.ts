import { assert, assertEquals } from "jsr:@std/assert@1";
import { agendaGebeurtenis, extensieVoor, GEEN_PROJECT, maakTranscript, plaatsDeel, schema, trekRecht } from "./notities.ts";
import { schrijfUit } from "./spraak.ts";
import { vatSamen } from "./samenvatten.ts";

Deno.test("plaatsDeel: tijden lopen door over delen, labels krijgen het deelnummer", () => {
  const s = plaatsDeel([
    { spreker: "Abdelkader", start: 1, eind: 3, tekst: " Goedemorgen. " },
    { spreker: "B", start: 4, eind: 6, tekst: "Prima." },
    { spreker: null, start: 7, eind: null, tekst: "" },
  ], { volgnummer: 2, begin: 300, duur: 300 }, "Abdelkader");
  assertEquals(s.length, 2, "lege tekst valt weg");
  assertEquals(s[0], { spreker: "Abdelkader", start: 301, eind: 303, tekst: "Goedemorgen." });
  // "B" in deel 2 is een andere "B" dan in deel 1; het model moet dat kunnen zien.
  assertEquals(s[1]!.spreker, "Spreker 2B");
});

Deno.test("maakTranscript voegt dezelfde spreker samen en sorteert op tijd", () => {
  const t = maakTranscript([
    { spreker: "Spreker 1A", start: 70, eind: 72, tekst: "Nog één punt." },
    { spreker: "Abdelkader", start: 0, eind: 3, tekst: "Goedemorgen." },
    { spreker: "Abdelkader", start: 3.5, eind: 6, tekst: "Zullen we beginnen?" },
    { spreker: "Spreker 1A", start: 6.2, eind: 9, tekst: "Prima." },
  ]);
  assertEquals(t.split("\n").length, 3);
  assert(t.startsWith("[0:00] Abdelkader: Goedemorgen. Zullen we beginnen?"));
  assert(t.includes("[1:10] Spreker 1A: Nog één punt."));
});

Deno.test("schema voldoet aan strikte structured outputs", () => {
  const streng = (o: any): boolean => o.type !== "object" || (o.additionalProperties === false
    && Object.keys(o.properties).every((k) => o.required.includes(k))
    && Object.values(o.properties).every((p: any) => streng(p.items ?? p)));
  const s = schema(["ASF Limburg"]);
  assert(streng(s));
  assertEquals(s.properties.project.enum, ["ASF Limburg", GEEN_PROJECT]);
});

Deno.test("trekRecht verzint geen datum en geen project", () => {
  const r = trekRecht({
    titel: "  Begroting  ", project: "Onbestaand", samenvatting: "Tekst.",
    actiepunten: [
      { wie: "", wat: "Penningmeester bellen", deadline: "volgende week", van_mij: "ja" },
      { wie: "Jan", wat: "", deadline: "2026-11-01", van_mij: true },
    ],
    afspraken: [
      { wat: "Bestuursvergadering", datum: "2026-11-12", begintijd: "19:30", eindtijd: "25:00", locatie: "" },
      { wat: "Zonder datum", datum: "binnenkort", begintijd: "", eindtijd: "", locatie: "" },
    ],
  }, ["ASF Limburg"]);
  assertEquals(r.titel, "Begroting");
  assertEquals(r.project, GEEN_PROJECT);
  assertEquals(r.actiepunten, [{ wie: "onbekend", wat: "Penningmeester bellen", deadline: "", van_mij: false }]);
  assertEquals(r.afspraken.length, 1);
  assertEquals(r.afspraken[0]!.eindtijd, "", "een onmogelijke tijd wordt leeg");
  assertEquals(r.besluiten, []);
});

Deno.test("agendaGebeurtenis: met tijd een uur, zonder tijd een hele dag", () => {
  const metTijd = agendaGebeurtenis({ wat: "Overleg", datum: "2026-11-12", begintijd: "19:30", eindtijd: "", locatie: "" }, { notitieTitel: "ASF", link: null });
  assertEquals(metTijd.start, { dateTime: "2026-11-12T19:30:00", timeZone: "Europe/Amsterdam" });
  assertEquals(metTijd.end, { dateTime: "2026-11-12T20:30:00", timeZone: "Europe/Amsterdam" });
  const heleDag = agendaGebeurtenis({ wat: "Deadline", datum: "2026-12-31", begintijd: "", eindtijd: "", locatie: "" }, { notitieTitel: "ASF", link: null });
  assertEquals(heleDag.start, { date: "2026-12-31" });
  assertEquals(heleDag.end, { date: "2027-01-01" }, "het einde van een hele dag is de dag erna");
  const laat = agendaGebeurtenis({ wat: "Laat", datum: "2026-11-12", begintijd: "23:30", eindtijd: "", locatie: "" }, { notitieTitel: "x", link: null });
  assertEquals(laat.end, { dateTime: "2026-11-12T23:59:00", timeZone: "Europe/Amsterdam" }, "niet over middernacht heen");
});

Deno.test("extensieVoor kent wat de app en een iPhone aanleveren", () => {
  assertEquals(extensieVoor("audio/webm;codecs=opus"), "webm");
  assertEquals(extensieVoor("audio/mp4"), "m4a");
  assertEquals(extensieVoor("audio/x-m4a"), "m4a");
  assertEquals(extensieVoor("audio/wav"), "wav");
});

/* ---------------------------------------------------------------- uitval -- */

function nepFetch(antwoorden: Record<string, () => Response>) {
  const orig = globalThis.fetch;
  const gezien: string[] = [];
  globalThis.fetch = ((url: string | URL) => {
    const u = String(url);
    gezien.push(u);
    const sleutel = Object.keys(antwoorden).find((k) => u.includes(k));
    return Promise.resolve(sleutel ? antwoorden[sleutel]!() : new Response("onbekend", { status: 404 }));
  }) as typeof fetch;
  return { gezien, herstel: () => { globalThis.fetch = orig; } };
}

Deno.test("transcriptie valt bij een weigering van OpenAI terug op Mistral", async () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  Deno.env.set("MISTRAL_API_KEY", "y");
  const nep = nepFetch({
    "api.openai.com/v1/audio": () => new Response("{}", { status: 400 }),
    "api.mistral.ai": () => new Response(JSON.stringify({ segments: [{ start: 0, end: 2, text: "Hallo" }] }), { status: 200 }),
  });
  try {
    const r = await schrijfUit(new Uint8Array([1, 2, 3]), "audio/webm", { naam: "Abdelkader", referentie: null });
    assert(r.dienst.startsWith("mistral:"));
    assert(r.uitval?.includes("400"), "de reden van de uitval gaat mee, zodat je hem ziet");
    assertEquals(r.segmenten[0]!.tekst, "Hallo");
  } finally { nep.herstel(); }
});

Deno.test("samenvatten valt bij een storing van OpenAI terug op Claude, met hetzelfde schema", async () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  Deno.env.set("ANTHROPIC_API_KEY", "z");
  const nep = nepFetch({
    "/responses": () => new Response("storing", { status: 503 }),
    "api.anthropic.com": () => new Response(JSON.stringify({
      content: [{ type: "tool_use", name: "notitie", input: { titel: "Begroting", project: "ASF Limburg", samenvatting: "Het bestuur besprak.", deelnemers: [], besluiten: ["Vastgesteld."], actiepunten: [], afspraken: [], open_vragen: [], mijn_vervolgstappen: [] } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200 }),
  });
  try {
    const r = await vatSamen({ transcript: "[0:00] Abdelkader: Welkom.", mijnNaam: "Abdelkader", datum: "8 oktober 2026", projecten: [{ naam: "ASF Limburg" }] });
    assert(r.dienst.startsWith("anthropic:"));
    assertEquals(r.uitkomst.project, "ASF Limburg");
    assertEquals(r.verbruik, { invoer: 10, uitvoer: 5 });
  } finally { nep.herstel(); }
});

Deno.test("samenvatten via OpenAI leest de strikte JSON", async () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  const nep = nepFetch({
    "/responses": () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ titel: "Kort", project: "Geen", samenvatting: "S.", deelnemers: [], besluiten: [], actiepunten: [{ wie: "Abdelkader", wat: "Offerte opvragen", deadline: "2026-10-20", van_mij: true }], afspraken: [], open_vragen: [], mijn_vervolgstappen: [] }) }] }],
      usage: { input_tokens: 3, output_tokens: 2 },
    }), { status: 200 }),
  });
  try {
    const r = await vatSamen({ transcript: "x", mijnNaam: "Abdelkader", datum: "vandaag", projecten: [] });
    assert(r.dienst.startsWith("openai:"));
    assertEquals(r.uitkomst.actiepunten[0]!.van_mij, true);
    assert(nep.gezien[0]!.startsWith("https://eu.api.openai.com/"), "standaard via de EU-endpoint");
  } finally { nep.herstel(); }
});

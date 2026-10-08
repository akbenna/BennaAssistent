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
    assert(r.dienst.startsWith("claude:"));
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

/* ------------------------------------------------------- de volgorde --- */

import { opVolgorde, volgorde } from "./diensten.ts";
import {
  fotoSchema, leesPubmedXml, pubmedZoekterm, schoonDoi, trekFotoRecht, vancouver, verdiepSchema, verzamelBronnen,
} from "./notities.ts";
import { verdiep } from "./bronnen.ts";

Deno.test("volgorde: uit de omgeving, alleen met sleutel, zonder dubbele of onbekende", () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  Deno.env.set("MISTRAL_API_KEY", "y");
  Deno.env.delete("ANTHROPIC_API_KEY");
  Deno.env.set("TEKST_VOLGORDE", "mistral, onzin, openai, mistral, claude");
  assertEquals(volgorde("TEKST_VOLGORDE", ["openai", "claude"], ["openai", "claude", "mistral"] as const), ["mistral", "openai"]);
  Deno.env.delete("TEKST_VOLGORDE");
  assertEquals(volgorde("TEKST_VOLGORDE", ["openai", "claude"], ["openai", "claude", "mistral"] as const), ["openai"],
    "zonder variabele de standaard, en Claude valt af zonder sleutel");
});

Deno.test("opVolgorde: de eerste die lukt wint, en de uitval gaat mee", async () => {
  const r = await opVolgorde(["a", "b", "c"], async (d) => { if (d === "a") throw new Error("plat"); return d; }, "geen");
  assertEquals(r.uitkomst, "b");
  assert(r.uitval?.includes("a: plat"));
});

/* --------------------------------------------------------- de bronnen --- */

Deno.test("schoonDoi haalt de DOI uit een link en laat het leesteken erachter weg", () => {
  assertEquals(schoonDoi("https://doi.org/10.1056/NEJMoa2307563."), "10.1056/nejmoa2307563");
  assertEquals(schoonDoi("geen doi"), "");
});

Deno.test("verzamelBronnen: een bron op de slide en in het gesprek komt één keer", () => {
  const b = verzamelBronnen(
    [{ volgnummer: 2, moment: 754, analyse: { soort: "slide", kern: "Semaglutide verlaagt MACE met 20%.", tekst: "", cijfers: [],
      referenties: [{ auteurs: "Lincoff AM", titel: "Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes", tijdschrift: "N Engl J Med", jaar: "2023", doi: "10.1056/NEJMoa2307563", pmid: "" }] } }],
    [
      { omschrijving: "SELECT-trial", auteurs: "", jaar: "2023", tijdschrift: "", doi: "10.1056/nejmoa2307563", bewering: "Twintig procent minder hart- en vaatziekte." },
      { omschrijving: "SCORE2-Diabetes", auteurs: "", jaar: "", tijdschrift: "", doi: "", bewering: "Beter dan SCORE2 bij diabetes." },
    ],
  );
  assertEquals(b.length, 2);
  assertEquals(b[0]!.herkomst, "slide 2 (12:34)");
  assertEquals(b[0]!.bewering, "Twintig procent minder hart- en vaatziekte.", "de bewering uit het gesprek wint");
  assertEquals(b[1]!.herkomst, "gesprek");
});

Deno.test("pubmedZoekterm: DOI als die er is, anders titelwoorden, auteur en jaar", () => {
  assertEquals(pubmedZoekterm({ omschrijving: "x", auteurs: "", jaar: "", doi: "10.1/abc" }), "10.1/abc[doi]");
  assertEquals(pubmedZoekterm({ omschrijving: "Semaglutide and Cardiovascular Outcomes", auteurs: "Lincoff AM et al", jaar: "2023", doi: "" }),
    "(semaglutide cardiovascular outcomes) AND Lincoff[au] AND 2023[dp]");
});

const PUBMED_XML = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">37952131</PMID><Article>
<Journal><JournalIssue><PubDate><Year>2023</Year></PubDate></JournalIssue><Title>The New England journal of medicine</Title><ISOAbbreviation>N Engl J Med</ISOAbbreviation></Journal>
<ArticleTitle>Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes.</ArticleTitle>
<Abstract><AbstractText Label="BACKGROUND">Semaglutide reduces weight.</AbstractText><AbstractText Label="RESULTS">MACE 6.5% vs 8.0%; HR 0.80 (95% CI 0.72 to 0.90).</AbstractText></Abstract>
<AuthorList><Author><LastName>Lincoff</LastName><Initials>AM</Initials></Author><Author><LastName>Brown-Frandsen</LastName><Initials>K</Initials></Author></AuthorList>
</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1056/NEJMoa2307563</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

Deno.test("leesPubmedXml en vancouver", () => {
  const [g] = leesPubmedXml(PUBMED_XML);
  assertEquals(g!.pmid, "37952131");
  assertEquals(g!.doi, "10.1056/nejmoa2307563");
  assertEquals(g!.auteurs, ["Lincoff AM", "Brown-Frandsen K"]);
  assert(g!.abstract.includes("RESULTS: MACE 6.5% vs 8.0%"));
  assertEquals(vancouver(g!), "Lincoff AM, Brown-Frandsen K. Semaglutide and Cardiovascular Outcomes in Obesity without Diabetes. N Engl J Med. 2023. doi:10.1056/nejmoa2307563 PMID: 37952131");
});

Deno.test("trekFotoRecht: geen verzonnen PMID of jaartal", () => {
  const f = trekFotoRecht({ soort: "dia", kern: "K", tekst: "T", cijfers: ["HR 0,80"],
    referenties: [{ auteurs: "Lincoff", titel: "", tijdschrift: "", jaar: "ca. 2023", doi: "", pmid: "onbekend" }, { auteurs: "", titel: "", tijdschrift: "", jaar: "", doi: "", pmid: "" }] });
  assertEquals(f.soort, "overig");
  assertEquals(f.referenties, [{ auteurs: "Lincoff", titel: "", tijdschrift: "", jaar: "2023", doi: "", pmid: "" }]);
});

Deno.test("foto- en verdiepschema voldoen aan strikte structured outputs", () => {
  const streng = (o: any): boolean => o.type !== "object" || (o.additionalProperties === false
    && Object.keys(o.properties).every((k) => o.required.includes(k))
    && Object.values(o.properties).every((p: any) => streng(p.items ?? p)));
  assert(streng(fotoSchema));
  assert(streng(verdiepSchema));
  assert(streng(schema(["x"])));
});

Deno.test("verdiep: de bron komt van PubMed, en zonder abstract is er geen oordeel", async () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  Deno.env.delete("TEKST_VOLGORDE");
  const nep = nepFetch({
    "esearch.fcgi": () => new Response(JSON.stringify({ esearchresult: { idlist: ["37952131"] } }), { status: 200 }),
    "efetch.fcgi": () => new Response(PUBMED_XML, { status: 200 }),
    "/responses": () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      bronnen: [
        { nummer: 1, bevindingen: "MACE 6,5% versus 8,0%.", oordeel: "genuanceerd", toelichting: "Relatief 20%, absoluut 1,5 procentpunt." },
        { nummer: 2, bevindingen: "Verzonnen uitkomst.", oordeel: "bevestigd", toelichting: "Verzonnen." },
      ], duiding: "Sterk bewijs bij obesitas met HVZ." }) }] }] }), { status: 200 }),
    "api.crossref.org": () => new Response("{}", { status: 404 }),
  });
  try {
    const { verdieping } = await verdiep([
      { omschrijving: "SELECT", auteurs: "", jaar: "", tijdschrift: "", doi: "10.1056/nejmoa2307563", pmid: "", bewering: "20% minder MACE", herkomst: "slide 1" },
      { omschrijving: "Een studie die niet bestaat", auteurs: "", jaar: "", tijdschrift: "", doi: "", pmid: "", bewering: "Alles werkt", herkomst: "gesprek" },
    ]);
    assertEquals(verdieping.bronnen[0]!.oordeel, "genuanceerd");
    assert(verdieping.bronnen[0]!.citaat.includes("PMID: 37952131"), "de citatie komt van PubMed, niet van het model");
  } finally { nep.herstel(); }

  // Nu een bron die PubMed niet kent, terwijl het model toch een uitkomst verzint.

  const nep2 = nepFetch({
    "esearch.fcgi": () => new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 }),
    "/responses": () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
      bronnen: [{ nummer: 1, bevindingen: "Verzonnen uitkomst.", oordeel: "bevestigd", toelichting: "Verzonnen." }], duiding: "" }) }] }] }), { status: 200 }),
  });
  try {
    const { verdieping } = await verdiep([{ omschrijving: "Een studie die niet bestaat", auteurs: "", jaar: "", tijdschrift: "", doi: "", pmid: "", bewering: "Alles werkt", herkomst: "gesprek" }]);
    const b = verdieping.bronnen[0]!;
    assertEquals(b.gevonden, false);
    assertEquals(b.oordeel, "niet te beoordelen", "het model mag niets beweren over een bron die niet gevonden is");
    assertEquals(b.bevindingen, "");
  } finally { nep2.herstel(); }
});

/* ---------------------------------------------- sprekers over de delen --- */

import { koppelSprekers, noemSprekers, zelfdeUitspraak } from "./notities.ts";

Deno.test("zelfdeUitspraak: dezelfde zin op de naad, ook met een woord minder", () => {
  assert(zelfdeUitspraak("Dat is precies het punt, Jan.", "dat is precies het punt"));
  assert(!zelfdeUitspraak("Dat is precies het punt.", "We gaan door naar agendapunt drie."));
  assert(!zelfdeUitspraak("Ja.", "Ja."), "één woord is te weinig om twee sprekers aan elkaar te koppelen");
});

Deno.test("koppelSprekers: wie op de naad spreekt houdt zijn label, de dubbele zin verdwijnt", () => {
  const s = koppelSprekers([
    { volgnummer: 1, begin: 0, duur: 304, segmenten: [
      { spreker: "Abdelkader", start: 0, eind: 5, tekst: "Welkom allemaal." },
      { spreker: "A", start: 10, eind: 20, tekst: "Ik begin met de begroting." },
      { spreker: "B", start: 296, eind: 303, tekst: "De reserves zijn dit jaar gedaald." },
    ] },
    // Deel 2 begint op 300 s; de eerste vier seconden zijn de overlap.
    { volgnummer: 2, begin: 300, duur: 300, segmenten: [
      { spreker: "A", start: 0, eind: 3, tekst: "reserves zijn dit jaar gedaald" },
      { spreker: "A", start: 6, eind: 12, tekst: "En daarom stel ik voor het noodfonds te verhogen." },
      { spreker: "B", start: 20, eind: 25, tekst: "Daar ben ik het niet mee eens." },
    ] },
  ], "Abdelkader");
  const wie = (t: string) => s.find((x) => x.tekst.startsWith(t))?.spreker;
  assertEquals(wie("Welkom"), "Abdelkader");
  assertEquals(wie("Ik begin"), "Spreker A");
  assertEquals(wie("De reserves"), "Spreker B");
  // "A" in deel 2 is dezelfde als "B" in deel 1: zij sprak over de naad heen.
  assertEquals(wie("En daarom"), "Spreker B");
  // "B" in deel 2 is niet te koppelen en krijgt een eigen letter, niet die van een ander.
  assertEquals(wie("Daar ben"), "Spreker C");
  assertEquals(s.filter((x) => x.tekst.includes("gedaald")).length, 1, "de zin uit de overlap staat er één keer");
});

Deno.test("koppelSprekers: zonder sprekers (Mistral) alleen de dubbele zin eruit", () => {
  const s = koppelSprekers([
    { volgnummer: 1, begin: 0, duur: 304, segmenten: [{ spreker: null, start: 290, eind: 303, tekst: "We sluiten dit punt af en gaan verder." }] },
    { volgnummer: 2, begin: 300, duur: 60, segmenten: [{ spreker: null, start: 0, eind: 3, tekst: "dit punt af en gaan verder" }, { spreker: null, start: 5, eind: 9, tekst: "Agendapunt vier." }] },
  ], "Abdelkader");
  assertEquals(s.map((x) => x.tekst), ["We sluiten dit punt af en gaan verder.", "Agendapunt vier."]);
  assertEquals(s.every((x) => x.spreker === null), true);
});

Deno.test("noemSprekers: alleen bij een bekende naam, en het label blijft zichtbaar", () => {
  const t = "[0:10] Spreker A: Ik begin.\n[0:20] Spreker B: Goed.\n[0:30] Spreker AB: Ook.";
  const uit = noemSprekers(t, [{ label: "Spreker A", naam: "Jan", rol: "penningmeester" }, { label: "Spreker B", naam: "", rol: "" }]);
  assertEquals(uit, "[0:10] Jan (spreker A): Ik begin.\n[0:20] Spreker B: Goed.\n[0:30] Spreker AB: Ook.");
});

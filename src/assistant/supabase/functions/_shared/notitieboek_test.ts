import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { htmlNaarTekst, toetsLink } from "./pagina.ts";
import { fragmenten, trekAntwoordRecht, vraagContext, zoektermen, type NotitieVoorVraag } from "./vraag.ts";
import { docHtml, gebruikerPrompt, leesLabels, schema, trekRecht } from "./notities.ts";

Deno.test("toetsLink: gewone links mogen, interne adressen en vreemde protocollen niet", () => {
  assert("url" in toetsLink("https://www.henw.org/artikelen/x"));
  assert("url" in toetsLink("http://nhg.org"));
  for (const l of ["ftp://x.nl", "javascript:alert(1)", "http://localhost:54321", "http://127.0.0.1/", "http://10.0.0.5", "http://192.168.1.1",
    "http://172.20.0.1", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://db.internal/", "http://intranet/", "https://u:p@site.nl", "geen link"]) {
    assert("fout" in toetsLink(l), l);
  }
  // 172.32 hoort niet bij het privébereik.
  assert("url" in toetsLink("http://172.32.0.1"));
});

Deno.test("htmlNaarTekst: artikel boven body, zonder menu's en scripts, alinea's blijven", () => {
  const html = `<html><head><title>SGLT2 &amp; nier</title><style>p{}</style></head><body>
<nav><a>Home</a></nav><header>Kop</header>
<article><h1>Kop van het stuk</h1><p>Eerste alinea met <b>nadruk</b>.</p><script>evil()</script><p>Tweede&nbsp;alinea &#8364;12.</p><ul><li>punt een</li></ul></article>
<footer>Cookies</footer></body></html>`;
  const r = htmlNaarTekst(html);
  assertEquals(r.titel, "SGLT2 & nier");
  assertEquals(r.tekst, "Kop van het stuk\nEerste alinea met nadruk .\nTweede alinea €12.\n- punt een");
  const zonder = htmlNaarTekst("<body><nav>menu</nav><p>Alleen body</p><footer>voet</footer></body>");
  assertEquals(zonder.tekst, "Alleen body");
});

Deno.test("zoektermen: stopwoorden eruit, lange woorden gestamd", () => {
  assertEquals(zoektermen("Wat hebben we vorig jaar met de zorggroep afgesproken over de POH-uren?"), ["zorgg", "poh", "uren"]);
});

Deno.test("fragmenten: raakregels met context, gaten gemarkeerd, binnen het maximum", () => {
  const t = ["a", "b", "de zorggroep wil meer", "c", "d", "e", "f", "POH uren naar twaalf", "g"].join("\n");
  assertEquals(fragmenten(t, ["zorgg", "poh"]), "b\nde zorggroep wil meer\nc\n…\nf\nPOH uren naar twaalf\ng");
  assertEquals(fragmenten(t, []), "");
  assert(fragmenten(t, ["zorgg", "poh"], 30).length <= 30);
});

const notitie = (id: string, extra: Partial<NotitieVoorVraag> = {}): NotitieVoorVraag => ({
  id, titel: `Overleg ${id}`, gestart_op: "2026-03-04T10:00:00Z", soort: "vergadering", project: "Zorggroep",
  samenvatting: null, invoer: null, aantekeningen: [], transcript: null, ...extra,
});

Deno.test("vraagContext: genummerd, met project, eigen notitie en transcriptfragment", () => {
  const c = vraagContext([notitie("x", { invoer: "POH-uren nagaan", transcript: "intro\nde POH krijgt twaalf uur\neinde" }), notitie("y")], "POH-uren");
  assertStringIncludes(c, "[1] Overleg x, 4 maart 2026, project Zorggroep");
  assertStringIncludes(c, "Eigen notitie: POH-uren nagaan");
  assertStringIncludes(c, "Uit het transcript:\nintro\nde POH krijgt twaalf uur\neinde");
  assertStringIncludes(c, "[2] Overleg y");
});

Deno.test("trekAntwoordRecht: verzonnen nummers vallen weg, zonder bron geen 'gevonden'", () => {
  const n = [notitie("x"), notitie("y")];
  const a = trekAntwoordRecht({ antwoord: "Twaalf uur [1] [7].", gevonden: true, bronnen: [{ nummer: 1, citaat: "twaalf uur" }, { nummer: 7, citaat: "?" }, { nummer: 1, citaat: "dubbel" }] }, n);
  assertEquals(a.bronnen.map((b) => b.id), ["x"]);
  assert(a.gevonden);
  const b = trekAntwoordRecht({ antwoord: "", gevonden: true, bronnen: [{ nummer: 9, citaat: "" }] }, n);
  assertEquals(b.gevonden, false);
  assertEquals(b.antwoord, "Daar vond ik niets over in je notities.");
});

Deno.test("labels: kleine letters, uniek, hooguit vier, in schema en trekRecht", () => {
  assertEquals(leesLabels(["POH", "#poh", " Financiering ", "", 3, "a", "b", "c"]), ["poh", "financiering", "a", "b"]);
  assert((schema([]).required as string[]).includes("labels"));
  assertEquals(trekRecht({ titel: "t", labels: ["Diabetes"] }, []).labels, ["diabetes"]);
});

Deno.test("snelle notitie: eigen tekst leidend, artikel apart, geen 'Transcript'", () => {
  const p = gebruikerPrompt({ transcript: "Artikeltekst", invoer: "Lezen voor de POH", link: "https://x.nl/a" });
  assertStringIncludes(p, "Wat de eigenaar zelf schreef:\nLezen voor de POH");
  assertStringIncludes(p, "Tekst van het bewaarde artikel (https://x.nl/a):\nArtikeltekst");
  assert(!p.includes("Transcript:"));
  const alleen = gebruikerPrompt({ transcript: "", invoer: "Bellen met Jan" });
  assertEquals(alleen, "Wat de eigenaar zelf schreef:\nBellen met Jan");
  const r = trekRecht({ titel: "Notitie", samenvatting: "s" }, []);
  const d = docHtml({ r, datum: "vandaag", project: null, agendaTitel: null, transcript: "", invoer: "Bellen met Jan", link: "https://x.nl/a" });
  assertStringIncludes(d, "<h2>Mijn notitie</h2><p>Bellen met Jan</p>");
  assert(!d.includes("<h2>Transcript</h2>"));
});

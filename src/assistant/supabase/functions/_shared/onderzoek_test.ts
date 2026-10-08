import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { leesThemas, naarUitkomst, uitwerkPrompt, verkenSchema, uitwerkSchema, antwoordSchema, type Thema } from "./onderzoek.ts";
import { bronnenClaude, citatiesOpenAI, uniekeBronnen, zoekOpWeb } from "./web.ts";

const thema = (v: Partial<Thema> = {}): Thema => ({
  id: "t1", titel: "Lp(a)-verlaging", kern: "", wat_gepresenteerd: "", relevantie: "hoog", waarom: "", soort: "studie",
  bronnen: [{ titel: "ESC", url: "https://www.escardio.org/x" }], gekozen: true, opmerking: "", status: "wacht", notitie_id: null, ...v,
});

Deno.test("leesThemas: id's lopen door, dubbelen en lege titels vallen weg, hoog eerst, alleen http-bronnen", () => {
  const bestaand = [thema({ id: "t3", titel: "SGLT2 bij hartfalen" })];
  const t = leesThemas([
    { titel: "Obesitas en semaglutide", relevantie: "middel", soort: "studie", bronnen: [{ titel: "a", url: "javascript:x" }, { titel: "b", url: "https://nejm.org/y" }] },
    { titel: "sglt2 bij hartfalen", relevantie: "hoog" },
    { titel: "", relevantie: "hoog" },
    { titel: "Lp(a)", relevantie: "hoog", soort: "onzin" },
    { titel: "Beeldvorming", relevantie: "raar" },
  ], bestaand);
  assertEquals(t.map((x) => [x.id, x.titel, x.relevantie]), [["t5", "Lp(a)", "hoog"], ["t4", "Obesitas en semaglutide", "middel"], ["t6", "Beeldvorming", "middel"]]);
  assertEquals(t[1]!.bronnen, [{ titel: "b", url: "https://nejm.org/y" }]);
  assertEquals(t[0]!.soort, "overig");
  assert(t.every((x) => !x.gekozen && x.status === null));
});

Deno.test("naarUitkomst: studies worden presentaties, publicaties worden bronnen voor PubMed, labels kort", () => {
  const r = naarUitkomst({
    titel: "Lp(a) en olpasiran", samenvatting: "Tekst.",
    studies: [{ naam: "OCEAN(a)", opzet: "RCT", populatie: "n=7000", interventie: "olpasiran vs placebo", eindpunten: "MACE", resultaten: ["HR 0,80"], bijzonderheden: "" }],
    relevantie_praktijk: "Nog geen gevolg.", kanttekeningen: ["Agent: gesponsord"], onzeker: ["Lange termijn"], vervolgstappen: ["Bespreken met POH"],
    publicaties: [{ omschrijving: "OCEAN(a)-Outcomes", auteurs: "Nissen", jaar: "2026", tijdschrift: "NEJM", doi: "https://doi.org/10.1056/NEJMoa1", bewering: "MACE daalt" }],
    labels: ["LP(A)", "Lipiden", "x", "y", "z", "te veel"],
  }, thema());
  assertEquals(r.presentaties[0]!.spreker, "OCEAN(a)");
  assertEquals(r.presentaties[0]!.kernboodschappen, ["HR 0,80"]);
  assertEquals(r.presentaties[0]!.onderbouwing, ["Opzet: RCT", "Populatie: n=7000", "Interventie: olpasiran vs placebo", "Eindpunten: MACE"]);
  assertEquals(r.bronnen?.length, 1);
  assertEquals(r.bronnen?.[0]?.doi, "10.1056/nejmoa1");
  assertEquals(r.labels, ["lp(a)", "lipiden", "x", "y", "z"]);
  assertEquals(r.open_vragen, ["Lange termijn"]);
  assertEquals(r.actiepunten, []);
});

Deno.test("schema's zijn strikt: elk object sluit af en noemt al zijn velden verplicht", () => {
  const loop = (s: any, pad: string) => {
    if (s?.type === "object") {
      assertEquals(s.additionalProperties, false, pad);
      assertEquals([...s.required].sort(), Object.keys(s.properties).sort(), pad);
      for (const [k, v] of Object.entries(s.properties)) loop(v, `${pad}.${k}`);
    }
    if (s?.type === "array") loop(s.items, `${pad}[]`);
  };
  loop(verkenSchema, "verken"); loop(uitwerkSchema, "uitwerk"); loop(antwoordSchema, "antwoord");
});

Deno.test("uitwerkPrompt: de opmerking van de eigenaar en de bronnen gaan mee", () => {
  const p = uitwerkPrompt({ onderwerp: "ESC 2026", thema: thema({ opmerking: "Wat met eerste lijn?" }) });
  assertStringIncludes(p.gebruiker, "Wat hij er in het bijzonder over wil weten: Wat met eerste lijn?");
  assertStringIncludes(p.gebruiker, "- ESC: https://www.escardio.org/x");
  assertStringIncludes(p.systeem, "Geen cijfer, geen studie, geen conclusie uit je geheugen");
});

Deno.test("bronnen: citaties van OpenAI en zoekresultaten van Claude, ontdubbeld", () => {
  const o = citatiesOpenAI({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "x", annotations: [{ type: "url_citation", url: "https://a.nl/p?utm=1", title: "A" }] }] }] });
  const c = bronnenClaude([
    { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.nl/p", title: "A2" }, { type: "web_search_result", url: "https://b.nl", title: "B" }] },
    { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "text", text: "t", citations: [{ url: "https://c.nl", title: "C" }] },
  ]);
  assertEquals(uniekeBronnen([...o, ...c, { titel: "x", url: "ftp://d" }]).map((b) => b.titel), ["A", "B", "C"]);
});

Deno.test("zoekOpWeb: OpenAI valt uit, Claude pauzeert en antwoordt dan via het gereedschap", async () => {
  Deno.env.set("OPENAI_API_KEY", "x");
  Deno.env.set("ANTHROPIC_API_KEY", "y");
  Deno.env.delete("WEB_VOLGORDE");
  const orig = globalThis.fetch;
  const verzoeken: any[] = [];
  let claude = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/responses")) return new Response("web search not available", { status: 400 });
    verzoeken.push(JSON.parse(String(init?.body)));
    claude++;
    const inhoud = claude === 1
      ? { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "ESC" } }, { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://escardio.org/a", title: "ESC" }] }] }
      : { stop_reason: "tool_use", content: [{ type: "tool_use", id: "u1", name: "verkenning", input: { overzicht: "o", themas: [] } }] };
    return new Response(JSON.stringify({ ...inhoud, usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const a = await zoekOpWeb({ naam: "verkenning", systeem: "s", gebruiker: "g", schema: verkenSchema, tijd: 30_000 });
    assertEquals(a.ruw, { overzicht: "o", themas: [] });
    assertEquals(a.dienst, "claude");
    assertStringIncludes(a.uitval ?? "", "openai: OpenAI 400");
    assertEquals(a.bronnen, [{ titel: "ESC", url: "https://escardio.org/a" }]);
    assertEquals(a.verbruik, { invoer: 20, uitvoer: 10 });
    // Na de pauze gaat het gesprek terug met de inhoud van de assistent, zonder extra vraag.
    assertEquals(verzoeken[1].messages.length, 2);
    assertEquals(verzoeken[1].messages[1].role, "assistant");
    assertEquals(verzoeken[0].tools[0].type, "web_search_20260209");
    assertEquals(verzoeken[0].tool_choice, { type: "auto" });
  } finally {
    globalThis.fetch = orig;
  }
});

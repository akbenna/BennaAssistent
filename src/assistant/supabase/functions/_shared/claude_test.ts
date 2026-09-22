import { assertEquals } from "jsr:@std/assert@1";
import { triage } from "./claude.ts";

Deno.test("triage parseert JSON en corrigeert ongeldige waarden", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  const orig = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text",
    text: '```json\n{"categorie":"actie","titel":"Bevestig afspraak CZ","toelichting":"Kies een tijd.","samenvatting":"CZ biedt vier tijden.","deadline":"volgende week","prioriteit":"urgent"}\n```' }] }), { status: 200 }));
  try {
    const { triage: t, verbruik } = await triage({ from: "n@cz.nl", subject: "Afspraak", date: new Date(), text: "..." });
    assertEquals(t.categorie, "actie");
    assertEquals(t.deadline, null);
    assertEquals(t.prioriteit, "normaal");
    // Ontbreekt het verbruik in het antwoord, dan worden het nullen en niet NaN;
    // een kostenoverzicht met NaN erin is onbruikbaar.
    assertEquals(verbruik, { invoer: 0, uitvoer: 0 });
  } finally { globalThis.fetch = orig; }
});

import { assertEquals } from "jsr:@std/assert@1";
import { denkInstelling, triage } from "./claude.ts";

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

Deno.test("triage stuurt het snelle model zonder denken en met caching", async () => {
  Deno.env.set("ANTHROPIC_API_KEY", "test");
  Deno.env.delete("CLAUDE_TRIAGE_MODEL");
  const orig = globalThis.fetch;
  let body: any = null;
  globalThis.fetch = (_u: any, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({ content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: '{"categorie":"info","titel":"Lees","toelichting":"-","samenvatting":"-","deadline":null,"prioriteit":"laag"}' },
    ] }), { status: 200 }));
  };
  try {
    const { triage: t } = await triage({ from: "a@b.nl", subject: "x", date: new Date(), text: "..." });
    assertEquals(t.categorie, "info");
    assertEquals(body.model, "claude-haiku-5-5");
    assertEquals(body.thinking, { type: "disabled" });
    assertEquals(body.cache_control, { type: "ephemeral" });
    assertEquals("temperature" in body, false);
  } finally { globalThis.fetch = orig; }
});

Deno.test("denken blijft ongemoeid bij een niet-Haiku-model", () => {
  assertEquals(denkInstelling("claude-sonnet-5-5"), undefined);
  assertEquals(denkInstelling("claude-haiku-4-5-20251001"), { type: "disabled" });
});

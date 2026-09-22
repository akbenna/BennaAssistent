import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HOOFDSTUKKEN, hoofdstukVoor } from "./handleiding";

/* De routes uit App.tsx, uit het bestand zelf gelezen. Zo valt het op zodra er
   een pagina bij komt zonder dat er uitleg bij is geschreven — dat merk je
   anders pas als iemand op het vraagteken drukt en niets vindt. */
function routes(): string[] {
  // Via de werkmap en niet via import.meta.url: vitest serveert de modules
  // over http, en dan is die url geen bestandspad meer.
  const bron = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  return [...bron.matchAll(/<Route path="([^"*]+)"/g)].map((m) => m[1]!);
}

describe("handleiding", () => {
  it("heeft voor elke pagina een hoofdstuk", () => {
    const zonder = routes().filter((r) => !hoofdstukVoor(r));
    expect(zonder).toEqual([]);
  });

  it("verwijst elk hoofdstuk naar een bestaande pagina", () => {
    const bestaand = routes();
    expect(HOOFDSTUKKEN.filter((h) => !bestaand.includes(h.pad))).toEqual([]);
  });

  it("geeft niets terug voor een pad dat niet bestaat", () => {
    expect(hoofdstukVoor("/bestaatniet")).toBeNull();
  });

  it("laat het deelmenu meelezen met Taken", () => {
    expect(hoofdstukVoor("/delen")?.pad).toBe("/taken");
  });

  it("geeft elk hoofdstuk een kern en minstens twee delen", () => {
    for (const h of HOOFDSTUKKEN) {
      expect(h.kern.length, h.titel).toBeGreaterThan(20);
      expect(h.delen.length, h.titel).toBeGreaterThanOrEqual(2);
      for (const d of h.delen) expect(d.tekst.length, `${h.titel} / ${d.kop}`).toBeGreaterThan(0);
    }
  });
});

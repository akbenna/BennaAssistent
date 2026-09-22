import { describe, expect, it } from "vitest";
import { herkenRapport, ontleed } from "./bricks";
import type { Rooster } from "./tabel";

/* De kolomnummers van rapport 05: naam voorop, aantal op 7, man 8, vrouw 9,
   gedeclareerd 10, toegezegd 11, eenheden 12. */
const regel = (naam: string, aantal: number | string, bedrag: number | string): string[] => {
  const r = new Array(13).fill("");
  r[0] = naam; r[7] = String(aantal); r[8] = ""; r[9] = "";
  r[10] = String(bedrag); r[11] = String(bedrag); r[12] = String(aantal);
  return r;
};

const KOP: Rooster = [
  ["Periode: 01-11-2025 t/m 31-01-2026"],
  ["Praktijknummer: 01023456"],
  ["Stand database: 21-09-2026"],
  [],
];

describe("herkennen", () => {
  it("ziet rapport 05 aan de maandkoppen", () => {
    expect(herkenRapport([...KOP, ["Verrichtingen januari"]])).toBe("05");
  });
  it("ziet rapport 09 aan de factuurkolommen", () => {
    expect(herkenRapport([["Factuurnummer", "Factuurdatum", "Van"]])).toBe("09");
  });
  it("ziet rapport 25 aan de medewerkerkolom", () => {
    expect(herkenRapport([["Medewerker"], ["Verrichtingen januari"]])).toBe("25");
  });
  it("geeft niets terug bij een onbekende export", () => {
    expect(herkenRapport([["Willekeurige tabel"], ["a", "b"]])).toBeNull();
  });
});

describe("rapport 05", () => {
  const rooster: Rooster = [
    ...KOP,
    ["Verrichtingen november"],
    regel("11115 Inschrijving verzekerde tot 65 jaar", 2180, "48.240,50"),
    regel("12001 Consult 20 minuten en langer", 420, "16.380,00"),
    ["Totaal", "", "", "", "", "", "", "", "", "", "64.620,50"],
    ["Verrichtingen december"],
    regel("12011 Consult 5 tot 20 minuten", 1180, "23.010,00"),
    ["Verrichtingen januari"],
    regel("12011 Consult 5 tot 20 minuten", 1240, "24.180,00"),
  ];

  it("leest de kopgegevens", () => {
    const o = ontleed(rooster);
    expect(o.rapport).toBe("05");
    expect(o.praktijknummer).toBe("01023456");
    expect(o.periode).toBe("01-11-2025 t/m 31-01-2026");
  });

  it("laat het jaar oplopen zodra de maanden omslaan", () => {
    const o = ontleed(rooster);
    const maanden = [...new Set(o.prestaties.map((p) => p.maand))];
    // November en december horen bij 2025, januari bij 2026: zonder die
    // jaarwissel zou de maandstaat een jaar aan omzet op de verkeerde plek
    // zetten.
    expect(maanden).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
  });

  it("haalt de vijfcijferige code uit de omschrijving", () => {
    const o = ontleed(rooster);
    expect(o.prestaties[0]?.code).toBe("11115");
    expect(o.prestaties[0]?.aantal).toBe(2180);
    expect(o.prestaties[0]?.gedeclareerd).toBe(48240.5);
  });

  it("slaat de totaalregel over", () => {
    const o = ontleed(rooster);
    expect(o.prestaties.some((p) => /totaal/i.test(p.omschrijving))).toBe(false);
    expect(o.prestaties).toHaveLength(4);
  });

  it("meldt het als er niets herkenbaars in staat", () => {
    const o = ontleed([...KOP, ["Verrichtingen januari"], ["losse tekst"]]);
    expect(o.prestaties).toHaveLength(0);
    expect(o.overgeslagen.join(" ")).toMatch(/kolomindeling/);
  });
});

describe("rapport 25", () => {
  it("hangt elke regel aan de medewerker erboven", () => {
    const o = ontleed([
      ["Periode: 01-01-2026 t/m 31-01-2026"],
      ["Medewerker: A. Bennaghmouch"],
      ["Verrichtingen januari"],
      regel("12011 Consult 5 tot 20 minuten", 600, "11.700,00"),
      ["Medewerker: J. Waarnemer"],
      regel("12011 Consult 5 tot 20 minuten", 280, "5.460,00"),
    ], "25");
    expect(o.prestaties.map((p) => p.medewerker)).toEqual(["A. Bennaghmouch", "J. Waarnemer"]);
  });
});

describe("rapport 09", () => {
  /* Kolommen: 0 nummer, 1 datum, 2 van, 4 tot, 5 gedeclareerd, 6 akkoord,
     7 afgeboekt, 8 betaald, 10 uzovi, 11 verzekeraar. */
  const f = (nummer: string, datum: string, bedrag: string): string[] => {
    const r = new Array(12).fill("");
    r[0] = nummer; r[1] = datum; r[2] = "01-01-2026"; r[4] = "31-01-2026";
    r[5] = bedrag; r[6] = bedrag; r[7] = "0"; r[8] = bedrag;
    r[10] = "7119"; r[11] = "CZ";
    return r;
  };

  const rooster: Rooster = [
    ["Factuurnummer", "Factuurdatum vóór de periode"],
    f("2025-0912", "12-12-2025", "1.240,00"),
    ["Factuurnummer", "Factuurdatum in de periode"],
    f("2026-0101", "05-01-2026", "38.420,00"),
    ["Factuurnummer", "Factuurdatum na de periode"],
    f("2026-0204", "04-02-2026", "2.180,00"),
  ];

  it("houdt de drie blokken uit elkaar", () => {
    const o = ontleed(rooster);
    expect(o.rapport).toBe("09");
    expect(o.facturen.map((x) => x.blok)).toEqual([1, 2, 3]);
  });

  it("zet Nederlandse datums om naar ISO", () => {
    const o = ontleed(rooster);
    expect(o.facturen[1]?.factuurdatum).toBe("2026-01-05");
    expect(o.facturen[1]?.gedeclareerd).toBe(38420);
  });

  it("leest een Excel-serienummer als datum", () => {
    // 46027 is 5 januari 2026 in de telling van Excel (nulpunt 30-12-1899,
    // vanwege de schrikkeldagfout die Excel uit Lotus heeft overgenomen).
    const o = ontleed([
      ["Factuurnummer", "Factuurdatum in de periode"],
      f("2026-0101", "46027", "100,00"),
    ]);
    expect(o.facturen[0]?.factuurdatum).toBe("2026-01-05");
  });
});

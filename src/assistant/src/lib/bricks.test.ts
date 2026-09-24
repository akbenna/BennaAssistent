import { describe, expect, it } from "vitest";
import { maakWerkboek } from "../../scripts/maak-proef-xlsx.mjs";
import { herkenRapport, MaandNodig, ontleed } from "./bricks";
import { leesXlsx, type Blad, type Rooster } from "./tabel";

/* De kolomnummers van rapport 05: naam voorop, aantal op 7, man 8, vrouw 9,
   gedeclareerd 10, toegezegd 11, eenheden 12. */
const regel = (naam: string, aantal: number | string, bedrag: number | string): string[] => {
  const r = new Array(13).fill("");
  r[0] = naam; r[7] = String(aantal); r[8] = ""; r[9] = "";
  r[10] = String(bedrag); r[11] = String(bedrag); r[12] = String(aantal);
  return r;
};

/** Eén tabblad, zoals de xlsx-lezer het aanlevert. */
const blad = (rijen: Rooster, naam = "Blad 1"): Blad[] => [{ naam, rijen }];

const KOP: Rooster = [
  ["Periode: 01-11-2025 t/m 31-01-2026"],
  ["Praktijknummer: 01023456"],
  ["Stand database: 21-09-2026"],
  [],
];

describe("herkennen", () => {
  it("ziet rapport 05 aan de maandkoppen", () => {
    expect(herkenRapport(blad([...KOP, ["Verrichtingen januari"]]))?.rapport).toBe("05");
  });
  it("ziet rapport 09 aan de factuurkolommen", () => {
    expect(herkenRapport(blad([["Factuurnummer", "Factuurdatum", "Van"]]))?.rapport).toBe("09");
  });
  it("ziet de blokvorm van rapport 25 aan de behandelaarregel", () => {
    expect(herkenRapport(blad([["Verrichtingen behandelaar A. Bennaghmouch"], ["Verrichtingen januari"]])))
      .toEqual({ rapport: "25", vorm: "blokken" });
  });
  it("ziet de platte vorm van rapport 25 aan de koprij", () => {
    expect(herkenRapport(blad([["Gebruikersnaam", "Naam", "EIM-code", "Verrichting", "Aantal", "Bedrag"]])))
      .toEqual({ rapport: "25", vorm: "plat" });
  });
  /* De platte tabel draagt ook het woord "verrichting". Wordt die na de maandkop
     gewogen, dan leest een medewerkersbestand zich voor als een rapport 05 en
     belandt alles zonder naam in de maandstaat. */
  it("houdt een platte 25 met maandnamen erin uit de handen van 05", () => {
    const rijen: Rooster = [
      ["Gebruikersnaam", "Naam", "EIM-code", "Verrichting", "Aantal", "Bedrag"],
      ["abenna", "A. Bennaghmouch", "12011", "Verrichtingen januari", "600", "11700,00"],
    ];
    expect(herkenRapport(blad(rijen))).toEqual({ rapport: "25", vorm: "plat" });
  });
  it("geeft niets terug bij een onbekende export", () => {
    expect(herkenRapport(blad([["Willekeurige tabel"], ["a", "b"]]))).toBeNull();
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
    const o = ontleed(blad(rooster));
    expect(o.rapport).toBe("05");
    expect(o.praktijknummer).toBe("01023456");
    expect(o.periode).toBe("01-11-2025 t/m 31-01-2026");
  });

  it("laat het jaar oplopen zodra de maanden omslaan", () => {
    const o = ontleed(blad(rooster));
    const maanden = [...new Set(o.prestaties.map((p) => p.maand))];
    // November en december horen bij 2025, januari bij 2026: zonder die
    // jaarwissel zou de maandstaat een jaar aan omzet op de verkeerde plek
    // zetten.
    expect(maanden).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
  });

  it("haalt de code uit de omschrijving", () => {
    const o = ontleed(blad(rooster));
    expect(o.prestaties[0]?.code).toBe("11115");
    expect(o.prestaties[0]?.aantal).toBe(2180);
    expect(o.prestaties[0]?.gedeclareerd).toBe(48240.5);
  });

  it("slaat de totaalregel over", () => {
    const o = ontleed(blad(rooster));
    expect(o.prestaties.some((p) => /totaal/i.test(p.omschrijving))).toBe(false);
    expect(o.prestaties).toHaveLength(4);
  });

  /* Na "Totaal" is het maandblok dicht. Telt wat daarna komt toch bij de vorige
     maand mee, dan staat er omzet in een maand die het rapport niet noemt. */
  it("telt niets meer bij de maand op zodra het blok is afgesloten", () => {
    const o = ontleed(blad([
      ...KOP,
      ["Verrichtingen november"],
      regel("12011 Consult 5 tot 20 minuten", 100, "1.950,00"),
      ["Totaal"],
      regel("12011 Consult 5 tot 20 minuten", 999, "19.500,00"),
    ]));
    expect(o.prestaties).toHaveLength(1);
  });

  /* De koprij draagt de kolomnamen. Schuift de export op, dan moeten die
     meeschuiven; op vaste posities blijven staan levert stil verkeerde
     bedragen op. */
  it("volgt de kolommen van de koprij als die zijn opgeschoven", () => {
    const koprij = new Array(15).fill("");
    koprij[0] = "Verrichtingen november";
    koprij[9] = "Aantal"; koprij[12] = "Gedeclareerd";
    const rij = new Array(15).fill("");
    rij[0] = "12011 Consult 5 tot 20 minuten"; rij[9] = "1180"; rij[12] = "23.010,00";
    const o = ontleed(blad([...KOP, koprij, rij]));
    expect(o.prestaties[0]?.aantal).toBe(1180);
    expect(o.prestaties[0]?.gedeclareerd).toBe(23010);
  });

  it("meldt het als er niets herkenbaars in staat", () => {
    const o = ontleed(blad([...KOP, ["Verrichtingen januari"], ["losse tekst"]]));
    expect(o.prestaties).toHaveLength(0);
    expect(o.overgeslagen.join(" ")).toMatch(/kolomindeling/);
  });
});

describe("rapport 25, blokken per behandelaar", () => {
  it("hangt elke regel aan de behandelaar erboven", () => {
    const o = ontleed(blad([
      ["Periode: 01-01-2026 t/m 31-01-2026"],
      ["Verrichtingen behandelaar A. Bennaghmouch"],
      ["Verrichtingen januari"],
      regel("12011 Consult 5 tot 20 minuten", 600, "11.700,00"),
      ["Verrichtingen behandelaar J. Waarnemer"],
      ["Verrichtingen januari"],
      regel("12011 Consult 5 tot 20 minuten", 280, "5.460,00"),
    ]), { gedwongen: "25" });
    expect(o.prestaties.map((p) => p.medewerker)).toEqual(["A. Bennaghmouch", "J. Waarnemer"]);
  });

  /* Bricks zet elke behandelaar op een eigen tabblad. Werd alleen het eerste
     blad gelezen, dan verdween de rest van de praktijk zonder melding. */
  it("leest alle tabbladen en neemt de tabbladnaam als er geen kop staat", () => {
    const o = ontleed([
      { naam: "A. Bennaghmouch", rijen: [
        ["Periode: 01-01-2026 t/m 31-01-2026"],
        ["Verrichtingen januari"],
        regel("12011 Consult 5 tot 20 minuten", 600, "11.700,00"),
      ] },
      { naam: "J. Waarnemer", rijen: [
        ["Verrichtingen januari"],
        regel("12011 Consult 5 tot 20 minuten", 280, "5.460,00"),
      ] },
    ], { gedwongen: "25" });
    expect(o.prestaties.map((p) => p.medewerker)).toEqual(["A. Bennaghmouch", "J. Waarnemer"]);
    // Het tweede blad draagt zelf geen jaartal en erft dat van het eerste.
    expect(o.prestaties.map((p) => p.maand)).toEqual(["2026-01-01", "2026-01-01"]);
  });

  /* Een 25-regel zonder naam telt in de maandstaat mee alsof hij uit rapport 05
     kwam, en dus alles dubbel. Dat mag niet stil gebeuren. */
  it("weigert een rapport 25 waarin geen enkele behandelaar te vinden is", () => {
    expect(() => ontleed(blad([
      ["Periode: 01-01-2026 t/m 31-01-2026"],
      ["Verrichtingen januari"],
      regel("12011 Consult 5 tot 20 minuten", 600, "11.700,00"),
    ], "Blad 1"), { gedwongen: "25" })).toThrow(/dubbel/);
  });
});

describe("rapport 25, platte tabel", () => {
  const rijen: Rooster = [
    ["Gebruikersnaam", "Naam", "EIM-code", "Verrichting", "Aantal", "Bedrag"],
    ["abenna", "A. Bennaghmouch", "12011", "Consult 5 tot 20 minuten", "600", "11700,00"],
    ["", "J. Waarnemer", "12011", "Consult 5 tot 20 minuten", "280", "5460,00"],
    ["", "", "12011", "Consult 5 tot 20 minuten", "12", "234,00"],
    ["", "Totalen", "", "", "892", "17394,00"],
  ];

  /* Bricks kan dit rapport niet per maand groeperen en zet de periode nergens
     in het bestand. Raden zou stil de verkeerde maand vullen. */
  it("vraagt om een maand in plaats van er een te verzinnen", () => {
    expect(() => ontleed(blad(rijen))).toThrow(MaandNodig);
  });

  it("leest medewerker, code, aantal en bedrag op de gekozen maand", () => {
    const o = ontleed(blad(rijen), { maand: "2026-01-01" });
    expect(o.prestaties).toHaveLength(2);
    expect(o.prestaties[0]).toMatchObject({
      maand: "2026-01-01", medewerker: "A. Bennaghmouch", code: "12011",
      aantal: 600, gedeclareerd: 11700,
    });
    // Zorg via de waarneemregistratie staat er zonder inlog maar mét naam in.
    expect(o.prestaties[1]?.medewerker).toBe("J. Waarnemer");
  });

  it("slaat regels zonder medewerker over en zegt hoeveel", () => {
    const o = ontleed(blad(rijen), { maand: "2026-01-01" });
    expect(o.overgeslagen.join(" ")).toMatch(/1 regels dragen geen medewerker/);
  });

  it("zegt erbij dat de maand een keuze is en niet uit het bestand komt", () => {
    const o = ontleed(blad(rijen), { maand: "2026-01-01" });
    expect(o.overgeslagen.join(" ")).toMatch(/geen periode in het bestand/);
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
    const o = ontleed(blad(rooster));
    expect(o.rapport).toBe("09");
    expect(o.facturen.map((x) => x.blok)).toEqual([1, 2, 3]);
  });

  it("zet Nederlandse datums om naar ISO", () => {
    const o = ontleed(blad(rooster));
    expect(o.facturen[1]?.factuurdatum).toBe("2026-01-05");
    expect(o.facturen[1]?.gedeclareerd).toBe(38420);
  });

  it("leest een Excel-serienummer als datum", () => {
    // 46027 is 5 januari 2026 in de telling van Excel (nulpunt 30-12-1899,
    // vanwege de schrikkeldagfout die Excel uit Lotus heeft overgenomen).
    const o = ontleed(blad([
      ["Factuurnummer", "Factuurdatum in de periode"],
      f("2026-0101", "46027", "100,00"),
    ]));
    expect(o.facturen[0]?.factuurdatum).toBe("2026-01-05");
  });

  /* VIPLive vult Afgeboekt en Betaald alleen als je in VIPLive afboekt. Het
     Roosendael doet dat niet, dus die kolommen horen leeg te zijn; staat er
     toch iets, dan is dat het vermelden waard voordat er conclusies aan hangen. */
  it("meldt het als er toch bedragen in Betaald of Afgeboekt staan", () => {
    const o = ontleed(blad(rooster));
    expect(o.overgeslagen.join(" ")).toMatch(/Betaald of Afgeboekt/);
  });

  /* De echte export zet de bloktitel op een eigen regel en de kolomnamen op de
     volgende. Beide vormen moeten werken. */
  it("leest de kolomnamen ook als ze op een eigen rij staan", () => {
    const rij = new Array(14).fill("");
    rij[0] = "20260101"; rij[3] = "05-01-2026"; rij[9] = "38.420,00"; rij[13] = "CZ";
    const o = ontleed(blad([
      ["Facturen met factuurdatum in 2026"],
      ["Factuurnummer", "", "", "Factuurdatum", "Periode", "", "", "", "", "Gedeclareerd", "", "", "", "Verzekeraar"],
      rij,
    ]));
    expect(o.facturen).toHaveLength(1);
    expect(o.facturen[0]?.factuurdatum).toBe("2026-01-05");
    expect(o.facturen[0]?.gedeclareerd).toBe(38420);
    expect(o.facturen[0]?.verzekeraar).toBe("CZ");
  });
});

/* Van bytes tot regels, door de echte lezer heen. De losse proeven hierboven
   voeren een rooster rechtstreeks in; hier komt het bestand eerst als zip
   binnen, zoals het uit Bricks komt. Dat is de enige manier om te zien of de
   twee stukken op elkaar aansluiten. */
describe("van bestand tot ontleding", () => {
  const alsBestand = (bytes: Uint8Array, naam: string) =>
    new File([new Uint8Array(bytes).buffer as ArrayBuffer], naam);

  it("leest een platte 25 uit een echt xlsx-bestand", async () => {
    const bestand = maakWerkboek([{ naam: "Verrichtingen", rijen: [
      ["Gebruikersnaam", "Naam", "EIM-code", "Verrichting", "Aantal", "Bedrag"],
      ["abenna", "A. Bennaghmouch", "12011", "Consult 5 tot 20 minuten", 600, 11700],
    ] }]);
    const bladen = await leesXlsx(alsBestand(bestand, "verrichtingen.xlsx"));
    expect(herkenRapport(bladen)).toEqual({ rapport: "25", vorm: "plat" });
    const o = ontleed(bladen, { maand: "2026-08-01" });
    expect(o.prestaties).toEqual([expect.objectContaining({
      maand: "2026-08-01", medewerker: "A. Bennaghmouch", code: "12011",
      aantal: 600, gedeclareerd: 11700,
    })]);
  });

  it("leest een 25 met een tabblad per behandelaar uit een echt xlsx-bestand", async () => {
    const maand = (aantal: number, bedrag: number) => {
      const r: Array<string | number> = new Array(13).fill("");
      r[0] = "12011 Consult 5 tot 20 minuten"; r[7] = aantal; r[10] = bedrag;
      return r;
    };
    const bestand = maakWerkboek([
      { naam: "A. Bennaghmouch", rijen: [
        ["Periode: 01-08-2026 t/m 31-08-2026"],
        ["Verrichtingen behandelaar A. Bennaghmouch"],
        ["Verrichtingen augustus"], maand(600, 11700),
      ] },
      { naam: "J. Waarnemer", rijen: [
        ["Verrichtingen behandelaar J. Waarnemer"],
        ["Verrichtingen augustus"], maand(280, 5460),
      ] },
    ]);
    const bladen = await leesXlsx(alsBestand(bestand, "0025.xlsx"));
    const o = ontleed(bladen);
    expect(o.rapport).toBe("25");
    expect(o.prestaties.map((p) => [p.medewerker, p.maand, p.gedeclareerd]))
      .toEqual([["A. Bennaghmouch", "2026-08-01", 11700], ["J. Waarnemer", "2026-08-01", 5460]]);
  });
});

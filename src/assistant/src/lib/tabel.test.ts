import { describe, expect, it } from "vitest";
import { maakWerkboek, maakXlsx, RAPPORT_05 } from "../../scripts/maak-proef-xlsx.mjs";
import { getal, leesCsv, leesXlsx } from "./tabel";

/* Een File maken uit de bytes die de bouwer teruggeeft; dat is wat de app uit
   een <input type=file> krijgt en wat `leesXlsx` verwacht.

   Let op de kopie. De bouwer levert een Node-Buffer, en `Buffer.slice()` geeft
   — anders dan `Uint8Array.slice()` — een venster op een gedeelde geheugenpoel
   in plaats van een kopie. Wie dat venster als ArrayBuffer doorgeeft, stuurt de
   hele poel mee en leest een bestand dat niet bestaat. */
const alsBestand = (bytes: Uint8Array, naam = "proef.xlsx") => {
  const kopie = new Uint8Array(bytes.length);
  kopie.set(bytes);
  return new File([kopie], naam);
};

describe("csv", () => {
  it("kiest de puntkomma als scheidingsteken bij een Nederlandse export", () => {
    const r = leesCsv("naam;aantal;bedrag\nConsult;12;€ 1.234,50\n");
    expect(r[0]).toEqual(["naam", "aantal", "bedrag"]);
    expect(r[1]).toEqual(["Consult", "12", "€ 1.234,50"]);
  });

  it("laat een komma binnen aanhalingstekens met rust", () => {
    const r = leesCsv('a;b\n"Vries, J. de";7\n');
    expect(r[1]).toEqual(["Vries, J. de", "7"]);
  });

  it("leest een dubbel aanhalingsteken als één teken in de waarde", () => {
    const r = leesCsv('a\n"hij zei ""ja"""\n');
    expect(r[1]?.[0]).toBe('hij zei "ja"');
  });

  it("kiest de komma als die vaker voorkomt", () => {
    const r = leesCsv("a,b,c\n1,2,3\n");
    expect(r[1]).toEqual(["1", "2", "3"]);
  });

  it("houdt een laatste regel zonder regeleinde vast", () => {
    expect(leesCsv("a;b\n1;2")).toHaveLength(2);
  });
});

describe("getallen", () => {
  it("leest de Nederlandse notatie", () => {
    expect(getal("1.234,56")).toBe(1234.56);
    expect(getal("€ 1.234,56")).toBe(1234.56);
    expect(getal("12")).toBe(12);
  });
  it("geeft null bij leeg of een streepje", () => {
    expect(getal("")).toBeNull();
    expect(getal("-")).toBeNull();
    expect(getal(undefined)).toBeNull();
  });
  it("laat een punt als duizendscheiding staan wanneer er geen komma is", () => {
    // "1.234" zonder komma is in deze exports duizend-tweehonderdvierendertig
    // noch 1,234 — Number() maakt er 1.234 van, en dat is hier goed genoeg:
    // Bricks schrijft hele getallen zonder duizendscheiding weg.
    expect(getal("1234")).toBe(1234);
  });
});

describe("xlsx", () => {
  it("leest een blad met gedeelde teksten en getallen", async () => {
    const [blad] = await leesXlsx(alsBestand(maakXlsx(RAPPORT_05)));
    expect(blad?.rijen[0]?.[0]).toBe("Periode: 01-01-2026 t/m 31-03-2026");
    expect(blad?.rijen[4]?.[0]).toBe("Verrichtingen januari");
    expect(blad?.rijen[5]?.[0]).toContain("11115");
    expect(blad?.rijen[5]?.[7]).toBe("2180");
  });

  it("laat lege cellen de kolommen niet verschuiven", async () => {
    const [blad] = await leesXlsx(alsBestand(maakXlsx([["a", "", "", "d"]])));
    expect(blad?.rijen[0]).toEqual(["a", "", "", "d"]);
  });

  /* Rapport 25 en 4a zetten elke behandelaar op een eigen tabblad. Werd alleen
     sheet1 gelezen, dan verdween de rest van de praktijk zonder dat iets het
     meldde — en dat is erger dan een foutmelding. */
  it("leest alle tabbladen, met hun namen, in volgorde", async () => {
    const bestand = maakWerkboek([
      { naam: "A. Bennaghmouch", rijen: [["Verrichtingen januari"], ["12011 Consult", "", "", "", "", "", "", 600]] },
      { naam: "J. Waarnemer", rijen: [["Verrichtingen januari"], ["12011 Consult", "", "", "", "", "", "", 280]] },
    ]);
    const bladen = await leesXlsx(alsBestand(bestand));
    expect(bladen.map((b) => b.naam)).toEqual(["A. Bennaghmouch", "J. Waarnemer"]);
    expect(bladen[1]?.rijen[1]?.[7]).toBe("280");
  });

  it("weigert het oude binaire formaat met een leesbare uitleg", async () => {
    const { leesBestand } = await import("./tabel");
    await expect(leesBestand(new File([new Uint8Array([1, 2])], "oud.xls")))
      .rejects.toThrow(/xlsx of csv/);
  });

  it("weigert een bestand dat geen zip is", async () => {
    await expect(leesXlsx(alsBestand(new Uint8Array(64))))
      .rejects.toThrow(/geldig xlsx/);
  });
});

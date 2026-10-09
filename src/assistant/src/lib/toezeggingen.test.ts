import { describe, expect, it } from "vitest";
import { openToezeggingen, type NotitieMetActies } from "./toezeggingen";
import type { Actiepunt, Verslag } from "../types/db";

const notitie = (id: string, datum: string, acties: Actiepunt[]): NotitieMetActies => ({
  id, titel: `Overleg ${id}`, gestart_op: datum,
  samenvatting: { titel: "", project: "", samenvatting: "", deelnemers: [], besluiten: [], actiepunten: acties, afspraken: [], open_vragen: [], mijn_vervolgstappen: [] } as Verslag,
});
const actie = (wie: string, wat: string, v: Partial<Actiepunt> = {}): Actiepunt => ({ wie, wat, deadline: "", van_mij: false, ...v });

describe("toezeggingen van anderen", () => {
  const nu = new Date("2026-10-09T10:00:00Z");
  const groepen = openToezeggingen([
    notitie("a", "2026-09-01T10:00:00Z", [
      actie("Jan", "Begroting sturen", { deadline: "2026-10-20" }),
      actie("Ik", "Zelf bellen", { van_mij: true }),
      actie("Petra", "Notulen rondsturen", { afgehandeld: true }),
    ]),
    notitie("b", "2026-10-01T10:00:00Z", [
      actie("Petra", "Offerte opvragen", { deadline: "2026-10-05" }),
      actie("Jan", "Zaal reserveren"),
      actie("", "Iemand moet dit doen"),
    ]),
  ], nu);

  it("laat eigen en afgevinkte actiepunten weg", () => {
    const alle = groepen.flatMap((g) => g.lijst.map((t) => t.actie.wat));
    expect(alle).not.toContain("Zelf bellen");
    expect(alle).not.toContain("Notulen rondsturen");
  });
  it("zet wie iets verlopen heeft bovenaan, met negatieve dagen", () => {
    expect(groepen[0]!.wie).toBe("Petra");
    expect(groepen[0]!.lijst[0]!.dagenTot).toBe(-4);
  });
  it("sorteert binnen een persoon op deadline, zonder deadline achteraan", () => {
    const jan = groepen.find((g) => g.wie === "Jan")!;
    expect(jan.lijst.map((t) => t.actie.wat)).toEqual(["Begroting sturen", "Zaal reserveren"]);
    expect(jan.lijst[0]!.index).toBe(0);
  });
  it("een toezegging zonder naam valt onder Onbekend", () => {
    expect(groepen.some((g) => g.wie === "Onbekend")).toBe(true);
  });
});

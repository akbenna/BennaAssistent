import { describe, expect, it } from "vitest";
import { maakVoorbereiding, projectVoorAfspraak, type VorigeNotitie } from "./voorbereiding";
import type { TaakRij, Verslag } from "../types/db";

const projecten = [
  { id: "p1", naam: "Bestuur HAGRO", trefwoorden: ["ALV", "hagro"] },
  { id: "p2", naam: "Zorggroep", trefwoorden: ["CVRM"] },
];

describe("welk project bij een afspraak hoort", () => {
  it("vindt de projectnaam in de titel, ook met andere hoofdletters", () => {
    expect(projectVoorAfspraak(projecten, "Overleg bestuur hagro (kwartaal)")?.id).toBe("p1");
  });
  it("valt terug op een trefwoord", () => {
    expect(projectVoorAfspraak(projecten, "Werkgroep CVRM")?.id).toBe("p2");
  });
  it("laat een kort trefwoord niet midden in een ander woord vallen", () => {
    expect(projectVoorAfspraak(projecten, "Lunch bij Calvijn")).toBeNull();
  });
  it("geeft niets als er niets past", () => {
    expect(projectVoorAfspraak(projecten, "Tandarts")).toBeNull();
  });
});

const verslag = (v: Partial<Verslag>): Verslag => ({
  titel: "", project: "", samenvatting: "", deelnemers: [], besluiten: [], actiepunten: [],
  afspraken: [], open_vragen: [], mijn_vervolgstappen: [], ...v,
});
const notitie = (id: string, datum: string, v: Partial<Verslag>): VorigeNotitie =>
  ({ id, titel: `Overleg ${id}`, gestart_op: datum, samenvatting: verslag(v), item_id: `i${id}` });
const taak = (id: string, status: TaakRij["status"]): TaakRij =>
  ({ id, titel: `taak ${id}`, status } as TaakRij);

describe("de voorbereiding", () => {
  const notities = [
    notitie("oud", "2026-09-01T10:00:00Z", { besluiten: ["oud besluit"], open_vragen: ["Begroting rond?"], mijn_vervolgstappen: ["Accountant bellen"] }),
    notitie("nieuw", "2026-10-01T10:00:00Z", { besluiten: ["nieuw besluit"], open_vragen: ["begroting rond?", "Wie zit de ALV voor?"] }),
  ];
  const v = maakVoorbereiding(notities, [taak("a", "open"), taak("b", "afgerond"), taak("a", "open"), taak("c", "voorstel")]);

  it("neemt het laatste overleg als vorige keer, ongeacht de volgorde", () => {
    expect(v.vorige?.id).toBe("nieuw");
    expect(v.aantalNotities).toBe(2);
  });
  it("haalt besluiten alleen uit het laatste overleg", () => {
    expect(v.besluiten).toEqual(["nieuw besluit"]);
  });
  it("stapelt open vragen op, elk één keer, nieuwste eerst", () => {
    expect(v.open_vragen).toEqual(["begroting rond?", "Wie zit de ALV voor?"]);
    expect(v.mijn_vervolgstappen).toEqual(["Accountant bellen"]);
  });
  it("toont alleen taken die nog niet af zijn, zonder dubbelen", () => {
    expect(v.taken.map((t) => t.id)).toEqual(["a", "c"]);
  });
  it("zonder notities is er geen vorige keer", () => {
    expect(maakVoorbereiding([], []).vorige).toBeNull();
  });
});

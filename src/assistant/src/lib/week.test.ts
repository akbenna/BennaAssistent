import { describe, expect, it } from "vitest";
import { metActueleDeadlines, weekVan } from "./week";
import type { Weekoverzicht } from "../types/db";

const taak = (titel: string, deadline: string) =>
  ({ id: titel, titel, deadline, prioriteit: "normaal", status: "open" }) as const;

describe("weekVan", () => {
  it("geeft maandag en zondag, ook als de datum zelf op zondag valt", () => {
    expect(weekVan("2026-09-27")).toEqual({ maandag: "2026-09-21", zondag: "2026-09-27" });
    expect(weekVan("2026-09-21")).toEqual({ maandag: "2026-09-21", zondag: "2026-09-27" });
  });
});

describe("metActueleDeadlines", () => {
  const week = { maandag: "2026-09-21", zondag: "2026-09-27" };
  const opname: Weekoverzicht = {
    ...week,
    deadlines: [taak("Al afgerond", "2026-09-23")],
    onderhoud: [{ titel: "No-show-analyse", link: null, wanneer: "2026-09-25" }],
    stille_projecten: [{ naam: "Wetenschap" }],
  };

  it("vervangt de deadlines uit maandag door die van nu en laat de rest staan", () => {
    const uit = metActueleDeadlines(opname, week, [taak("Statuten", "2026-09-27")]);
    expect(uit.deadlines?.map((t) => t.titel)).toEqual(["Statuten"]);
    expect(uit.stille_projecten).toEqual([{ naam: "Wetenschap" }]);
    expect(uit.onderhoud).toHaveLength(1);
  });

  it("toont onderhoudstaken niet twee keer", () => {
    const uit = metActueleDeadlines(opname, week, [taak("No-show-analyse", "2026-09-25"), taak("Statuten", "2026-09-27")]);
    expect(uit.deadlines?.map((t) => t.titel)).toEqual(["Statuten"]);
  });

  it("toont de deadlines ook als er nog geen weekoverzicht is gemaakt", () => {
    const uit = metActueleDeadlines(null, week, [taak("Statuten", "2026-09-27")]);
    expect(uit.maandag).toBe("2026-09-21");
    expect(uit.deadlines).toHaveLength(1);
  });
});

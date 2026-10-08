import { describe, expect, it } from "vitest";
import { bronOordelen, naarCsv, totalen } from "./nascholing";
import type { NascholingRegel } from "../types/db";

const regel = (v: Partial<NascholingRegel>): NascholingRegel => ({
  id: "x", titel: "NHG-congres", gestart_op: "2026-03-12T08:00:00Z", duur_sec: 5400, status: "goedgekeurd",
  nascholing_punten: null, nascholing_organisator: null, verdieping: null, labels: [], samenvatting: null, ...v,
});

describe("het nascholingslogboek", () => {
  it("telt uren uit de opname en punten zoals ingevuld", () => {
    const t = totalen([regel({ nascholing_punten: 4 }), regel({ duur_sec: 1800, nascholing_punten: 1.5 }), regel({ duur_sec: null })]);
    expect(t).toEqual({ aantal: 3, uren: 2, punten: 5.5, zonderPunten: 1 });
  });

  it("vat de oordelen over de bronnen samen, in vaste volgorde", () => {
    const b = (oordeel: "bevestigd" | "afwijkend") => ({ herkomst: "", bewering: "", gevonden: true, citaat: "", bevindingen: "", oordeel, toelichting: "", gegevens: null });
    expect(bronOordelen(regel({ verdieping: { bronnen: [b("afwijkend"), b("bevestigd"), b("bevestigd")], duiding: "", dienst: "" } as NascholingRegel["verdieping"] })))
      .toBe("2 bevestigd, 1 afwijkend");
    expect(bronOordelen(regel({}))).toBe("");
  });

  it("schrijft een CSV die Excel in het Nederlands opent, zonder formules", () => {
    const csv = naarCsv([regel({ titel: "Diabetes; nieuw", nascholing_punten: 2.5, nascholing_organisator: "=HYPERLINK(\"x\")" })]);
    expect(csv.startsWith("﻿Datum;Titel;")).toBe(true);
    const rij = csv.split("\r\n")[1]!;
    expect(rij).toBe(`2026-03-12;"Diabetes; nieuw";"'=HYPERLINK(""x"")";1,5;2,5;;;`);
  });
});

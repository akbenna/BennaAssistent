import { describe, expect, it } from "vitest";
import { regelBij } from "./transcript";

const T = "[0:00] Abdelkader: Welkom.\n[1:10] Spreker 1A: De SELECT-studie.\n[1:02:03] Spreker 3B: Tot slot.";

describe("de regel bij een gemarkeerd moment", () => {
  it("is de laatste regel die op of vóór dat moment begint", () => {
    expect(regelBij(T, 75)).toBe("[1:10] Spreker 1A: De SELECT-studie.");
    expect(regelBij(T, 70)).toBe("[1:10] Spreker 1A: De SELECT-studie.");
    expect(regelBij(T, 69)).toBe("[0:00] Abdelkader: Welkom.");
  });

  it("leest ook uren", () => {
    expect(regelBij(T, 3800)).toBe("[1:02:03] Spreker 3B: Tot slot.");
  });
});

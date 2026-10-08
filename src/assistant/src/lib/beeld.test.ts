import { describe, expect, it } from "vitest";
import { nieuweMaat } from "./beeld";

describe("een foto verkleinen", () => {
  it("houdt de verhouding en de lange zijde op tweeduizend", () => {
    expect(nieuweMaat(4032, 3024)).toEqual({ breed: 2000, hoog: 1500 });
    expect(nieuweMaat(3024, 4032)).toEqual({ breed: 1500, hoog: 2000 });
  });

  it("vergroot nooit een kleine foto", () => {
    expect(nieuweMaat(1280, 720)).toEqual({ breed: 1280, hoog: 720 });
  });
});

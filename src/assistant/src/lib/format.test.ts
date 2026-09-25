import { describe, expect, it } from "vitest";
import { linksUit } from "./format";

describe("linksUit", () => {
  it("vindt de adressen in een toelichting, zonder dubbelen en leestekens", () => {
    const tekst = "Zie https://hetroosendael.nl/opslagwijken-check-2027. En nog eens "
      + "(https://hetroosendael.nl/opslagwijken-check-2027)\n\nLinks:\n"
      + "https://docs.google.com/document/d/abc/edit\nhttps://www.cz.nl/zorgaanbieder/contact";
    expect(linksUit(tekst)).toEqual([
      { url: "https://hetroosendael.nl/opslagwijken-check-2027", label: "hetroosendael.nl/opslagwijken-check-2027" },
      { url: "https://docs.google.com/document/d/abc/edit", label: "Google-document" },
      { url: "https://www.cz.nl/zorgaanbieder/contact", label: "cz.nl/zorgaanbieder/contact" },
    ]);
  });

  it("geeft niets terug bij lege tekst of tekst zonder adres", () => {
    expect(linksUit(null)).toEqual([]);
    expect(linksUit("Bel de zorginkoper.")).toEqual([]);
  });
});

/**
 * DE BRICKS-RAPPORTEN ONTLEDEN
 *
 * Drie rapporten, twee grondslagen:
 *
 *   05  Overzicht gedeclareerde prestaties per maand   prestatiebasis
 *   25  Gedetailleerde declaratie per medewerker       prestatiebasis
 *   09  Totaal overzicht facturen (VIPLive)            factuurbasis
 *
 * Rapport 05 zegt wanneer de zorg is geleverd, rapport 09 wanneer de factuur is
 * gemaakt. Dat zijn twee verschillende vragen, en wie ze optelt krijgt een
 * antwoord op geen van beide. Ze landen daarom in aparte tabellen.
 *
 * De kolomposities hieronder komen uit de gedocumenteerde structuur van deze
 * rapporten. Wijzigt Bricks zijn export, dan schuift alles op; vandaar dat de
 * importpagina laat zien wat er is herkend voordat er iets wordt weggeschreven.
 */

import { getal, type Rooster } from "./tabel";

export type Rapport = "05" | "09" | "25";

export interface PrestatieRegel {
  maand: string; // YYYY-MM-01
  code: string | null;
  omschrijving: string;
  aantal: number | null;
  man: number | null;
  vrouw: number | null;
  gedeclareerd: number | null;
  toegezegd: number | null;
  eenheden: number | null;
  medewerker: string | null;
}

export interface FactuurRegel {
  blok: 1 | 2 | 3;
  factuurnummer: string;
  factuurdatum: string | null;
  behandeling_van: string | null;
  behandeling_tot: string | null;
  gedeclareerd: number | null;
  akkoord: number | null;
  afgeboekt: number | null;
  betaald: number | null;
  uzovi: string | null;
  verzekeraar: string | null;
}

export interface Ontleding {
  rapport: Rapport;
  praktijknummer: string | null;
  periode: string | null;
  standDatabase: string | null;
  prestaties: PrestatieRegel[];
  facturen: FactuurRegel[];
  /** Wat er is overgeslagen en waarom. Zichtbaar op het scherm vóór het opslaan. */
  overgeslagen: string[];
}

const MAANDEN = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

const schoon = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** Een verrichtingcode is vijf cijfers; hij staat vooraan of los in de naam. */
function codeUit(naam: string): string | null {
  return naam.match(/\b(\d{5})\b/)?.[1] ?? null;
}

/**
 * Datums komen in drie gedaanten binnen: Nederlands (31-12-2025), ISO, of als
 * Excel-serienummer, want een datumcel draagt in xlsx gewoon een getal. Het
 * nulpunt van Excel is 30 december 1899 vanwege de schrikkeldagfout uit 1900.
 */
function datum(waarde: string | undefined): string | null {
  const s = schoon(waarde);
  if (!s) return null;

  const nl = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (nl) return `${nl[3]}-${nl[2]!.padStart(2, "0")}-${nl[1]!.padStart(2, "0")}`;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0]!;

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function jaarUitPeriode(rooster: Rooster): number {
  for (const rij of rooster.slice(0, 6)) {
    const m = rij.join(" ").match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

/** De metaregels staan bovenaan en dragen hun label in de eerste cel. */
function meta(rooster: Rooster, woord: string): string | null {
  for (const rij of rooster.slice(0, 8)) {
    const regel = rij.join(" ");
    if (regel.toLowerCase().includes(woord)) {
      const rest = regel.split(/[:]/).slice(1).join(":");
      return schoon(rest) || schoon(regel);
    }
  }
  return null;
}

/** Herken aan de inhoud welk rapport dit is; de bestandsnaam is niet te vertrouwen. */
export function herkenRapport(rooster: Rooster): Rapport | null {
  const kop = rooster.slice(0, 40).map((r) => r.join(" ").toLowerCase()).join("\n");
  if (/factuurdatum/.test(kop) && /factuurnummer/.test(kop)) return "09";
  if (/medewerker|agb/.test(kop) && /verrichting/.test(kop)) return "25";
  if (/verrichtingen\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)/.test(kop)) {
    return "05";
  }
  return null;
}

/* ------------------------------------------------- rapport 05 en 25 ------- */

const K_NAAM = 0, K_AANTAL = 7, K_MAN = 8, K_VROUW = 9, K_GEDECL = 10, K_TOEGEZ = 11, K_EENHEDEN = 12;

function ontleedPrestaties(rooster: Rooster, rapport: Rapport): Ontleding {
  let jaar = jaarUitPeriode(rooster);
  let maand: string | null = null;
  let vorigeIndex = -1;
  let medewerker: string | null = null;

  const prestaties: PrestatieRegel[] = [];
  const overgeslagen: string[] = [];

  for (const rij of rooster) {
    const eerste = schoon(rij[K_NAAM]);
    if (!eerste) continue;

    // "Verrichtingen september" opent een nieuw maandblok.
    const blok = eerste.toLowerCase().match(/verrichtingen\s+([a-zéë]+)/);
    if (blok) {
      const i = MAANDEN.indexOf(blok[1]!);
      if (i >= 0) {
        // Loopt de reeks over de jaarwisseling heen, dan telt het jaar op.
        if (vorigeIndex >= 0 && i < vorigeIndex) jaar++;
        vorigeIndex = i;
        maand = `${jaar}-${String(i + 1).padStart(2, "0")}-01`;
      }
      continue;
    }

    // In rapport 25 opent een medewerkerregel een nieuw blok binnen de maand.
    if (rapport === "25" && /^(medewerker|arts|agb)\b/i.test(eerste)) {
      medewerker = schoon(eerste.split(/[:]/).slice(1).join(":")) || eerste;
      continue;
    }

    if (/^totaal/i.test(eerste)) continue;
    if (!maand) continue;

    const aantal = getal(rij[K_AANTAL]);
    const gedeclareerd = getal(rij[K_GEDECL]);
    if (aantal === null && gedeclareerd === null) {
      // Een regel zonder aantal én zonder bedrag is een kop of een lege regel.
      continue;
    }

    prestaties.push({
      maand,
      code: codeUit(eerste),
      omschrijving: eerste,
      aantal,
      man: getal(rij[K_MAN]),
      vrouw: getal(rij[K_VROUW]),
      gedeclareerd,
      toegezegd: getal(rij[K_TOEGEZ]),
      eenheden: getal(rij[K_EENHEDEN]),
      medewerker: rapport === "25" ? medewerker : null,
    });
  }

  if (!prestaties.length) {
    overgeslagen.push("Geen enkele verrichtingregel herkend. Klopt de kolomindeling van de export nog?");
  }
  const zonderCode = prestaties.filter((p) => !p.code).length;
  if (zonderCode) {
    overgeslagen.push(`${zonderCode} regels dragen geen vijfcijferige code; die tellen wel mee in de omzet maar niet in de categorieën.`);
  }

  return {
    rapport,
    praktijknummer: meta(rooster, "praktijknummer"),
    periode: meta(rooster, "periode"),
    standDatabase: meta(rooster, "stand"),
    prestaties,
    facturen: [],
    overgeslagen,
  };
}

/* ------------------------------------------------------ rapport 09 -------- */

const F_NUMMER = 0, F_DATUM = 1, F_VAN = 2, F_TOT = 4,
  F_GEDECL = 5, F_AKKOORD = 6, F_AFGEBOEKT = 7, F_BETAALD = 8, F_UZOVI = 10, F_VERZEKERAAR = 11;

function ontleedFacturen(rooster: Rooster): Ontleding {
  let blok: 1 | 2 | 3 = 2;
  let blokGezien = false;
  const facturen: FactuurRegel[] = [];
  const overgeslagen: string[] = [];

  for (const rij of rooster) {
    const regel = rij.join(" ").toLowerCase();

    // De drie blokken hebben elk een eigen kop. Ze betekenen iets anders en
    // mogen nooit worden opgeteld; het blokcijfer gaat daarom mee de database in.
    if (regel.includes("factuurdatum")) {
      if (/\bvoor\b|\bvóór\b/.test(regel)) { blok = 1; blokGezien = true; continue; }
      if (/\bna\b/.test(regel)) { blok = 3; blokGezien = true; continue; }
      if (/\bin\b/.test(regel)) { blok = 2; blokGezien = true; continue; }
    }

    const nummer = schoon(rij[F_NUMMER]);
    const fdatum = datum(rij[F_DATUM]);
    if (!nummer || !fdatum) continue;

    facturen.push({
      blok,
      factuurnummer: nummer,
      factuurdatum: fdatum,
      behandeling_van: datum(rij[F_VAN]),
      behandeling_tot: datum(rij[F_TOT]) ?? datum(rij[F_VAN + 1]),
      gedeclareerd: getal(rij[F_GEDECL]),
      akkoord: getal(rij[F_AKKOORD]),
      afgeboekt: getal(rij[F_AFGEBOEKT]),
      betaald: getal(rij[F_BETAALD]),
      uzovi: schoon(rij[F_UZOVI]) || null,
      verzekeraar: schoon(rij[F_VERZEKERAAR]) || null,
    });
  }

  if (!blokGezien) {
    // Een lopend jaar heeft nog geen jaareinde en dus maar één blok. Dat is
    // geen fout, maar het moet wel worden gezegd: de drieblokkenlogica hoort
    // alleen bij afgesloten jaren.
    overgeslagen.push("Geen blokkoppen gevonden; alles is als blok 2 geboekt. Bij een lopend jaar klopt dat.");
  }
  if (!facturen.length) {
    overgeslagen.push("Geen factuurregels herkend. Klopt de kolomindeling van de export nog?");
  }

  return {
    rapport: "09",
    praktijknummer: meta(rooster, "praktijknummer"),
    periode: meta(rooster, "periode"),
    standDatabase: meta(rooster, "stand"),
    prestaties: [],
    facturen,
    overgeslagen,
  };
}

export function ontleed(rooster: Rooster, gedwongen?: Rapport): Ontleding {
  const rapport = gedwongen ?? herkenRapport(rooster);
  if (!rapport) {
    throw new Error(
      "Ik herken dit bestand niet als rapport 05, 09 of 25 uit Bricks. "
      + "Kies hieronder zelf welk rapport het is, dan probeer ik het alsnog.",
    );
  }
  return rapport === "09" ? ontleedFacturen(rooster) : ontleedPrestaties(rooster, rapport);
}

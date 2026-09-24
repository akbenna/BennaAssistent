/**
 * DE DECLARATIERAPPORTEN ONTLEDEN
 *
 * TWEE SYSTEMEN, EN ZE WORDEN MAKKELIJK DOOR ELKAAR GEHAALD
 *
 * Bricks/TetraHIS is het huisartsinformatiesysteem: daar staat wat de praktijk
 * heeft geregistreerd. VIPLive (Calculus) is het declaratie- en ketenzorgportaal
 * van de zorggroep: daar staat wat daarvan is ingediend, goedgekeurd en betaald.
 * Een rapport uit het ene systeem is niet hetzelfde als een rapport uit het
 * andere, ook niet als het over dezelfde euro's gaat.
 *
 * Deze app leest er drie, en die komen dus niet uit één bron:
 *
 *   05  Overzicht gedeclareerde prestaties per maand   VIPLive   prestatiebasis
 *   09  Totaal overzicht facturen voor de boekhouding  VIPLive   factuurbasis
 *   25  Verrichtingen per medewerker                   Bricks    registratie
 *
 * Rapport 05 zegt wanneer de zorg is geleverd, rapport 09 wanneer de factuur is
 * gemaakt. Dat zijn twee verschillende vragen, en wie ze optelt krijgt een
 * antwoord op geen van beide. Ze landen daarom in aparte tabellen. Rapport 25
 * is registratie en geen inkomsten: die regels moeten nog door de goedkeuring
 * van VIPLive heen, en daar valt een deel af.
 *
 * De twee andere rapporten van de rapportenronde — 23 Betalingen via
 * Zorggroepen en de betaalspecificatie ketenzorg — horen thuis in de
 * praktijkanalyse van het portaal, dat ze zelf inleest. Ze staan bewust niet
 * hier: deze app houdt de maandstaat bij, niet de hele geldstroom.
 *
 * RAPPORT 25 KOMT IN TWEE GEDAANTEN
 *
 * De ene heeft maandblokken per behandelaar, met boven elk blok "Verrichtingen
 * behandelaar <naam>" en vaak één tabblad per persoon. De andere is één platte
 * tabel: een regel per medewerker per code, met de kolommen Gebruikersnaam,
 * Naam, EIM-code, Verrichting, Aantal en Bedrag. Die tweede draagt nergens een
 * periode — niet in de kop, niet in de bestandsnaam — dus de maand moet erbij
 * worden gezegd. Raden zou hier stilletjes de verkeerde vergelijking opleveren.
 *
 * De kolomposities worden op de koprij gezocht en pas daarna teruggevallen op
 * de vaste plaatsen. Een export schuift wel eens op tussen versies, en dan
 * komen getallen in de verkeerde kolom terecht zonder dat iets het merkt.
 */

import { getal, type Blad, type Rooster } from "./tabel";

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

/**
 * Een verrichtingcode staat vooraan in de cel, met de omschrijving erachter:
 * "12011 Consult langer dan 20 minuten". De meeste zijn vijf cijfers, maar niet
 * alle, dus de vorm vooraan gaat voor op de lengte. Staat er niets vooraan, dan
 * telt een losse vijfcijferige code verderop in de tekst nog als vangnet.
 */
function codeUit(naam: string): string | null {
  return naam.match(/^(\d{4,6})\s+\S/)?.[1] ?? naam.match(/\b(\d{5})\b/)?.[1] ?? null;
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

/**
 * Het jaar uit de periederegel bovenaan, of null als er geen jaartal staat.
 *
 * De woordgrenzen zijn geen franje: zonder die grenzen leest verrichtingcode
 * 12011 als het jaar 2011, en dan belandt een heel tabblad zeven jaar terug in
 * de tijd. Dat bleef verborgen zolang alleen het eerste blad werd gelezen,
 * waar de kopregels vóór de verrichtingen staan.
 */
function jaarUitPeriode(rooster: Rooster): number | null {
  for (const rij of rooster.slice(0, 6)) {
    const m = rij.join(" ").match(/\b(20\d{2})\b/);
    if (m) return Number(m[1]);
  }
  return null;
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

/** De vorm van rapport 25: platte tabel of maandblokken per behandelaar. */
export type Vorm = "plat" | "blokken";

/** De koprij van een platte medewerkerstabel, of null als dit blad er geen heeft. */
function platteKop(rooster: Rooster): { rij: number; kol: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rooster.length, 12); i++) {
    const cellen = (rooster[i] ?? []).map((c) => schoon(c).toLowerCase());
    if (!cellen.length) continue;
    const kol: Record<string, number> = {};
    cellen.forEach((c, j) => {
      if (c === "gebruikersnaam") kol.gebruiker = j;
      else if (c === "naam") kol.naam = j;
      else if (c === "eim-code" || c === "eimcode" || c === "code") kol.code = j;
      else if (c === "verrichting" || c === "omschrijving") kol.omschrijving = j;
      else if (c === "aantal") kol.aantal = j;
      else if (c === "bedrag") kol.bedrag = j;
    });
    if (kol.code != null && kol.aantal != null && kol.bedrag != null
      && (kol.gebruiker != null || kol.naam != null)) return { rij: i, kol };
  }
  return null;
}

const MAANDKOP = new RegExp(`^verrichtingen\\s+(${MAANDEN.join("|")})\\s*$`, "i");
const BEHANDELAARKOP = /^verrichtingen\s+behandelaar\s+(.+)$/i;

/**
 * Herken aan de inhoud welk rapport dit is; de bestandsnaam is niet te
 * vertrouwen. De volgorde is niet willekeurig: de platte tabel van rapport 25
 * draagt ook het woord "verrichting", dus die moet vóór de maandkop worden
 * gewogen, anders leest een medewerkersbestand zich voor als een 05.
 */
export function herkenRapport(bladen: Blad[]): { rapport: Rapport; vorm?: Vorm } | null {
  const eerste = bladen[0]?.rijen ?? [];
  const kop = eerste.slice(0, 40).map((r) => r.join(" ").toLowerCase()).join("\n");

  if (/factuurdatum/.test(kop) && /factuurnummer/.test(kop)) return { rapport: "09" };
  if (platteKop(eerste)) return { rapport: "25", vorm: "plat" };

  const heeftBehandelaar = bladen.some((b) => b.rijen.some((r) => BEHANDELAARKOP.test(schoon(r[0]))));
  if (heeftBehandelaar) return { rapport: "25", vorm: "blokken" };

  if (bladen.some((b) => b.rijen.some((r) => MAANDKOP.test(schoon(r[0]))))) return { rapport: "05" };
  return null;
}

/* ------------------------------------------------- rapport 05 en 25 ------- */

const K_NAAM = 0;
const VAST = { aantal: 7, man: 8, vrouw: 9, gedecl: 10, toegezegd: 11, eenheden: 12 };

/** De kolomnamen staan op dezelfde rij als de maandkop; vandaar dit. */
function kolommenUitKoprij(rij: string[]): Partial<typeof VAST> {
  const kol: Partial<typeof VAST> = {};
  rij.forEach((c, i) => {
    const t = schoon(c).toLowerCase();
    if (t === "aantal") kol.aantal = i;
    else if (t === "man") kol.man = i;
    else if (t === "vrouw") kol.vrouw = i;
    else if (t === "gedeclareerd") kol.gedecl = i;
    else if (t === "toegezegd") kol.toegezegd = i;
    else if (t === "eenheden") kol.eenheden = i;
  });
  return kol;
}

function ontleedPrestaties(bladen: Blad[], rapport: Rapport): Ontleding {
  const eerste = bladen[0]?.rijen ?? [];
  const prestaties: PrestatieRegel[] = [];
  const overgeslagen: string[] = [];
  let zonderBehandelaar = 0;

  // Het jaartal staat meestal alleen boven het eerste tabblad; de andere bladen
  // erven het, want ze horen bij dezelfde export.
  const jaarBasis = jaarUitPeriode(eerste) ?? new Date().getFullYear();

  for (const blad of bladen) {
    let jaar = jaarUitPeriode(blad.rijen) ?? jaarBasis;
    let maand: string | null = null;
    let vorigeIndex = -1;
    let kol = { ...VAST };
    // Elk tabblad is in rapport 25 en 4a één behandelaar. Staat de naam er niet
    // boven, dan is de tabbladnaam het beste wat er is — beter dan niets, want
    // een lege medewerker telt in de maandstaat mee alsof het rapport 05 was.
    let behandelaar: string | null = null;

    for (const rij of blad.rijen) {
      const eersteCel = schoon(rij[K_NAAM]);
      if (!eersteCel) continue;

      const bh = eersteCel.match(BEHANDELAARKOP);
      if (bh) { behandelaar = schoon(bh[1]); continue; }

      const blok = eersteCel.match(MAANDKOP);
      if (blok) {
        const i = MAANDEN.indexOf(blok[1]!.toLowerCase());
        if (i >= 0) {
          // Loopt de reeks over de jaarwisseling heen, dan telt het jaar op.
          if (vorigeIndex >= 0 && i < vorigeIndex) jaar++;
          vorigeIndex = i;
          maand = `${jaar}-${String(i + 1).padStart(2, "0")}-01`;
        }
        // De koprij draagt ook de kolomnamen. Alleen overnemen als de twee
        // kolommen die er echt toe doen gevonden zijn.
        const gevonden = kolommenUitKoprij(rij);
        if (gevonden.aantal != null && gevonden.gedecl != null) kol = { ...kol, ...gevonden };
        continue;
      }

      // "Totaal" sluit het maandblok af. Wat daarna komt hoort bij geen maand
      // meer en mag dus ook niet bij de vorige worden opgeteld.
      if (/^totaal/i.test(eersteCel)) { maand = null; continue; }
      if (!maand) continue;

      const aantal = getal(rij[kol.aantal]);
      const gedeclareerd = getal(rij[kol.gedecl]);
      if (aantal === null && gedeclareerd === null) {
        // Een regel zonder aantal én zonder bedrag is een kop of een lege regel.
        continue;
      }

      const wie = rapport === "25" ? (behandelaar ?? bladNaam(blad)) : null;
      if (rapport === "25" && !wie) zonderBehandelaar++;

      prestaties.push({
        maand,
        code: codeUit(eersteCel),
        omschrijving: eersteCel,
        aantal,
        man: getal(rij[kol.man]),
        vrouw: getal(rij[kol.vrouw]),
        gedeclareerd,
        toegezegd: getal(rij[kol.toegezegd]),
        eenheden: getal(rij[kol.eenheden]),
        medewerker: wie,
      });
    }
  }

  if (!prestaties.length) {
    overgeslagen.push("Geen enkele verrichtingregel herkend. Klopt de kolomindeling van de export nog?");
  }
  if (zonderBehandelaar) {
    // Zonder naam belandt een 25-regel in de maandstaat naast rapport 05 en telt
    // alles dubbel. Liever hard weigeren dan stil verkeerd optellen.
    throw new Error(
      `${zonderBehandelaar} regels in dit rapport 25 dragen geen behandelaar, ook niet via de tabbladnaam. `
      + "Zonder naam tellen ze in de maandstaat dubbel naast rapport 05. Exporteer opnieuw met de behandelaars erin.",
    );
  }
  if (bladen.length > 1) {
    overgeslagen.push(`${bladen.length} tabbladen gelezen; die staan hier bij elkaar opgeteld.`);
  }
  const zonderCode = prestaties.filter((p) => !p.code).length;
  if (zonderCode) {
    overgeslagen.push(`${zonderCode} regels dragen geen vijfcijferige code; die tellen wel mee in de omzet maar niet in de categorieën.`);
  }

  return {
    rapport,
    praktijknummer: meta(eerste, "praktijknummer"),
    periode: meta(eerste, "periode"),
    standDatabase: meta(eerste, "stand"),
    prestaties,
    facturen: [],
    overgeslagen,
  };
}

/** Een tabbladnaam die nergens naar verwijst ("Blad 1", "Sheet1") is geen naam. */
function bladNaam(blad: Blad): string | null {
  const n = schoon(blad.naam);
  return !n || /^(blad|sheet|tabblad)\s*\d*$/i.test(n) ? null : n;
}

/* ------------------------------------------- rapport 25, platte tabel ----- */

/**
 * Eén regel per medewerker per code. Het bestand zegt zelf niet over welke
 * maand het gaat — Bricks kan dit rapport niet per maand groeperen en zet de
 * periode er niet in — dus de maand komt van het scherm.
 */
function ontleedPlat25(bladen: Blad[], maand: string): Ontleding {
  const eerste = bladen[0]?.rijen ?? [];
  const kop = platteKop(eerste);
  if (!kop) throw new Error("Dit blad heeft geen koprij met Gebruikersnaam, code, Aantal en Bedrag.");

  const prestaties: PrestatieRegel[] = [];
  const overgeslagen: string[] = [];
  let zonderNaam = 0;

  for (let i = kop.rij + 1; i < eerste.length; i++) {
    const rij = eerste[i] ?? [];
    const code = schoon(rij[kop.kol.code!]);
    if (!/^\d{4,6}$/.test(code)) continue;

    // Niet elke regel draagt een gebruikersnaam: zorg die via de
    // waarneemregistratie binnenkomt staat in Bricks zonder inlog maar mét naam.
    const wie = schoon(rij[kop.kol.naam ?? -1]) || schoon(rij[kop.kol.gebruiker ?? -1]);
    if (!wie) { zonderNaam++; continue; }

    prestaties.push({
      maand,
      code,
      omschrijving: schoon(rij[kop.kol.omschrijving ?? -1]) || code,
      aantal: getal(rij[kop.kol.aantal!]),
      man: null,
      vrouw: null,
      gedeclareerd: getal(rij[kop.kol.bedrag!]),
      toegezegd: null,
      eenheden: null,
      medewerker: wie,
    });
  }

  if (!prestaties.length) {
    overgeslagen.push("Geen regels met een verrichtingcode gevonden. Klopt de kolomindeling van de export nog?");
  }
  if (zonderNaam) {
    overgeslagen.push(`${zonderNaam} regels dragen geen medewerker en zijn overgeslagen.`);
  }
  overgeslagen.push(
    "Deze vorm van rapport 25 draagt geen periode in het bestand; de maand hierboven is jouw keuze en niet uit het bestand gelezen.",
  );

  return {
    rapport: "25",
    praktijknummer: meta(eerste, "praktijknummer"),
    periode: null,
    standDatabase: meta(eerste, "stand"),
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
  let kol = { nummer: F_NUMMER, datum: F_DATUM, van: F_VAN, tot: F_TOT, gedecl: F_GEDECL,
    akkoord: F_AKKOORD, afgeboekt: F_AFGEBOEKT, betaald: F_BETAALD, uzovi: F_UZOVI, verz: F_VERZEKERAAR };
  const facturen: FactuurRegel[] = [];
  const overgeslagen: string[] = [];

  for (const rij of rooster) {
    const regel = rij.join(" ").toLowerCase();

    // De drie blokken hebben elk een eigen kop. Ze betekenen iets anders en
    // mogen nooit worden opgeteld; het blokcijfer gaat daarom mee de database in.
    // De blokkop en de kolomkop kunnen op dezelfde rij staan of op twee rijen;
    // beide komen voor, dus ze worden los van elkaar gewogen.
    if (regel.includes("factuurdatum")) {
      if (/\bvoor\b|\bvóór\b/.test(regel)) { blok = 1; blokGezien = true; }
      else if (/\bna\b/.test(regel)) { blok = 3; blokGezien = true; }
      else if (/\bin\b/.test(regel)) { blok = 2; blokGezien = true; }
    }

    // De koprij draagt de kolomnamen. Ze staan niet voor eeuwig op dezelfde
    // plaats, dus liever hier lezen dan op vaste posities vertrouwen.
    if (rij.some((c) => /^factuurnummer$/i.test(schoon(c)))) {
      rij.forEach((c, i) => {
        const t = schoon(c).toLowerCase();
        if (t === "factuurnummer") kol.nummer = i;
        else if (t === "factuurdatum") kol.datum = i;
        else if (/^periode/.test(t)) { kol.van = i; kol.tot = i + 2; }
        else if (t === "gedeclareerd") kol.gedecl = i;
        else if (/^akkoord/.test(t)) kol.akkoord = i;
        else if (t === "afgeboekt") kol.afgeboekt = i;
        else if (t === "betaald") kol.betaald = i;
        else if (t === "uzovi") kol.uzovi = i;
        else if (t === "verzekeraar") kol.verz = i;
      });
      continue;
    }

    const nummer = schoon(rij[kol.nummer]);
    const fdatum = datum(rij[kol.datum]);
    if (!nummer || !fdatum) continue;

    facturen.push({
      blok,
      factuurnummer: nummer,
      factuurdatum: fdatum,
      behandeling_van: datum(rij[kol.van]),
      behandeling_tot: datum(rij[kol.tot]) ?? datum(rij[kol.van + 1]),
      gedeclareerd: getal(rij[kol.gedecl]),
      akkoord: getal(rij[kol.akkoord]),
      afgeboekt: getal(rij[kol.afgeboekt]),
      betaald: getal(rij[kol.betaald]),
      uzovi: schoon(rij[kol.uzovi]) || null,
      verzekeraar: schoon(rij[kol.verz]) || null,
    });
  }

  if (!blokGezien) {
    // Een lopend jaar heeft nog geen jaareinde en dus maar één blok. Dat is
    // geen fout, maar het moet wel worden gezegd: de drieblokkenlogica hoort
    // alleen bij afgesloten jaren.
    overgeslagen.push("Geen blokkoppen gevonden; alles is als blok 2 geboekt. Bij een lopend jaar klopt dat.");
  }
  if (facturen.some((f) => f.betaald != null || f.afgeboekt != null)) {
    overgeslagen.push("Er staan bedragen in Betaald of Afgeboekt; die kolommen vult VIPLive alleen als je in VIPLive afboekt.");
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

export interface Opties {
  /** Zelf gekozen rapportsoort, als de herkenning het niet ziet. */
  gedwongen?: Rapport;
  /** YYYY-MM-01. Alleen nodig voor de platte vorm van rapport 25. */
  maand?: string;
}

/** Wordt gegooid als een plat rapport 25 zonder maand wordt aangeboden. */
export class MaandNodig extends Error {
  constructor() {
    super(
      "Dit is de platte vorm van rapport 25. Bricks zet er geen periode in, dus kies zelf "
      + "over welke maand dit bestand gaat — het is één kalendermaand per bestand.",
    );
    this.name = "MaandNodig";
  }
}

export function ontleed(bladen: Blad[], opties: Opties = {}): Ontleding {
  const herkend = herkenRapport(bladen);
  const rapport = opties.gedwongen ?? herkend?.rapport;
  if (!rapport) {
    throw new Error(
      "Ik herken dit bestand niet als rapport 05 of 09 uit VIPLive, of rapport 25 uit Bricks. "
      + "Kies hieronder zelf welk rapport het is, dan probeer ik het alsnog.",
    );
  }
  if (rapport === "09") return ontleedFacturen(bladen[0]?.rijen ?? []);

  // De platte vorm van 25 blijft plat, ook als de soort met de hand is gekozen.
  const plat = rapport === "25" && platteKop(bladen[0]?.rijen ?? []) != null;
  if (plat) {
    if (!opties.maand) throw new MaandNodig();
    return ontleedPlat25(bladen, opties.maand);
  }
  return ontleedPrestaties(bladen, rapport);
}

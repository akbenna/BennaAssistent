/**
 * EEN TABEL LEZEN UIT CSV OF XLSX, ZONDER BIBLIOTHEEK
 *
 * De voor de hand liggende keuze was SheetJS. Die staat op npm nog op 0.18.5,
 * de versie met een prototypevervuiling en een ReDoS erin; de herstelde versies
 * publiceert SheetJS alleen op hun eigen CDN, en die is hier niet bereikbaar.
 * Een bekende kwetsbaarheid binnenhalen om één bestand te openen is de
 * verkeerde ruil, zeker in een app die bestuurscorrespondentie draagt.
 *
 * Wat hier staat is dus met de hand geschreven, in dezelfde geest als de
 * PNG-encoder in `scripts/make-icons.mjs`. Het kan minder dan SheetJS — geen
 * formules, geen opmaak, geen datumtypen — en dat is precies genoeg: een
 * Bricks-export is een rooster met tekst en getallen.
 *
 * DE BROWSER DOET HET ZWARE WERK
 *
 * Een xlsx is een zip met XML erin. `DecompressionStream` pakt de deflate uit
 * en `DOMParser` leest de XML; beide zitten al in elke browser die deze app
 * draait. Er gaat niets naar een server: het bestand wordt in je eigen tabblad
 * gelezen en alleen de uitkomst gaat naar de database.
 */

export type Rooster = string[][];

/* ----------------------------------------------------------------- csv ---- */

/** Het scheidingsteken uit de eerste regels afleiden. Nederlandse exports
    gebruiken bijna altijd de puntkomma, maar niet altijd. */
function scheidingsteken(tekst: string): string {
  const kop = tekst.slice(0, 4000);
  const tel = (t: string) => (kop.match(new RegExp(`\\${t}`, "g")) ?? []).length;
  const punt = tel(";");
  const komma = tel(",");
  const tab = tel("\t");
  if (tab > punt && tab > komma) return "\t";
  return punt >= komma ? ";" : ",";
}

export function leesCsv(tekst: string): Rooster {
  const sep = scheidingsteken(tekst);
  const rijen: Rooster = [];
  let rij: string[] = [];
  let veld = "";
  let inAanhaling = false;

  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (inAanhaling) {
      if (c === '"') {
        // Twee aanhalingstekens achter elkaar zijn er één in de waarde.
        if (tekst[i + 1] === '"') { veld += '"'; i++; } else inAanhaling = false;
      } else veld += c;
      continue;
    }
    if (c === '"') { inAanhaling = true; continue; }
    if (c === sep) { rij.push(veld); veld = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { rij.push(veld); rijen.push(rij); rij = []; veld = ""; continue; }
    veld += c;
  }
  if (veld !== "" || rij.length) { rij.push(veld); rijen.push(rij); }
  return rijen;
}

/* ---------------------------------------------------------------- xlsx ---- */

interface ZipRegel { naam: string; methode: number; offset: number; lengte: number }

/** De inhoudsopgave van een zip staat achteraan; daar begint het lezen. */
function zipInhoud(buf: Uint8Array): ZipRegel[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Het eindrecord draagt 0x06054b50 en staat in de laatste 64 KiB.
  let eind = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eind = i; break; }
  }
  if (eind < 0) throw new Error("Dit is geen geldig xlsx-bestand.");

  let p = dv.getUint32(eind + 16, true);
  const aantal = dv.getUint16(eind + 10, true);
  const uit: ZipRegel[] = [];
  const naamLezer = new TextDecoder();

  for (let n = 0; n < aantal; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const methode = dv.getUint16(p + 10, true);
    const lengte = dv.getUint32(p + 20, true);
    const naamLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const naam = naamLezer.decode(buf.subarray(p + 46, p + 46 + naamLen));
    uit.push({ naam, methode, offset, lengte });
    p += 46 + naamLen + extraLen + commentLen;
  }
  return uit;
}

async function pakUit(buf: Uint8Array, regel: ZipRegel): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // De lokale kop herhaalt de naam- en extralengte; die van de inhoudsopgave
  // kunnen ervan afwijken, dus lezen we ze hier opnieuw.
  const naamLen = dv.getUint16(regel.offset + 26, true);
  const extraLen = dv.getUint16(regel.offset + 28, true);
  const start = regel.offset + 30 + naamLen + extraLen;
  const data = buf.subarray(start, start + regel.lengte);

  if (regel.methode === 0) return new TextDecoder().decode(data);
  if (regel.methode !== 8) throw new Error(`Onbekende compressie in het xlsx-bestand (${regel.methode}).`);

  // De kopie is nodig omdat TypeScript een Uint8Array over een gedeelde buffer
  // niet als BlobPart accepteert; `slice` levert er een met een eigen buffer.
  const stroom = new Blob([data.slice().buffer as ArrayBuffer]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stroom).text();
}

/** "BD12" wordt kolom 55. */
function kolomUitVerwijzing(ref: string): number {
  let n = 0;
  for (const teken of ref) {
    const c = teken.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

export async function leesXlsx(bestand: File): Promise<Rooster> {
  const buf = new Uint8Array(await bestand.arrayBuffer());
  const inhoud = zipInhoud(buf);
  const vind = (naam: string) => inhoud.find((r) => r.naam === naam);

  // Het eerste werkblad. De volgorde in workbook.xml is de juiste, maar
  // sheet1.xml is in elke export die Bricks maakt het eerste blad.
  const blad = vind("xl/worksheets/sheet1.xml")
    ?? inhoud.find((r) => r.naam.startsWith("xl/worksheets/") && r.naam.endsWith(".xml"));
  if (!blad) throw new Error("Geen werkblad gevonden in het xlsx-bestand.");

  const ontleder = new DOMParser();

  // De gedeelde tekstenlijst: cellen met t="s" verwijzen met een nummer hierheen.
  let gedeeld: string[] = [];
  const ss = vind("xl/sharedStrings.xml");
  if (ss) {
    const doc = ontleder.parseFromString(await pakUit(buf, ss), "application/xml");
    gedeeld = Array.from(doc.getElementsByTagName("si")).map((si) =>
      // Opgemaakte tekst valt uiteen in meerdere <t>-stukken; die horen aan elkaar.
      Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""),
    );
  }

  const doc = ontleder.parseFromString(await pakUit(buf, blad), "application/xml");
  const rijen: Rooster = [];

  for (const rij of Array.from(doc.getElementsByTagName("row"))) {
    const regel: string[] = [];
    for (const cel of Array.from(rij.getElementsByTagName("c"))) {
      const kolom = kolomUitVerwijzing(cel.getAttribute("r") ?? "");
      const soort = cel.getAttribute("t");
      let waarde = "";
      if (soort === "s") {
        const i = Number(cel.getElementsByTagName("v")[0]?.textContent ?? "-1");
        waarde = gedeeld[i] ?? "";
      } else if (soort === "inlineStr") {
        waarde = Array.from(cel.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      } else {
        waarde = cel.getElementsByTagName("v")[0]?.textContent ?? "";
      }
      // Lege cellen worden in xlsx weggelaten; het rooster moet ze wel hebben,
      // anders schuiven de kolommen op zodra er ergens niets staat.
      while (regel.length < kolom) regel.push("");
      regel[kolom] = waarde;
    }
    rijen.push(regel);
  }
  return rijen;
}

/* --------------------------------------------------------------- ingang --- */

export async function leesBestand(bestand: File): Promise<Rooster> {
  const naam = bestand.name.toLowerCase();
  if (naam.endsWith(".xlsx") || naam.endsWith(".xlsm")) return leesXlsx(bestand);
  if (naam.endsWith(".csv") || naam.endsWith(".txt") || naam.endsWith(".tsv")) {
    return leesCsv(await bestand.text());
  }
  if (naam.endsWith(".xls")) {
    // Het oude binaire formaat is iets heel anders dan xlsx en niet de moeite
    // waard om na te bouwen; Bricks kan ook als xlsx of csv wegschrijven.
    throw new Error("Het oude .xls-formaat kan ik niet lezen. Kies in Bricks voor xlsx of csv.");
  }
  throw new Error(`Onbekend bestandstype: ${bestand.name}`);
}

/** "1.234,56" en "€ 1.234,56" worden 1234.56; lege cellen worden null. */
export function getal(waarde: string | undefined): number | null {
  if (waarde == null) return null;
  const kaal = waarde.replace(/[€\s]/g, "").trim();
  if (!kaal || kaal === "-") return null;
  // Nederlandse notatie: punt is duizendscheiding, komma is decimaal.
  const genormaliseerd = kaal.includes(",")
    ? kaal.replace(/\./g, "").replace(",", ".")
    : kaal;
  const n = Number(genormaliseerd);
  return Number.isFinite(n) ? n : null;
}

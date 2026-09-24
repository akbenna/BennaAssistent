/**
 * EEN XLSX BOUWEN OM DE ZELFGESCHREVEN LEZER OP TE BEPROEVEN
 *
 * De lezer in `src/lib/tabel.ts` is met de hand geschreven omdat SheetJS op
 * npm alleen in een kwetsbare versie staat. Zoiets moet je kunnen testen, en
 * daarvoor heb je een echt zip-bestand nodig — vandaar deze bouwer. Zip
 * schrijven kan met `deflateRawSync`; de rest is administratie.
 *
 * Wordt gebruikt door `src/lib/tabel.test.ts` en is los aan te roepen met
 * `node scripts/maak-proef-xlsx.mjs <pad>` om een bestand met de hand te
 * bekijken.
 */
import { deflateRawSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const TABEL = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff;
  for (const b of buf) c = TABEL[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zip(bestanden) {
  const lokaal = [], centraal = []; let offset = 0;
  for (const { naam, inhoud } of bestanden) {
    const rauw = Buffer.from(inhoud, "utf8");
    const gepakt = deflateRawSync(rauw);
    const crc = crc32(rauw);
    const naamBuf = Buffer.from(naam, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(gepakt.length, 18); lh.writeUInt32LE(rauw.length, 22);
    lh.writeUInt16LE(naamBuf.length, 26);
    lokaal.push(lh, naamBuf, gepakt);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(gepakt.length, 20); ch.writeUInt32LE(rauw.length, 24);
    ch.writeUInt16LE(naamBuf.length, 28); ch.writeUInt32LE(offset, 42);
    centraal.push(ch, naamBuf);
    offset += lh.length + naamBuf.length + gepakt.length;
  }
  const lokaalBuf = Buffer.concat(lokaal), centraalBuf = Buffer.concat(centraal);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(bestanden.length, 8); eocd.writeUInt16LE(bestanden.length, 10);
  eocd.writeUInt32LE(centraalBuf.length, 12); eocd.writeUInt32LE(lokaalBuf.length, 16);
  return Buffer.concat([lokaalBuf, centraalBuf, eocd]);
}

/* Een rooster van rijen; strings gaan in de gedeelde lijst, getallen niet. */
export function blad(rijen) {
  const gedeeld = [], index = new Map();
  const deel = (s) => { if (!index.has(s)) { index.set(s, gedeeld.length); gedeeld.push(s); } return index.get(s); };
  const letters = (n) => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const xml = rijen.map((rij, r) => {
    const cellen = rij.map((waarde, c) => {
      if (waarde === "" || waarde == null) return "";
      const ref = `${letters(c)}${r + 1}`;
      if (typeof waarde === "number") return `<c r="${ref}"><v>${waarde}</v></c>`;
      return `<c r="${ref}" t="s"><v>${deel(String(waarde))}</v></c>`;
    }).join("");
    return `<row r="${r + 1}">${cellen}</row>`;
  }).join("");
  return {
    sheet: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`,
    shared: `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${gedeeld.length}" uniqueCount="${gedeeld.length}">${gedeeld.map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`,
  };
}

/** Een rooster omzetten naar een compleet xlsx-bestand met één tabblad. */
export function maakXlsx(rijen) {
  return maakWerkboek([{ naam: "Blad1", rijen }]);
}

/**
 * Meerdere tabbladen in één bestand, met één gedeelde tekstenlijst en een
 * workbook.xml dat de namen draagt. Rapport 25 en 4a komen zo uit Bricks: elke
 * behandelaar op een eigen blad.
 */
export function maakWerkboek(bladen) {
  const gedeeld = [], index = new Map();
  const deel = (s) => { if (!index.has(s)) { index.set(s, gedeeld.length); gedeeld.push(s); } return index.get(s); };
  const letters = (n) => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ontsnap = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const vellen = bladen.map(({ rijen }) => {
    const xml = rijen.map((rij, r) => {
      const cellen = rij.map((waarde, c) => {
        if (waarde === "" || waarde == null) return "";
        const ref = `${letters(c)}${r + 1}`;
        if (typeof waarde === "number") return `<c r="${ref}"><v>${waarde}</v></c>`;
        return `<c r="${ref}" t="s"><v>${deel(String(waarde))}</v></c>`;
      }).join("");
      return `<row r="${r + 1}">${cellen}</row>`;
    }).join("");
    return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`;
  });

  const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>`
    + bladen.map((b, i) => `<sheet name="${ontsnap(b.naam)}" sheetId="${i + 1}"/>`).join("")
    + `</sheets></workbook>`;

  return zip([
    { naam: "[Content_Types].xml", inhoud: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>` },
    { naam: "xl/workbook.xml", inhoud: workbook },
    { naam: "xl/sharedStrings.xml", inhoud: `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${gedeeld.length}" uniqueCount="${gedeeld.length}">${gedeeld.map((t) => `<si><t>${ontsnap(t)}</t></si>`).join("")}</sst>` },
    ...vellen.map((sheet, i) => ({ naam: `xl/worksheets/sheet${i + 1}.xml`, inhoud: sheet })),
  ]);
}

/* Rapport 05, nagebouwd naar de gedocumenteerde structuur: kolom 0 naam,
   7 aantal, 8 man, 9 vrouw, 10 gedeclareerd, 11 toegezegd, 12 eenheden. */
const L = (naam, aantal, man, vrouw, bedrag) =>
  [naam, "", "", "", "", "", "", aantal, man, vrouw, bedrag, bedrag, aantal];

export const RAPPORT_05 = [
  ["Periode: 01-01-2026 t/m 31-03-2026"],
  ["Praktijknummer: 01023456"],
  ["Stand database: 21-09-2026"],
  [],
  ["Verrichtingen januari"],
  L("11115 Inschrijving verzekerde tot 65 jaar", 2180, 1050, 1130, 48240.5),
  L("11116 Inschrijving verzekerde 65 tot 75 jaar", 240, 110, 130, 7320),
  L("11119 Opslag inschrijving verzekerden woonachtig in een opslagwijk", 960, 460, 500, 12480),
  L("12010 Consult korter dan 5 minuten", 180, 80, 100, 1350),
  L("12011 Consult 5 tot 20 minuten", 1240, 520, 720, 24180),
  L("12001 Consult 20 minuten en langer", 420, 170, 250, 16380),
  L("12111 POH-GGZ consult", 118, 44, 74, 2596),
  ["Totaal", "", "", "", "", "", "", "", "", "", 129326.5],
  [],
  ["Verrichtingen februari"],
  L("12010 Consult korter dan 5 minuten", 165, 70, 95, 1237.5),
  L("12011 Consult 5 tot 20 minuten", 1180, 500, 680, 23010),
  L("12001 Consult 20 minuten en langer", 190, 80, 110, 7410),
  ["Totaal", "", "", "", "", "", "", "", "", "", 35485.5],
];

/* Los aanroepbaar: node scripts/maak-proef-xlsx.mjs <pad> */
if (process.argv[1]?.endsWith("maak-proef-xlsx.mjs")) {
  const pad = process.argv[2] ?? "proef-rapport05.xlsx";
  const bestand = maakXlsx(RAPPORT_05);
  writeFileSync(pad, bestand);
  console.log("geschreven:", pad, bestand.length, "bytes");
}

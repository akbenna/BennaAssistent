// Genereert de PWA-iconen zonder externe pakketten: een takenlijst-merk op warme inkt.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const uit = join(hier, "..", "public", "icons");

const INKT = [26, 22, 20];
const PAPIER = [245, 241, 234];
const ACCENT = [194, 112, 61];

function crc32(buf) {
  let c, tabel = crc32.tabel;
  if (!tabel) {
    tabel = crc32.tabel = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabel[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = tabel[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const lengte = Buffer.alloc(4);
  lengte.writeUInt32BE(data.length);
  const lijf = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(lijf));
  return Buffer.concat([lengte, lijf, crc]);
}

function png(breedte, hoogte, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8;  // bitdiepte
  ihdr[9] = 6;  // kleurtype RGBA
  const rijen = Buffer.alloc((breedte * 4 + 1) * hoogte);
  for (let y = 0; y < hoogte; y++) {
    rijen[y * (breedte * 4 + 1)] = 0; // filter: none
    rgba.copy(rijen, y * (breedte * 4 + 1) + 1, y * breedte * 4, (y + 1) * breedte * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rijen, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function doek(n) {
  const buf = Buffer.alloc(n * n * 4);
  const zet = (x, y, [r, g, b], alpha = 1) => {
    if (x < 0 || y < 0 || x >= n || y >= n || alpha <= 0) return;
    const i = (y * n + x) * 4;
    const meng = (oud, nieuw) => Math.round(oud * (1 - alpha) + nieuw * alpha);
    buf[i] = meng(buf[i], r);
    buf[i + 1] = meng(buf[i + 1], g);
    buf[i + 2] = meng(buf[i + 2], b);
    buf[i + 3] = Math.max(buf[i + 3], Math.round(255 * alpha));
  };
  return { buf, zet };
}

/** Dekking van een pixel binnen een afgeronde rechthoek, met 3x3 supersampling. */
function dekkingRechthoek(px, py, x, y, b, h, straal) {
  let raak = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const mx = px + (sx + 0.5) / 3, my = py + (sy + 0.5) / 3;
      if (mx < x || my < y || mx > x + b || my > y + h) continue;
      const dx = Math.max(x + straal - mx, mx - (x + b - straal), 0);
      const dy = Math.max(y + straal - my, my - (y + h - straal), 0);
      if (dx * dx + dy * dy <= straal * straal) raak++;
    }
  }
  return raak / 9;
}

function tekenIcoon(n, marge) {
  const { buf, zet } = doek(n);
  const veld = n - 2 * marge;
  const rond = (x, y, b, h, straal, kleur) => {
    for (let py = Math.floor(y); py < Math.ceil(y + h); py++) {
      for (let px = Math.floor(x); px < Math.ceil(x + b); px++) {
        zet(px, py, kleur, dekkingRechthoek(px, py, x, y, b, h, straal));
      }
    }
  };

  rond(marge, marge, veld, veld, veld * 0.22, INKT);

  // Drie regels met bolletje ervoor: een takenlijst.
  const dik = veld * 0.075;
  const bol = veld * 0.055;
  const linksBol = marge + veld * 0.22;
  const linksRegel = marge + veld * 0.37;
  const breedtes = [0.41, 0.33, 0.25];
  for (let r = 0; r < 3; r++) {
    const y = marge + veld * (0.32 + r * 0.18);
    rond(linksBol - bol, y - bol, bol * 2, bol * 2, bol, r === 0 ? ACCENT : PAPIER);
    rond(linksRegel, y - dik / 2, veld * breedtes[r], dik, dik / 2, r === 0 ? ACCENT : PAPIER);
  }
  return png(n, n, buf);
}

mkdirSync(uit, { recursive: true });
for (const [naam, maat, marge] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 54], // veilige zone voor Android-maskers
  ["apple-touch-icon.png", 180, 0],
]) {
  writeFileSync(join(uit, naam), tekenIcoon(maat, marge));
  console.log("geschreven:", naam);
}

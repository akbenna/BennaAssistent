/**
 * GELUID ZONDER FFMPEG
 *
 * De serverfuncties draaien in Deno en hebben geen ffmpeg. Alles wat met het
 * formaat van geluid te maken heeft gebeurt dus hier, in de browser, en levert
 * bestanden op die een spraakdienst rechtstreeks accepteert: hooguit vijf
 * minuten en ruim onder de 25 MB per stuk.
 *
 * - WAV is ruwe PCM en is dus op bytes te knippen: kop eraf, data in stukken,
 *   elk stuk een eigen kop. Geen decoderen, geen geheugen. Dat is wat SwyxIt
 *   aflevert.
 * - Een gecomprimeerd bestand (m4a, mp3) dat klein en kort genoeg is gaat
 *   onveranderd door.
 * - Is het te lang, dan decodeert de browser het naar 16 kHz mono en wordt het
 *   alsnog WAV. Dat kost geheugen, en daarom staat er een grens op.
 */

export const DEEL_SEC = 300;
export const MAX_DEEL_BYTES = 20 * 1024 * 1024;
/** Langer dan dit decoderen kost op een telefoon te veel geheugen. */
export const MAX_DECODEER_SEC = 3 * 3600;

export interface WavFormaat {
  kanalen: number;
  samplefrequentie: number;
  bits: number;
  dataBegin: number;
  dataLengte: number;
}

const tekst = (v: DataView, o: number, n: number) =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(o + i)));

/** Leest de kop van een WAV-bestand, of null als het geen PCM-WAV is. */
export function leesWav(buf: ArrayBuffer): WavFormaat | null {
  if (buf.byteLength < 44) return null;
  const v = new DataView(buf);
  if (tekst(v, 0, 4) !== "RIFF" || tekst(v, 8, 4) !== "WAVE") return null;
  let o = 12;
  let fmt: Omit<WavFormaat, "dataBegin" | "dataLengte"> | null = null;
  while (o + 8 <= buf.byteLength) {
    const id = tekst(v, o, 4);
    const grootte = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      const formaat = v.getUint16(o + 8, true);
      // 1 is gewone PCM, 0xFFFE is "extensible" en in de praktijk ook PCM.
      if (formaat !== 1 && formaat !== 0xfffe) return null;
      fmt = { kanalen: v.getUint16(o + 10, true), samplefrequentie: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === "data") {
      if (!fmt) return null;
      // Sommige opnamesoftware schrijft 0 of een te grote lengte als de opname
      // niet netjes werd afgesloten; dan geldt wat er werkelijk staat.
      const lengte = grootte === 0 || o + 8 + grootte > buf.byteLength ? buf.byteLength - (o + 8) : grootte;
      return { ...fmt, dataBegin: o + 8, dataLengte: lengte };
    }
    o += 8 + grootte + (grootte % 2);
  }
  return null;
}

export function wavKop(kanalen: number, samplefrequentie: number, bits: number, dataLengte: number): ArrayBuffer {
  const b = new ArrayBuffer(44);
  const v = new DataView(b);
  const schrijf = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  const blok = kanalen * (bits / 8);
  schrijf(0, "RIFF"); v.setUint32(4, 36 + dataLengte, true); schrijf(8, "WAVE");
  schrijf(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, kanalen, true);
  v.setUint32(24, samplefrequentie, true); v.setUint32(28, samplefrequentie * blok, true);
  v.setUint16(32, blok, true); v.setUint16(34, bits, true);
  schrijf(36, "data"); v.setUint32(40, dataLengte, true);
  return b;
}

export interface Stuk {
  blob: Blob;
  beginSec: number;
  duurSec: number;
}

/** Knipt een WAV op bytes in stukken van hooguit `maxSec` en `maxBytes`, elk met een eigen kop. */
export function knipWav(buf: ArrayBuffer, maxSec = DEEL_SEC, maxBytes = MAX_DEEL_BYTES): Stuk[] {
  const f = leesWav(buf);
  if (!f) throw new Error("Geen leesbaar WAV-bestand");
  const blok = f.kanalen * (f.bits / 8);
  const perSec = f.samplefrequentie * blok;
  // Hele samples per stuk, anders begint het volgende stuk midden in een sample.
  const perStuk = Math.max(blok, Math.floor(Math.min(maxSec * perSec, maxBytes - 44) / blok) * blok);
  const uit: Stuk[] = [];
  for (let o = 0; o < f.dataLengte; o += perStuk) {
    const n = Math.min(perStuk, f.dataLengte - o);
    const data = buf.slice(f.dataBegin + o, f.dataBegin + o + n);
    uit.push({
      blob: new Blob([wavKop(f.kanalen, f.samplefrequentie, f.bits, n), data], { type: "audio/wav" }),
      beginSec: o / perSec,
      duurSec: n / perSec,
    });
  }
  return uit;
}

/** Mono PCM (−1..1) naar 16-bit WAV. */
export function pcmNaarWav(samples: Float32Array, samplefrequentie: number): Blob {
  const data = new DataView(new ArrayBuffer(samples.length * 2));
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([wavKop(1, samplefrequentie, 16, samples.length * 2), data.buffer], { type: "audio/wav" });
}

/** Alle kanalen naar één, gemiddeld. */
export function naarMono(kanalen: Float32Array[]): Float32Array {
  if (kanalen.length === 1) return kanalen[0]!;
  const n = Math.min(...kanalen.map((k) => k.length));
  const uit = new Float32Array(n);
  for (const k of kanalen) for (let i = 0; i < n; i++) uit[i]! += k[i]! / kanalen.length;
  return uit;
}

/** Decodeert een gecomprimeerd bestand naar 16 kHz mono en knipt het in WAV-stukken. */
export async function decodeerEnKnip(bestand: Blob, maxSec = DEEL_SEC): Promise<Stuk[]> {
  const Ctx = window.OfflineAudioContext
    ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctx) throw new Error("Deze browser kan het bestand niet omzetten. Probeer het op een computer.");
  // Een OfflineAudioContext op 16 kHz laat decodeAudioData meteen naar 16 kHz omrekenen.
  const ctx = new Ctx(1, 16000, 16000);
  const audio = await ctx.decodeAudioData(await bestand.arrayBuffer());
  if (audio.duration > MAX_DECODEER_SEC) throw new Error("Dit bestand is langer dan drie uur; knip het eerst op.");
  const mono = naarMono(Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)));
  const per = maxSec * audio.sampleRate;
  const uit: Stuk[] = [];
  for (let o = 0; o < mono.length; o += per) {
    const stuk = mono.subarray(o, Math.min(mono.length, o + per));
    uit.push({ blob: pcmNaarWav(stuk, audio.sampleRate), beginSec: o / audio.sampleRate, duurSec: stuk.length / audio.sampleRate });
  }
  return uit;
}

/** De duur van een bestand volgens de browser, of null als die het niet weet. */
export function leesDuur(bestand: Blob): Promise<number | null> {
  return new Promise((klaar) => {
    const a = document.createElement("audio");
    const url = URL.createObjectURL(bestand);
    const einde = (d: number | null) => { URL.revokeObjectURL(url); klaar(d); };
    a.preload = "metadata";
    a.onloadedmetadata = () => einde(Number.isFinite(a.duration) ? a.duration : null);
    a.onerror = () => einde(null);
    setTimeout(() => einde(null), 8000);
    a.src = url;
  });
}

/**
 * Een bestand in stukken die een spraakdienst accepteert.
 * WAV knippen, klein en kort genoeg ongewijzigd, de rest decoderen.
 */
export async function stukkenVan(bestand: File): Promise<Stuk[]> {
  const begin = await bestand.slice(0, 12).arrayBuffer();
  const isWav = new TextDecoder().decode(new Uint8Array(begin).subarray(8, 12)) === "WAVE";
  if (isWav) return knipWav(await bestand.arrayBuffer());
  const duur = await leesDuur(bestand);
  if (bestand.size <= MAX_DEEL_BYTES && duur !== null && duur <= 20 * 60) {
    return [{ blob: bestand, beginSec: 0, duurSec: duur }];
  }
  return decodeerEnKnip(bestand);
}

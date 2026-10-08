import { describe, expect, it } from "vitest";
import { knipWav, leesWav, naarMono, wavKop } from "./geluid";

/** Een WAV van `sec` seconden, met elke sample zijn eigen nummer, zodat een verschoven knip opvalt. */
function maakWav(sec: number, freq = 8000, kanalen = 1, bits = 16): ArrayBuffer {
  const n = sec * freq * kanalen;
  const data = new DataView(new ArrayBuffer(n * (bits / 8)));
  for (let i = 0; i < n; i++) data.setInt16(i * 2, i % 30000, true);
  const kop = new Uint8Array(wavKop(kanalen, freq, bits, data.byteLength));
  const uit = new Uint8Array(kop.length + data.byteLength);
  uit.set(kop, 0);
  uit.set(new Uint8Array(data.buffer), kop.length);
  return uit.buffer;
}

describe("WAV knippen zonder decoderen", () => {
  it("leest de kop die hij zelf schrijft", () => {
    expect(leesWav(maakWav(2))).toEqual({ kanalen: 1, samplefrequentie: 8000, bits: 16, dataBegin: 44, dataLengte: 32000 });
  });

  it("weigert wat geen WAV is", () => {
    expect(leesWav(new TextEncoder().encode("dit is een mp3, echt waar, met genoeg tekst erin").buffer)).toBeNull();
  });

  it("knipt in stukken van vijf minuten, elk een geldig bestand, zonder gat of overlap", async () => {
    const stukken = knipWav(maakWav(12 * 60));
    expect(stukken.map((s) => s.duurSec)).toEqual([300, 300, 120]);
    expect(stukken.map((s) => s.beginSec)).toEqual([0, 300, 600]);
    const tweede = await stukken[1]!.blob.arrayBuffer();
    const f = leesWav(tweede)!;
    expect(f.dataLengte).toBe(300 * 8000 * 2);
    // De eerste sample van stuk twee is sample 2.400.000 van het geheel.
    expect(new DataView(tweede).getInt16(f.dataBegin, true)).toBe((300 * 8000) % 30000);
  });

  it("houdt een stuk onder de bytegrens, ook bij een grote samplefrequentie", () => {
    // 44,1 kHz stereo: vijf minuten zou 53 MB zijn, ver boven wat OpenAI aanneemt.
    const stukken = knipWav(maakWav(60, 44100, 2), 300, 2_000_000);
    for (const s of stukken) expect(s.blob.size).toBeLessThanOrEqual(2_000_000);
    expect(stukken.reduce((t, s) => t + s.duurSec, 0)).toBeCloseTo(60, 5);
  });

  it("knipt nooit midden in een sample", () => {
    const stukken = knipWav(maakWav(10, 44100, 2), 300, 100_003);
    for (const s of stukken.slice(0, -1)) expect((s.blob.size - 44) % 4).toBe(0);
  });
});

describe("naarMono", () => {
  it("middelt de kanalen", () => {
    expect(Array.from(naarMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
  });
});

/**
 * Een foto van een slide verkleinen voor hij naar boven gaat. Een telefoon
 * maakt twaalf megapixel; om de tekst op een slide te lezen is een lange zijde
 * van tweeduizend punten ruim genoeg, en dan is het bestand een tiende zo groot.
 * Dat telt in een congreszaal met een overbelaste wifi.
 */
export const MAX_ZIJDE = 2000;

export function nieuweMaat(breed: number, hoog: number, max = MAX_ZIJDE): { breed: number; hoog: number } {
  const f = Math.min(1, max / Math.max(breed, hoog));
  return { breed: Math.round(breed * f), hoog: Math.round(hoog * f) };
}

export async function verklein(bestand: Blob): Promise<Blob> {
  try {
    const beeld = await createImageBitmap(bestand);
    const { breed, hoog } = nieuweMaat(beeld.width, beeld.height);
    const doek = document.createElement("canvas");
    doek.width = breed;
    doek.height = hoog;
    doek.getContext("2d")?.drawImage(beeld, 0, 0, breed, hoog);
    beeld.close();
    const uit = await new Promise<Blob | null>((k) => doek.toBlob(k, "image/jpeg", 0.85));
    return uit ?? bestand;
  } catch {
    // Kan de browser het beeld niet openen, dan het origineel; de server leest dat ook.
    return bestand;
  }
}

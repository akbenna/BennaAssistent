/**
 * Kleine hulp bij het transcript zoals de server het opmaakt: elke regel begint
 * met een tijd tussen haken, "[12:34]" of "[1:02:03]".
 */

/** Het transcript bij een moment: de laatste regel die op of vóór die seconde begint. */
export function regelBij(transcript: string, sec: number): string {
  let gevonden = "";
  for (const r of transcript.split("\n")) {
    const m = r.match(/^\[(?:(\d+):)?(\d+):(\d{2})\]/);
    if (!m) continue;
    const t = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (t > sec) break;
    gevonden = r;
  }
  return gevonden;
}

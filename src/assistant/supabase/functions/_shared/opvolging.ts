/**
 * WAT ER NA EEN OVERLEG DE DEUR UIT GAAT
 *
 * Twee mails, allebei als concept in Gmail en nooit vanzelf verstuurd:
 *
 * - het verslag aan de deelnemers: kort wat er besproken is, de besluiten,
 *   per persoon wat hij of zij toezegde, en de vervolgafspraken;
 * - een herinnering aan één persoon over één toezegging.
 *
 * Geen taalmodel: de inhoud staat al in de notitie, en een verslag dat een
 * model herschrijft, kan iets anders zeggen dan wat er nagelezen is. De toon
 * is zakelijk en vriendelijk; wie het anders wil, past het concept aan.
 */
import type { Actiepunt, Uitkomst } from "./notities.ts";

export interface Deelnemer { email: string; naam: string }

const datumNl = (d: string) => {
  const t = new Date(d.length === 10 ? `${d}T12:00:00Z` : d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });
};
const voornaam = (naam: string) => naam.trim().split(/\s+/)[0] ?? naam;

/** De eerste alinea van de samenvatting: een verslag per mail hoort kort te zijn. */
export function eersteAlinea(tekst: string): string {
  return (tekst.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) ?? "").slice(0, 1500);
}

export function verslagMail(o: { titel: string; datum: string; r: Uitkomst; mijnNaam: string }): { onderwerp: string; tekst: string } {
  const { r } = o;
  const delen: string[] = [`Beste allen,`, ``, `Hierbij het korte verslag van ${o.titel} op ${datumNl(o.datum)}.`, ``, eersteAlinea(r.samenvatting)];
  if (r.besluiten.length) delen.push(``, `Besluiten`, ...r.besluiten.map((b) => `- ${b}`));
  const acties = r.actiepunten.filter((a) => a.wat);
  if (acties.length) {
    delen.push(``, `Actiepunten`);
    const perPersoon = new Map<string, Actiepunt[]>();
    for (const a of acties) {
      const wie = a.van_mij ? o.mijnNaam : a.wie || "Nog te verdelen";
      perPersoon.set(wie, [...(perPersoon.get(wie) ?? []), a]);
    }
    for (const [wie, lijst] of perPersoon) {
      delen.push(`${wie}:`, ...lijst.map((a) => `- ${a.wat}${a.deadline ? ` (vóór ${datumNl(a.deadline)})` : ""}`));
    }
  }
  if (r.afspraken.length) {
    delen.push(``, `Vervolgafspraken`, ...r.afspraken.map((a) => `- ${datumNl(a.datum)}${a.begintijd ? ` om ${a.begintijd}` : ""}: ${a.wat}${a.locatie ? `, ${a.locatie}` : ""}`));
  }
  if (r.open_vragen.length) delen.push(``, `Nog open`, ...r.open_vragen.map((v) => `- ${v}`));
  delen.push(``, `Klopt er iets niet of mis je iets, laat het me weten.`, ``, `Met vriendelijke groet,`, o.mijnNaam);
  return { onderwerp: `Verslag: ${o.titel} (${datumNl(o.datum)})`, tekst: delen.join("\n") };
}

export function herinneringMail(o: { a: Actiepunt; titel: string; datum: string; mijnNaam: string }): { onderwerp: string; tekst: string } {
  const aanhef = o.a.wie && !/onbekend/i.test(o.a.wie) ? `Beste ${voornaam(o.a.wie)},` : "Beste,";
  const termijn = o.a.deadline ? `, met als streefdatum ${datumNl(o.a.deadline)}` : "";
  return {
    onderwerp: `Herinnering: ${o.a.wat.slice(0, 80)}`,
    tekst: [
      aanhef, ``,
      `In ${o.titel} op ${datumNl(o.datum)} spraken we af dat jij dit oppakt${termijn}:`,
      ``, `${o.a.wat}`, ``,
      `Hoe staat het ermee? Als het al geregeld is, hoor ik het graag; als er iets nodig is van mijn kant ook.`,
      ``, `Met vriendelijke groet,`, o.mijnNaam,
    ].join("\n"),
  };
}

const klein = (s: string) => s.toLocaleLowerCase("nl").normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Het adres van wie een toezegging deed, uit de genodigden van de afspraak.
 * Alleen bij een eenduidige match op naam; bij twijfel geen adres, dan vul
 * je het zelf in. Een verkeerde ontvanger is erger dan geen.
 */
export function adresVoor(wie: string, deelnemers: Deelnemer[]): string | null {
  const w = klein(wie).split(/[^\p{L}]+/u).filter((x) => x.length >= 2);
  if (!w.length) return null;
  const raak = deelnemers.filter((d) => {
    const n = klein(`${d.naam} ${d.email.split("@")[0]!.replace(/[._-]+/g, " ")}`).split(/[^\p{L}]+/u);
    return w.every((x) => n.includes(x));
  });
  return raak.length === 1 ? raak[0]!.email : null;
}

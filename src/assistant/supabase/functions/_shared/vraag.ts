/**
 * EEN VRAAG AAN JE NOTITIES
 *
 * Twee stappen, en de eerste is geen taalmodel. Postgres zoekt de notities die
 * het best bij de vraag passen; daarvan gaan de samenvatting, de besluiten en
 * de stukken transcript waar de woorden van de vraag in vallen naar het model.
 * Het model antwoordt alleen uit wat het krijgt en wijst bij elke bewering de
 * notitie aan. Staat het er niet in, dan zegt het dat: een notitieboek dat
 * verzint wat er besproken is, is erger dan geen notitieboek.
 */
import type { Aantekening, Uitkomst } from "./notities.ts";

export interface NotitieVoorVraag {
  id: string;
  titel: string | null;
  gestart_op: string;
  soort: string;
  project: string | null;
  samenvatting: Uitkomst | null;
  invoer: string | null;
  aantekeningen: Aantekening[];
  transcript: string | null;
}

const STOP = new Set(["wat", "wie", "waar", "wanneer", "waarom", "hoe", "welke", "hebben", "heeft", "was", "waren", "zijn", "over", "met", "voor", "naar", "door", "die", "dat", "deze", "dit", "een", "het", "de", "en", "of", "ook", "nog", "wel", "niet", "maar", "toen", "vorig", "vorige", "jaar", "keer", "laatst", "laatste", "we", "wij", "ik", "mij", "mijn", "ons", "onze", "afgesproken", "besproken", "gezegd"]);

/** De woorden van de vraag waarop we in een transcript zoeken: stammen van vijf letters. */
export function zoektermen(vraag: string): string[] {
  const uit = new Set<string>();
  for (const w of vraag.toLocaleLowerCase("nl").normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3 || STOP.has(w)) continue;
    uit.add(w.length > 6 ? w.slice(0, 5) : w);
  }
  return [...uit].slice(0, 12);
}

/**
 * De regels van een transcript waarin een zoekterm valt, met één regel
 * ervoor en erna, tot het maximum. Wat aaneensluit wordt één stuk; tussen
 * twee stukken staat "…" zodat het model weet dat er iets tussen zat.
 */
export function fragmenten(tekst: string, termen: string[], max = 2500): string {
  if (!tekst || !termen.length) return "";
  const regels = tekst.split("\n");
  const plat = regels.map((r) => r.toLocaleLowerCase("nl").normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  const raak = new Set<number>();
  plat.forEach((r, i) => { if (termen.some((t) => r.includes(t))) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < regels.length) raak.add(j); });
  const uit: string[] = [];
  let lengte = 0, vorige = -2;
  for (const i of [...raak].sort((a, b) => a - b)) {
    const r = regels[i]!.trim();
    if (!r) continue;
    const stuk = (i !== vorige + 1 && uit.length ? "…\n" : "") + r;
    if (lengte + stuk.length > max) break;
    uit.push(stuk);
    lengte += stuk.length + 1;
    vorige = i;
  }
  return uit.join("\n");
}

const datumNl = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

/** De notities zoals het model ze krijgt, genummerd vanaf 1. */
export function vraagContext(notities: NotitieVoorVraag[], vraag: string): string {
  const termen = zoektermen(vraag);
  return notities.map((n, i) => {
    const r = n.samenvatting;
    const delen = [
      `[${i + 1}] ${n.titel ?? r?.titel ?? "Notitie"}, ${datumNl(n.gestart_op)}${n.project ? `, project ${n.project}` : ""} (${n.soort})`,
      r?.samenvatting && `Samenvatting: ${r.samenvatting.slice(0, 2500)}`,
      r?.besluiten?.length && `Besluiten: ${r.besluiten.join("; ")}`,
      r?.actiepunten?.length && `Actiepunten: ${r.actiepunten.map((a) => `${a.wie}: ${a.wat}${a.deadline ? ` (vóór ${a.deadline})` : ""}`).join("; ")}`,
      r?.afspraken?.length && `Afspraken: ${r.afspraken.map((a) => `${a.datum} ${a.wat}`).join("; ")}`,
      r?.open_vragen?.length && `Open vragen: ${r.open_vragen.join("; ")}`,
      n.invoer?.trim() && `Eigen notitie: ${n.invoer.trim().slice(0, 2000)}`,
      n.aantekeningen?.length && `Eigen aantekeningen: ${n.aantekeningen.map((a) => a.tekst).join("; ")}`,
    ];
    const f = fragmenten(n.transcript ?? "", termen);
    if (f) delen.push(`Uit het transcript:\n${f}`);
    return delen.filter(Boolean).join("\n");
  }).join("\n\n");
}

export const VRAAG_SYSTEEM = `Je beantwoordt een vraag van dr. Bennaghmouch (huisarts, kaderarts CVRM, bestuurder) uit zijn eigen notities van vergaderingen, congressen, telefoongesprekken en losse notities. Je krijgt de best passende notities, genummerd.

Regels:
- Antwoord uitsluitend uit deze notities. Wat er niet in staat, weet je niet; zeg dat dan ronduit en zet gevonden op false. Vul niet aan uit eigen kennis.
- Schrijf het antwoord als korte, heldere lopende tekst in het Nederlands, zonder opsomming tenzij de vraag om een lijst vraagt.
- Zet achter elke bewering het nummer van de notitie tussen haken, bijvoorbeeld [2]. Noem bij een afspraak of besluit de datum van het overleg.
- Spreken twee notities elkaar tegen, of is iets later herzien, zeg dat dan en geef de nieuwste het laatste woord.
- Neem bij bronnen per gebruikte notitie het nummer en een letterlijk citaat van hooguit twee zinnen op uit de tekst die je kreeg.`;

export const vraagSchema = {
  type: "object",
  additionalProperties: false,
  required: ["antwoord", "gevonden", "bronnen"],
  properties: {
    antwoord: { type: "string", description: "Het antwoord, met [n] achter elke bewering." },
    gevonden: { type: "boolean", description: "false als het antwoord niet in de notities staat." },
    bronnen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nummer", "citaat"],
        properties: {
          nummer: { type: "integer", description: "Het nummer van de notitie." },
          citaat: { type: "string", description: "Letterlijk uit de notitie, hooguit twee zinnen." },
        },
      },
    },
  },
};

export interface Antwoord {
  antwoord: string;
  gevonden: boolean;
  bronnen: Array<{ id: string; titel: string; datum: string; citaat: string }>;
}

/** Wat het model teruggeeft, met nummers vertaald naar notities en verzonnen nummers eruit. */
export function trekAntwoordRecht(ruw: unknown, notities: NotitieVoorVraag[]): Antwoord {
  const o = (ruw ?? {}) as Record<string, unknown>;
  const gezien = new Set<string>();
  const bronnen: Antwoord["bronnen"] = [];
  for (const b of Array.isArray(o.bronnen) ? o.bronnen : []) {
    const x = (b ?? {}) as Record<string, unknown>;
    const n = notities[Number(x.nummer) - 1];
    if (!n || gezien.has(n.id)) continue;
    gezien.add(n.id);
    bronnen.push({ id: n.id, titel: n.titel ?? n.samenvatting?.titel ?? "Notitie", datum: n.gestart_op, citaat: typeof x.citaat === "string" ? x.citaat.slice(0, 500) : "" });
  }
  const antwoord = typeof o.antwoord === "string" ? o.antwoord.trim().slice(0, 6000) : "";
  return { antwoord: antwoord || "Daar vond ik niets over in je notities.", gevonden: o.gevonden === true && bronnen.length > 0, bronnen };
}

/**
 * HET NASCHOLINGSLOGBOEK
 *
 * Elke congresnotitie is ook een bewijs dat je er was en wat je meenam. Hier
 * wordt dat per jaar opgeteld en als bestand meegegeven. Wat telt voor de
 * herregistratie is wat de organisator in GAIA bijschrijft; dit logboek is
 * je eigen administratie ernaast, met de inhoud erbij die GAIA niet heeft.
 */
import type { NascholingRegel, Oordeel } from "../types/db";

export interface Totalen {
  aantal: number;
  uren: number;
  punten: number;
  /** Congressen waar je nog geen punten bij hebt ingevuld. */
  zonderPunten: number;
}

const uur = (sec: number | null) => (sec && sec > 0 ? sec / 3600 : 0);

export function totalen(regels: NascholingRegel[]): Totalen {
  return {
    aantal: regels.length,
    uren: Math.round(regels.reduce((t, r) => t + uur(r.duur_sec), 0) * 10) / 10,
    punten: regels.reduce((t, r) => t + (r.nascholing_punten ?? 0), 0),
    zonderPunten: regels.filter((r) => r.nascholing_punten == null).length,
  };
}

/** "3 bevestigd, 1 genuanceerd" uit de nagezochte bronnen, of leeg. */
export function bronOordelen(r: NascholingRegel): string {
  const tel = new Map<Oordeel, number>();
  for (const b of r.verdieping?.bronnen ?? []) tel.set(b.oordeel, (tel.get(b.oordeel) ?? 0) + 1);
  return (["bevestigd", "genuanceerd", "afwijkend", "niet te beoordelen"] as Oordeel[])
    .filter((o) => tel.get(o)).map((o) => `${tel.get(o)} ${o}`).join(", ");
}

const datum = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
const getal = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/**
 * Puntkomma's en een BOM: zo opent Excel het in een Nederlandse instelling
 * zonder importstap. Velden met een puntkomma, aanhalingsteken of regeleinde
 * gaan tussen aanhalingstekens. Een cel die met = + - of @ begint krijgt een
 * apostrof, anders voert Excel hem uit als formule.
 */
export function naarCsv(regels: NascholingRegel[]): string {
  const veld = (v: string) => {
    const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const kop = ["Datum", "Titel", "Organisator", "Uren (opname)", "Accreditatiepunten", "Onderwerpen", "Relevantie voor de praktijk", "Bronnen nagezocht"];
  const rijen = regels.map((r) => [
    datum(r.gestart_op), r.titel ?? "", r.nascholing_organisator ?? "", r.duur_sec ? getal(uur(r.duur_sec)) : "",
    r.nascholing_punten != null ? getal(r.nascholing_punten) : "",
    (r.samenvatting?.presentaties ?? []).map((p) => p.onderwerp).filter(Boolean).join(" | "),
    (r.samenvatting?.relevantie_praktijk ?? "").replace(/\s+/g, " ").trim(),
    bronOordelen(r),
  ]);
  return "﻿" + [kop, ...rijen].map((r) => r.map(veld).join(";")).join("\r\n") + "\r\n";
}

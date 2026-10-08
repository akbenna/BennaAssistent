/**
 * VOORBEREIDING VÓÓR EEN OVERLEG
 *
 * Wie om tien uur het bestuur heeft, wil om vijf voor tien weten wat er de
 * vorige keer is besloten, wat er nog openstaat en wat je zelf zou doen. Dat
 * staat allemaal al in de eerdere notities van hetzelfde project; hier wordt
 * het alleen bij elkaar gezet. Geen taalmodel: het is opzoeken, geen
 * samenvatten, en dus gratis, direct en zonder iets te verzinnen.
 */
import type { Opname, Project, TaakRij } from "../types/db";

const klein = (s: string) => s.toLocaleLowerCase("nl").normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Welk project hoort bij deze afspraak? Eerst de projectnaam als geheel woord
 * in de titel, dan een trefwoord. Een kort trefwoord ("ALV") mag niet midden
 * in een ander woord vallen, anders hoort "Calvijn" bij de ledenvergadering.
 */
export function projectVoorAfspraak<P extends Pick<Project, "id" | "naam" | "trefwoorden">>(projecten: P[], titel: string): P | null {
  const t = ` ${klein(titel).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const heeft = (w: string) => {
    const k = klein(w).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return k.length >= 2 && t.includes(` ${k} `);
  };
  return projecten.find((p) => heeft(p.naam))
    ?? projecten.find((p) => (p.trefwoorden ?? []).some(heeft))
    ?? null;
}

export type VorigeNotitie = Pick<Opname, "id" | "titel" | "gestart_op" | "samenvatting" | "item_id">;

export interface Voorbereiding {
  vorige: { id: string; titel: string; datum: string } | null;
  besluiten: string[];
  open_vragen: string[];
  mijn_vervolgstappen: string[];
  /** Taken uit eerdere overleggen die nog niet af zijn. */
  taken: TaakRij[];
  aantalNotities: number;
}

const NIET_AF = new Set(["voorstel", "open", "wacht_op_antwoord", "antwoord_binnen"]);

/**
 * Besluiten komen alleen uit het laatste overleg: wat daarvoor besloten werd,
 * is inmiddels uitgevoerd of herzien. Open vragen en eigen vervolgstappen
 * stapelen wel op, want die verdwijnen niet vanzelf, maar elk maar één keer.
 */
export function maakVoorbereiding(notities: VorigeNotitie[], taken: TaakRij[]): Voorbereiding {
  const op = [...notities].sort((a, b) => b.gestart_op.localeCompare(a.gestart_op));
  const laatste = op[0] ?? null;
  const uniek = (veld: "open_vragen" | "mijn_vervolgstappen") => {
    const gezien = new Set<string>();
    const uit: string[] = [];
    for (const n of op) for (const r of n.samenvatting?.[veld] ?? []) {
      const k = klein(r).trim();
      if (k && !gezien.has(k)) { gezien.add(k); uit.push(r); }
    }
    return uit.slice(0, 8);
  };
  const takenGezien = new Set<string>();
  return {
    vorige: laatste ? { id: laatste.id, titel: laatste.titel ?? laatste.samenvatting?.titel ?? "Vorig overleg", datum: laatste.gestart_op } : null,
    besluiten: (laatste?.samenvatting?.besluiten ?? []).slice(0, 8),
    open_vragen: uniek("open_vragen"),
    mijn_vervolgstappen: uniek("mijn_vervolgstappen"),
    taken: taken.filter((t) => NIET_AF.has(t.status) && !takenGezien.has(t.id) && takenGezien.add(t.id)),
    aantalNotities: op.length,
  };
}

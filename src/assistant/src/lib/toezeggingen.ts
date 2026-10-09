/**
 * WAT ANDEREN NOG MOETEN DOEN
 *
 * Elke notitie heeft actiepunten van anderen: wat de penningmeester, de POH of
 * de zorggroep toezegde. Hier staan ze bij elkaar, per persoon, de oudste en
 * de verlopen bovenaan. Wat je afvinkt, verdwijnt; een herinnering laat een
 * spoor achter, zodat je ziet dat je er al een stuurde.
 */
import type { Actiepunt, Opname } from "../types/db";

export type NotitieMetActies = Pick<Opname, "id" | "titel" | "gestart_op" | "samenvatting">;

export interface Toezegging {
  notitieId: string;
  notitieTitel: string;
  datum: string;
  index: number;
  actie: Actiepunt;
  /** Dagen tot de deadline; negatief is verlopen, null zonder deadline. */
  dagenTot: number | null;
}

const dagen = (van: Date, tot: string) => {
  const t = new Date(`${tot}T12:00:00Z`);
  return Number.isNaN(t.getTime()) ? null : Math.round((t.getTime() - van.getTime()) / 86_400_000);
};

export function openToezeggingen(notities: NotitieMetActies[], nu = new Date()): Array<{ wie: string; lijst: Toezegging[] }> {
  const alle: Toezegging[] = [];
  for (const n of notities) {
    (n.samenvatting?.actiepunten ?? []).forEach((a, index) => {
      if (a.van_mij || a.afgehandeld || !a.wat) return;
      alle.push({
        notitieId: n.id, notitieTitel: n.titel ?? n.samenvatting?.titel ?? "Overleg", datum: n.gestart_op, index, actie: a,
        dagenTot: a.deadline ? dagen(nu, a.deadline) : null,
      });
    });
  }
  // Verlopen eerst, dan op deadline, dan de oudste toezegging zonder deadline.
  const sorteer = (x: Toezegging, y: Toezegging) =>
    (x.dagenTot ?? Infinity) - (y.dagenTot ?? Infinity) || x.datum.localeCompare(y.datum);
  const perPersoon = new Map<string, Toezegging[]>();
  for (const t of alle.sort(sorteer)) {
    const wie = t.actie.wie?.trim() || "Onbekend";
    perPersoon.set(wie, [...(perPersoon.get(wie) ?? []), t]);
  }
  return [...perPersoon].map(([wie, lijst]) => ({ wie, lijst }))
    .sort((a, b) => sorteer(a.lijst[0]!, b.lijst[0]!));
}

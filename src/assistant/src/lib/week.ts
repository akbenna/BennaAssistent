import type { Weekoverzicht } from "../types/db";

type Deadline = NonNullable<Weekoverzicht["deadlines"]>[number];

/** Maandag en zondag van de week waarin `datum` valt. */
export function weekVan(datum: string): { maandag: string; zondag: string } {
  const d = new Date(`${datum}T12:00:00Z`);
  const maandag = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  const zondag = new Date(maandag.getTime() + 6 * 86400000);
  return { maandag: maandag.toISOString().slice(0, 10), zondag: zondag.toISOString().slice(0, 10) };
}

/*
 * Het weekoverzicht wordt op maandag gemaakt, maar de deadlines erin moeten de
 * hele week kloppen: een taak die woensdag wordt afgerond hoort er donderdag
 * niet meer in te staan, en een taak die dinsdag binnenkomt met een deadline
 * op vrijdag wel. Dus de deadlines komen uit de taken van nu; de rest van de
 * momentopname blijft staan.
 *
 * Taken die het terugkerend onderhoud zelf heeft aangemaakt staan al onder
 * onderhoud, met hun link. Die laten we hier weg, anders staan ze er twee keer.
 */
export function metActueleDeadlines(
  momentopname: Weekoverzicht | null,
  week: { maandag: string; zondag: string },
  taken: Deadline[],
): Weekoverzicht {
  const basis = momentopname ?? { ...week };
  const onderhoud = new Set((basis.onderhoud ?? []).map((o) => o.titel));
  return {
    ...basis,
    deadlines: taken.filter((t) => !onderhoud.has(t.titel)),
  };
}

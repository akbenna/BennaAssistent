/**
 * DAG, NACHT, OF WAT HET TOESTEL ZEGT
 *
 * Drie standen, één kenmerk op <html>. Staat er niets, dan geldt de mediaquery
 * in `app.css` en volgt de app het toestel. Staat er `data-thema="donker"` of
 * `"licht"`, dan is dat de gedwongen stand, ook op een toestel dat het anders
 * wil.
 *
 * De keuze staat in localStorage en wordt vóór de eerste render gezet (zie
 * `main.tsx`), anders flitst er een licht scherm voor een donker scherm langs.
 */

export type Thema = "auto" | "licht" | "donker";

const SLEUTEL = "benna-thema";

export function huidigThema(): Thema {
  try {
    const v = localStorage.getItem(SLEUTEL);
    if (v === "licht" || v === "donker") return v;
  } catch {
    /* privémodus, geblokkeerde opslag: dan gewoon auto. */
  }
  return "auto";
}

export function zetThema(t: Thema): void {
  const wortel = document.documentElement;
  if (t === "auto") wortel.removeAttribute("data-thema");
  else wortel.setAttribute("data-thema", t);
  try {
    if (t === "auto") localStorage.removeItem(SLEUTEL);
    else localStorage.setItem(SLEUTEL, t);
  } catch {
    /* Niet kunnen onthouden is geen reden om de wissel niet te doen. */
  }
}

/** Draait de drie standen rond: auto → licht → donker → auto. */
export function volgendThema(t: Thema): Thema {
  return t === "auto" ? "licht" : t === "licht" ? "donker" : "auto";
}

export const THEMA_LABEL: Record<Thema, string> = {
  auto: "Thema volgt je toestel",
  licht: "Thema staat op licht",
  donker: "Thema staat op donker",
};

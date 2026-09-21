/**
 * DE MOTIEVEN OP DE HERO: getekend, en bijna onzichtbaar
 *
 * Overgenomen uit BennaHealth (`achtergronden.tsx`), met dezelfde afweging. Een
 * foto draagt zijn eigen helderheid mee: wat op een lichte ondergrond een rustig
 * motief is, is op een donkere een lichtvlek. Twee bestanden maken verdubbelt
 * het probleem zonder het op te lossen.
 *
 * Deze vormen staan in `currentColor` en nemen dus de kleur van hun omgeving
 * over. De dekking komt uit `--sfeer` maal de `fill-opacity` per laag; dat
 * product landt rond de acht procent. Daarboven begint de kleine tekst eronder
 * contrast te verliezen.
 *
 * De vormen lopen links en rechts het vlak uit. Een motief dat helemaal in beeld
 * staat leest als een plaatje; afgesneden leest het als achtergrond.
 */
import type { ReactNode } from "react";

export type SfeerSoort = "golf" | "heuvel" | "blad";

const doek = (kinderen: ReactNode) => (
  <svg className="sfeer" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice"
    fill="currentColor" aria-hidden="true" focusable="false"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
    {kinderen}
  </svg>
);

const VORMEN: Record<SfeerSoort, () => ReactNode> = {
  /* Golven die doorlopen: bij een reeks, een stroom berichten. */
  golf: () => doek(
    <>
      <path d="M-20 134C57 78 116 90 178 122c68 35 124 30 242-39v137H-20Z" fillOpacity="0.16" />
      <path d="M-20 154C60 101 120 112 183 143c71 35 126 27 237-35v92H-20Z" fillOpacity="0.10" />
      <path d="M-20 130C58 75 116 89 178 120c69 35 126 31 242-38" fill="none" stroke="currentColor"
        strokeWidth="8" strokeLinecap="round" strokeOpacity="0.20" />
    </>,
  ),
  /* Een heuvelrug: bij een stand van zaken, een verloop over dagen. */
  heuvel: () => doek(
    <>
      <path d="M-20 194 94 88c17-16 40-16 56 2l41 45 54-69c18-23 47-25 66-3l109 131Z" fillOpacity="0.15" />
      <path d="M-20 196 68 122c15-13 35-12 49 2l35 36 47-56c16-19 42-20 58-1l163 93Z" fillOpacity="0.09" />
    </>,
  ),
  /* Een blad met nerven, uit de rechterbovenhoek weg: bij rust. */
  blad: () => doek(
    <>
      <path d="M-20 175C55 126 101 51 185 15c26-11 55-18 86-19-20 47-48 88-84 119-52 45-111 67-207 73Z"
        fillOpacity="0.18" />
      <path d="M18 194c61-45 109-103 146-176" fill="none" stroke="currentColor" strokeWidth="7"
        strokeLinecap="round" strokeOpacity="0.22" />
      <path d="M77 166c36-8 68-24 96-48M105 126c31-1 58-8 83-22M131 87c25-5 44-12 63-23"
        fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.14" />
    </>,
  ),
};

export function Sfeer({ soort }: { soort: SfeerSoort }) {
  return <>{VORMEN[soort]()}</>;
}

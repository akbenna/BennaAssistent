import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";

/* ---------- meldingen ---------- */

interface Melding { tekst: string; soort: "gewoon" | "fout"; sleutel: number }
const MeldCtx = createContext<(tekst: string, soort?: "gewoon" | "fout") => void>(() => {});

export function MeldingProvider({ children }: { children: ReactNode }) {
  const [melding, setMelding] = useState<Melding | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const meld = useCallback((tekst: string, soort: "gewoon" | "fout" = "gewoon") => {
    setMelding({ tekst, soort, sleutel: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMelding(null), soort === "fout" ? 6000 : 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <MeldCtx.Provider value={meld}>
      {children}
      {melding && (
        <div className={`melding${melding.soort === "fout" ? " fout" : ""}`} role="status" aria-live="polite">
          {melding.tekst}
        </div>
      )}
    </MeldCtx.Provider>
  );
}

export function useMelding() {
  return useContext(MeldCtx);
}

/* ---------- laden ---------- */

export interface AsyncStand<T> {
  data: T | null;
  laden: boolean;
  fout: string | null;
  herlaad: () => void;
}

export function useAsync<T>(taak: () => Promise<T>, sleutels: unknown[]): AsyncStand<T> {
  const [data, setData] = useState<T | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [ronde, setRonde] = useState(0);
  const taakRef = useRef(taak);
  taakRef.current = taak;

  useEffect(() => {
    let actueel = true;
    setLaden(true);
    taakRef.current()
      .then((d) => { if (actueel) { setData(d); setFout(null); } })
      .catch((e: unknown) => { if (actueel) setFout(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (actueel) setLaden(false); });
    return () => { actueel = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...sleutels, ronde]);

  return { data, laden, fout, herlaad: useCallback(() => setRonde((r) => r + 1), []) };
}

export function Skelet({ aantal = 3 }: { aantal?: number }) {
  return (
    <div className="laden" aria-hidden="true">
      {Array.from({ length: aantal }, (_, i) => <div className="skelet" key={i} />)}
    </div>
  );
}

export function Leeg({ teken = "—", children }: { teken?: string; children: ReactNode }) {
  return (
    <div className="leeg">
      <span className="teken">{teken}</span>
      {children}
    </div>
  );
}

export function Fout({ tekst, opnieuw }: { tekst: string; opnieuw?: () => void }) {
  return (
    <div className="kaart" role="alert">
      <p className="klein" style={{ color: "var(--rood)" }}>{tekst}</p>
      {opnieuw && <button className="knop klein" onClick={opnieuw}>Opnieuw proberen</button>}
    </div>
  );
}

/* ---------- merkjes ---------- */

export function Merkje({ kleur, children }: { kleur?: "accent" | "groen" | "rood" | "blauw"; children: ReactNode }) {
  return <span className={`merkje${kleur ? ` ${kleur}` : ""}`}>{children}</span>;
}

/* ---------- pictogrammen ---------- */

type IcoonProps = { titel?: string };

function svg(pad: ReactNode, { titel }: IcoonProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={titel ? undefined : true}
      role={titel ? "img" : undefined} focusable="false">
      {titel && <title>{titel}</title>}
      {pad}
    </svg>
  );
}

export const Icoon = {
  vandaag: (p: IcoonProps = {}) => svg(<><rect x="3" y="4.5" width="18" height="16" rx="3" /><path d="M8 2.5v4M16 2.5v4M3 9.5h18" /><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" /></>, p),
  inbox: (p: IcoonProps = {}) => svg(<><path d="M3 13.5V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6.5" /><path d="M3 13.5h5l1.5 2.5h5L16 13.5h5v3.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" /></>, p),
  taken: (p: IcoonProps = {}) => svg(<><path d="M9 6h11M9 12h11M9 18h7" /><path d="M4 6l1.2 1.2L7.5 4.8M4 12l1.2 1.2L7.5 10.8M4 18l1.2 1.2L7.5 16.8" /></>, p),
  projecten: (p: IcoonProps = {}) => svg(<path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L11.5 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, p),
  instellingen: (p: IcoonProps = {}) => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></>, p),
  plus: (p: IcoonProps = {}) => svg(<path d="M12 5v14M5 12h14" />, p),
  sluiten: (p: IcoonProps = {}) => svg(<path d="M6 6l12 12M18 6L6 18" />, p),
  mail: (p: IcoonProps = {}) => svg(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7.5l7.3 5a2 2 0 0 0 2.4 0l7.3-5" /></>, p),
  extern: (p: IcoonProps = {}) => svg(<><path d="M14 4h6v6" /><path d="M20 4l-8.5 8.5" /><path d="M19 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5" /></>, p),
  vink: (p: IcoonProps = {}) => svg(<path d="M4.5 12.5l5 5 10-11" />, p),
  klok: (p: IcoonProps = {}) => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>, p),
  terug: (p: IcoonProps = {}) => svg(<path d="M15 5l-7 7 7 7" />, p),
};

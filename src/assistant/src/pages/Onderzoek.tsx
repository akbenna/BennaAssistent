import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Fout, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { haalOnderzoeken, startOnderzoek } from "../lib/data";
import { datumKort } from "../lib/format";
import type { Onderzoek as OnderzoekRij } from "../types/db";

export const FASE_TEKST: Record<OnderzoekRij["fase"], string> = {
  verkennen: "Wordt verkend",
  kiezen: "Wacht op jouw keuze",
  uitwerken: "Wordt uitgewerkt",
  gereed: "Uitgewerkt",
  fout: "Mislukt",
};

export const FASE_KLEUR: Partial<Record<OnderzoekRij["fase"], "amber" | "blauw" | "rood" | "groen">> = {
  verkennen: "blauw", kiezen: "amber", uitwerken: "blauw", fout: "rood",
};

/**
 * DE CONGRES-AGENT
 *
 * Je noemt een congres, de agent zoekt uit wat er gepresenteerd is en legt
 * thema's voor. Jij kiest; hij werkt uit tot notities in je wetenschappelijke
 * database. Dit scherm is het begin en het overzicht.
 */
export function Onderzoek() {
  const [onderwerp, setOnderwerp] = useState("");
  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [bezig, setBezig] = useState(false);
  const lijst = useAsync(() => haalOnderzoeken(), []);
  const naar = useNavigate();
  const meld = useMelding();
  const urlFout = url.trim() && !/^https?:\/\/\S+\.\S+$/i.test(url.trim());

  const start = async () => {
    if (onderwerp.trim().length < 3 || urlFout) return;
    setBezig(true);
    try {
      const id = await startOnderzoek({ onderwerp: onderwerp.trim(), url: url.trim() || null, focus: focus.trim() || null });
      naar(`/onderzoek/${id}`);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
      setBezig(false);
    }
  };

  return (
    <>
      <p style={{ margin: "0 0 0.4rem" }}><Link className="mini" to="/notities">Notities</Link></p>
      <section className="sectie">
        <header><h2>Congres laten uitzoeken</h2></header>
        <form className="kaart snelnotitie" onSubmit={(e) => { e.preventDefault(); void start(); }}>
          <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} maxLength={300} aria-label="Congres"
            placeholder="Bijvoorbeeld ESC Congress 2026, Madrid" />
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Website" aria-invalid={Boolean(urlFout)}
            placeholder="Website van het congres (mag leeg)" />
          <textarea rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={1000} aria-label="Waar let ik op"
            placeholder="Waar wil je in het bijzonder iets over weten? Bijvoorbeeld Lp(a), GLP-1 bij obesitas, hartfalen in de eerste lijn (mag leeg)" />
          <div className="knoprij">
            <button type="submit" className="knop primair" disabled={bezig || onderwerp.trim().length < 3 || Boolean(urlFout)}>
              {bezig ? "Starten…" : "Laat de agent zoeken"}
            </button>
          </div>
          <p className="mini" style={{ margin: 0 }}>
            De agent zoekt het programma, de hotline-sessies, nieuwe richtlijnen en de berichtgeving, en legt je in een paar minuten de thema's voor die ertoe doen voor de eerste lijn. Jij kiest wat hij uitwerkt.
          </p>
        </form>
      </section>

      <section className="sectie">
        <header><h2>Eerder uitgezocht</h2><span className="aantal">{lijst.data?.length || ""}</span></header>
        {lijst.laden && <Skelet />}
        {lijst.fout && <Fout tekst={lijst.fout} opnieuw={lijst.herlaad} />}
        <div className="stapel">
          {(lijst.data ?? []).map((o) => {
            const gekozen = o.themas.filter((t) => t.gekozen).length;
            const klaar = o.themas.filter((t) => t.status === "gereed").length;
            return (
              <Link className="kaart taak" key={o.id} to={`/onderzoek/${o.id}`}>
                <div className="titel">{o.onderwerp}</div>
                <div className="meta">
                  <span className="mini">{datumKort(o.created_at)}{o.themas.length ? ` · ${o.themas.length} thema's` : ""}{gekozen ? ` · ${klaar} van ${gekozen} uitgewerkt` : ""}</span>
                  {o.fase !== "gereed" && <Merkje kleur={FASE_KLEUR[o.fase]}>{FASE_TEKST[o.fase]}</Merkje>}
                </div>
              </Link>
            );
          })}
        </div>
        {!lijst.laden && (lijst.data ?? []).length === 0 && <Leeg teken="●">Nog niets uitgezocht.</Leeg>}
      </section>
    </>
  );
}

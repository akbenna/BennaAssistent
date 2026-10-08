import { useState } from "react";
import { Link } from "react-router-dom";
import { Fout, Leeg, Skelet, useAsync } from "../components/ui";
import { duur } from "../components/Opname";
import { haalNascholing } from "../lib/data";
import { datumKort } from "../lib/format";
import { bronOordelen, naarCsv, totalen } from "../lib/nascholing";

/**
 * NASCHOLING
 *
 * Elke notitie van het soort Congres of webinar, per jaar. Punten en
 * organisator vul je op de notitie zelf in; de uren komen uit de opname en
 * zijn dus de tijd dat je opnam, niet de lengte van het programma.
 */
export function Nascholing() {
  const nu = new Date().getFullYear();
  const [jaar, setJaar] = useState(nu);
  const lijst = useAsync(() => haalNascholing(jaar), [jaar]);
  const t = totalen(lijst.data ?? []);

  const bewaar = () => {
    const blob = new Blob([naarCsv(lijst.data ?? [])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nascholing-${jaar}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <p style={{ margin: "0 0 0.4rem" }}><Link className="mini" to="/notities">Alle notities</Link></p>
      <section className="sectie">
        <header>
          <h2>Nascholingslogboek</h2>
          <span className="aantal">{t.aantal || ""}</span>
        </header>
        <div className="chips geen-print" role="radiogroup" aria-label="Jaar" style={{ marginBottom: "0.6rem" }}>
          {[nu, nu - 1, nu - 2, nu - 3, nu - 4].map((j) => (
            <button type="button" key={j} className={`chip${jaar === j ? " aan" : ""}`} role="radio" aria-checked={jaar === j} onClick={() => setJaar(j)}>{j}</button>
          ))}
        </div>

        <div className="kaart nascholing-totaal">
          <div><b>{t.aantal}</b><span className="mini">bijeenkomsten</span></div>
          <div><b>{String(t.uren).replace(".", ",")}</b><span className="mini">uur opgenomen</span></div>
          <div><b>{String(t.punten).replace(".", ",")}</b><span className="mini">punten ingevuld</span></div>
        </div>
        <p className="mini" style={{ margin: "0.4rem 0 0.8rem" }}>
          Voor de herregistratie als huisarts telt 200 uur geaccrediteerde nascholing in vijf jaar, gemiddeld veertig per jaar, zoals die in GAIA staat.
          {t.zonderPunten > 0 && ` Bij ${t.zonderPunten} ${t.zonderPunten === 1 ? "bijeenkomst" : "bijeenkomsten"} staan nog geen punten; vul ze in op de notitie.`}
        </p>

        {lijst.laden && <Skelet />}
        {lijst.fout && <Fout tekst={lijst.fout} opnieuw={lijst.herlaad} />}
        <div className="stapel">
          {(lijst.data ?? []).map((r) => {
            const oordeel = bronOordelen(r);
            const onderwerpen = (r.samenvatting?.presentaties ?? []).map((p) => p.onderwerp).filter(Boolean);
            return (
              <Link className="kaart taak" key={r.id} to={`/notities/${r.id}`}>
                <div className="titel">{r.titel || "Zonder titel"}</div>
                <div className="meta">
                  <span className="mini">
                    {datumKort(r.gestart_op)}{r.nascholing_organisator ? ` · ${r.nascholing_organisator}` : ""}
                    {r.duur_sec ? ` · ${duur(r.duur_sec)}` : ""}
                    {r.nascholing_punten != null ? ` · ${String(r.nascholing_punten).replace(".", ",")} punten` : " · punten nog invullen"}
                  </span>
                </div>
                {onderwerpen.length > 0 && <p className="mini" style={{ margin: "0.3rem 0 0" }}>{onderwerpen.slice(0, 4).join(" · ")}</p>}
                {r.samenvatting?.relevantie_praktijk && <p className="klein" style={{ margin: "0.3rem 0 0" }}>{r.samenvatting.relevantie_praktijk.slice(0, 280)}{r.samenvatting.relevantie_praktijk.length > 280 ? "…" : ""}</p>}
                {oordeel && <p className="mini" style={{ margin: "0.3rem 0 0" }}>Bronnen nagezocht: {oordeel}</p>}
              </Link>
            );
          })}
        </div>
        {!lijst.laden && t.aantal === 0 && (
          <Leeg teken="●">Geen congressen of webinars in {jaar}. Kies bij het opnemen Congres of webinar, dan komt hij hier vanzelf.</Leeg>
        )}
        {t.aantal > 0 && (
          <div className="knoprij geen-print" style={{ marginTop: "0.8rem", flexWrap: "wrap" }}>
            <button type="button" className="knop" onClick={bewaar}>Bewaar als CSV</button>
            <button type="button" className="knop" onClick={() => window.print()}>Afdrukken of PDF</button>
          </div>
        )}
      </section>
    </>
  );
}

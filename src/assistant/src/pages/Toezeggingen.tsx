import { useState } from "react";
import { Link } from "react-router-dom";
import { Fout, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { haalNotitiesMetActies, notitieMail, werkActiepuntBij } from "../lib/data";
import { datumKort } from "../lib/format";
import { openToezeggingen, type Toezegging } from "../lib/toezeggingen";

const termijn = (t: Toezegging) =>
  t.dagenTot == null ? null
    : t.dagenTot < 0 ? <Merkje kleur="rood">{-t.dagenTot} {t.dagenTot === -1 ? "dag" : "dagen"} over tijd</Merkje>
    : t.dagenTot <= 7 ? <Merkje kleur="amber">vóór {datumKort(t.actie.deadline)}</Merkje>
    : <span className="mini">vóór {datumKort(t.actie.deadline)}</span>;

/**
 * TOEZEGGINGEN
 *
 * Wat anderen in je overleggen op zich namen, per persoon. Een herinnering
 * wordt een concept in Gmail; jij leest het na en verstuurt het.
 */
export function Toezeggingen() {
  const [ronde, setRonde] = useState(0);
  const [bezig, setBezig] = useState<string | null>(null);
  const lijst = useAsync(() => haalNotitiesMetActies(), [ronde]);
  const meld = useMelding();
  const groepen = openToezeggingen(lijst.data ?? []);
  const aantal = groepen.reduce((n, g) => n + g.lijst.length, 0);

  const doe = async (sleutel: string, actie: () => Promise<string | void>) => {
    setBezig(sleutel);
    try { const m = await actie(); if (m) meld(m); setRonde((r) => r + 1); }
    catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
    finally { setBezig(null); }
  };

  return (
    <>
      <p style={{ margin: "0 0 0.4rem" }}><Link className="mini" to="/notities">Notities</Link></p>
      <section className="sectie">
        <header><h2>Toezeggingen van anderen</h2><span className="aantal">{aantal || ""}</span></header>
        {lijst.laden && <Skelet />}
        {lijst.fout && <Fout tekst={lijst.fout} opnieuw={lijst.herlaad} />}
        <div className="stapel">
          {groepen.map((g) => (
            <div className="kaart" key={g.wie}>
              <h3 style={{ margin: "0 0 0.4rem" }}>{g.wie}</h3>
              {g.lijst.map((t) => {
                const sleutel = `${t.notitieId}-${t.index}`;
                return (
                  <div className="toezegging" key={sleutel}>
                    <div className="groei">
                      <div>{t.actie.wat}</div>
                      <div className="meta">
                        {termijn(t)}
                        <Link className="mini" to={`/notities/${t.notitieId}`}>{t.notitieTitel}, {datumKort(t.datum)}</Link>
                        {t.actie.herinnerd_op && <span className="mini">herinnerd op {datumKort(t.actie.herinnerd_op)}</span>}
                      </div>
                    </div>
                    <div className="knoprij">
                      <button type="button" className="knop klein" disabled={bezig === sleutel}
                        onClick={() => void doe(sleutel, async () => {
                          const r = await notitieMail(t.notitieId, "herinnering", t.index);
                          return r.ontvangers.length ? `Herinnering staat als concept in Gmail, aan ${r.ontvangers.join(", ")}.` : "Herinnering staat als concept in Gmail. Vul daar de ontvanger in.";
                        })}>Herinnering</button>
                      <button type="button" className="knop klein kaal" disabled={bezig === sleutel}
                        onClick={() => void doe(sleutel, () => werkActiepuntBij(t.notitieId, t.index, { afgehandeld: true }))}>Afgehandeld</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {!lijst.laden && aantal === 0 && <Leeg teken="●">Niemand hoeft nog iets voor je te doen.</Leeg>}
        <p className="mini">Een herinnering wordt een concept in Gmail. Het adres komt uit de agenda-afspraak, als de naam eenduidig bij een genodigde past; anders vul je het zelf in.</p>
      </section>
    </>
  );
}

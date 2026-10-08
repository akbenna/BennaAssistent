import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Fout, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { haalOnderzoek, verwerkOnderzoek, verwerkOpnames, verwijderOnderzoek, werkOnderzoekBij } from "../lib/data";
import { datumKort, tijdKort } from "../lib/format";
import { FASE_KLEUR, FASE_TEKST } from "./Onderzoek";
import type { Onderzoek, OnderzoekThema } from "../types/db";

const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
const RELEVANTIE_KLEUR = { hoog: "groen", middel: "amber", laag: undefined } as const;
const WERK_TEKST: Record<NonNullable<Onderzoek["werk"]>, string> = {
  verkennen: "De agent verkent het congres. Dat duurt een paar minuten; je kunt het scherm sluiten.",
  antwoorden: "De agent zoekt een antwoord op je vraag…",
  uitwerken: "De agent werkt de gekozen thema's één voor één uit. Elk thema duurt een paar minuten.",
};

/*
 * SAMEN KIEZEN WAT ER UITGEWERKT WORDT
 *
 * Bovenaan wat de agent vond, daaronder de thema's. Vink aan wat je wilt,
 * schrijf erbij wat je er in het bijzonder over wilt weten, en stel vragen.
 * Pas als je op Uitwerken drukt, gaat hij verder; elk thema wordt een eigen
 * notitie, en de publicaties die hij noemt worden nagezocht in PubMed.
 */
export function OnderzoekDetail() {
  const { id = "" } = useParams();
  const [ronde, setRonde] = useState(0);
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const geduwd = useRef(false);
  const o = useAsync(() => haalOnderzoek(id), [id, ronde]);
  const naar = useNavigate();
  const meld = useMelding();
  const d = o.data;

  // Zolang de agent bezig is, elke vijf seconden kijken; en één duw als hij nog niet begonnen is.
  useEffect(() => {
    if (!d?.werk) return;
    if (!d.werk_sinds && !geduwd.current) { geduwd.current = true; void verwerkOnderzoek(); }
    const t = window.setInterval(() => setRonde((r) => r + 1), 5000);
    return () => window.clearInterval(t);
  }, [d?.werk, d?.werk_sinds]);
  useEffect(() => { if (!d?.werk) geduwd.current = false; }, [d?.werk]);
  // Nieuwe notities krijgen hun document en hun PubMed-controle van de notitieverwerking.
  useEffect(() => { if (d?.themas.some((t) => t.status === "gereed")) void verwerkOpnames(); }, [d?.themas.filter((t) => t.status === "gereed").length]);

  if (o.laden && !d) return <Skelet />;
  if (o.fout) return <Fout tekst={o.fout} opnieuw={o.herlaad} />;
  if (!d) return <p className="mini">Dit onderzoek bestaat niet meer. <Link to="/onderzoek">Alle onderzoeken</Link></p>;

  const doe = async (actie: () => Promise<unknown>, bericht?: string) => {
    setBezig(true);
    try { await actie(); if (bericht) meld(bericht); setRonde((r) => r + 1); }
    catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
    finally { setBezig(false); }
  };
  const vergrendeld = Boolean(d.werk) || bezig;
  const zetThema = (tid: string, velden: Partial<OnderzoekThema>) =>
    doe(() => werkOnderzoekBij(d.id, { themas: d.themas.map((t) => t.id === tid ? { ...t, ...velden } : t) }));
  const teDoen = d.themas.filter((t) => t.gekozen && (t.status === null || t.status === "fout"));
  const uitwerken = () => doe(async () => {
    await werkOnderzoekBij(d.id, {
      themas: d.themas.map((t) => t.gekozen && (t.status === null || t.status === "fout") ? { ...t, status: "wacht", fout: undefined } : t),
      fase: "uitwerken", werk: "uitwerken", werk_sinds: null, pogingen: 0, fout: null,
    });
    await verwerkOnderzoek();
  }, `${teDoen.length} ${teDoen.length === 1 ? "thema wordt" : "thema's worden"} uitgewerkt.`);
  const stel = () => {
    const v = vraag.trim();
    if (v.length < 3) return;
    void doe(async () => {
      await werkOnderzoekBij(d.id, { gesprek: [...d.gesprek, { rol: "ik", tekst: v.slice(0, 2000), op: new Date().toISOString() }], werk: "antwoorden", werk_sinds: null, pogingen: 0 });
      setVraag("");
      await verwerkOnderzoek();
    });
  };
  const opnieuw = () => doe(async () => {
    await werkOnderzoekBij(d.id, { fase: "verkennen", werk: "verkennen", werk_sinds: null, pogingen: 0, fout: null });
    await verwerkOnderzoek();
  });
  const verwijder = () => {
    if (!confirm("Dit onderzoek verwijderen? De notities die eruit voortkwamen blijven staan.")) return;
    void doe(async () => { await verwijderOnderzoek(d.id); naar("/onderzoek"); });
  };

  const groepen: Array<[string, OnderzoekThema[]]> = [
    ["Zeer relevant", d.themas.filter((t) => t.relevantie === "hoog")],
    ["Mogelijk relevant", d.themas.filter((t) => t.relevantie === "middel")],
    ["Minder relevant", d.themas.filter((t) => t.relevantie === "laag")],
  ];

  return (
    <>
      <p style={{ margin: "0 0 0.4rem" }}><Link className="mini" to="/onderzoek">Alle onderzoeken</Link></p>
      <h1 className="titelveld" style={{ margin: "0 0 0.2rem" }}>{d.onderwerp}</h1>
      <p className="mini" style={{ margin: "0 0 0.8rem" }}>
        {datumKort(d.created_at)}{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">website</a></>}
        {d.focus && <> · let op: {d.focus}</>}
        {" "}<Merkje kleur={FASE_KLEUR[d.fase]}>{FASE_TEKST[d.fase]}</Merkje>
      </p>

      {d.werk && (
        <div className="kaart" role="status"><Merkje kleur="blauw">Bezig…</Merkje>
          <p className="mini" style={{ margin: "0.5rem 0 0" }}>{WERK_TEKST[d.werk]}</p>
        </div>
      )}
      {d.fout && (
        <div className="kaart" role="alert">
          <p className="klein" style={{ margin: 0, color: "var(--fout)" }}>{d.fase === "fout" ? "Het verkennen mislukte" : "Er ging iets mis"}: {d.fout}</p>
          {d.fase === "fout" && <button type="button" className="knop klein" style={{ marginTop: "0.5rem" }} onClick={() => void opnieuw()} disabled={bezig}>Opnieuw verkennen</button>}
        </div>
      )}

      {d.overzicht && (
        <article className="kaart verslag">
          {d.overzicht.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
        </article>
      )}

      {d.themas.length > 0 && groepen.map(([kop, lijst]) => lijst.length > 0 && (
        <section className="sectie" key={kop}>
          <header><h2>{kop}</h2><span className="aantal">{lijst.length}</span></header>
          <div className="stapel">
            {lijst.map((t) => (
              <div className={`kaart thema${t.gekozen ? " gekozen" : ""}`} key={t.id}>
                <label className="themakop">
                  <input type="checkbox" checked={t.gekozen} disabled={vergrendeld || t.status === "gereed" || t.status === "wacht"}
                    onChange={(e) => void zetThema(t.id, { gekozen: e.target.checked })} />
                  <span className="titel">{t.titel}</span>
                </label>
                <div className="meta">
                  <Merkje kleur={RELEVANTIE_KLEUR[t.relevantie]}>{t.relevantie}</Merkje>
                  <span className="mini">{t.soort}</span>
                  {t.status === "wacht" && <Merkje kleur="blauw">in de wachtrij</Merkje>}
                  {t.status === "gereed" && t.notitie_id && <Link className="mini" to={`/notities/${t.notitie_id}`}>Naar de notitie</Link>}
                  {t.status === "fout" && <Merkje kleur="rood">mislukt</Merkje>}
                </div>
                {t.kern && <p className="klein" style={{ margin: "0.4rem 0 0" }}>{t.kern}</p>}
                {t.wat_gepresenteerd && <p className="klein" style={{ margin: "0.4rem 0 0" }}>{t.wat_gepresenteerd}</p>}
                {t.waarom && <p className="mini" style={{ margin: "0.4rem 0 0" }}>{t.waarom}</p>}
                {t.fout && <p className="mini" style={{ margin: "0.4rem 0 0", color: "var(--fout)" }}>{t.fout}</p>}
                {t.bronnen.length > 0 && (
                  <p className="mini" style={{ margin: "0.4rem 0 0", overflowWrap: "anywhere" }}>
                    {t.bronnen.map((b, i) => <span key={i}>{i > 0 && " · "}<a href={b.url} target="_blank" rel="noreferrer">{b.titel || host(b.url)}</a></span>)}
                  </p>
                )}
                {t.gekozen && t.status !== "gereed" && (
                  <textarea rows={2} className="themaveld" defaultValue={t.opmerking} key={`${t.id}-${t.opmerking}`} maxLength={1000} disabled={vergrendeld}
                    placeholder="Wat wil je hier in het bijzonder over weten? (mag leeg)" aria-label={`Opmerking bij ${t.titel}`}
                    onBlur={(e) => { if (e.target.value.trim() !== t.opmerking) void zetThema(t.id, { opmerking: e.target.value.trim() }); }} />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {d.themas.length > 0 && (
        <div className="knoprij" style={{ margin: "0.8rem 0", flexWrap: "wrap" }}>
          <button type="button" className="knop primair" disabled={vergrendeld || teDoen.length === 0} onClick={() => void uitwerken()}>
            {teDoen.length ? `Werk ${teDoen.length} ${teDoen.length === 1 ? "thema" : "thema's"} uit` : "Kies thema's om uit te werken"}
          </button>
        </div>
      )}

      {(d.themas.length > 0 || d.gesprek.length > 0) && (
        <section className="sectie">
          <header><h2>Bespreken</h2></header>
          <div className="kaart gesprek">
            {d.gesprek.map((b, i) => (
              <div key={i} className={`bericht ${b.rol}`}>
                <p className="mini" style={{ margin: 0 }}>{b.rol === "ik" ? "Jij" : "Agent"} · {tijdKort(b.op)}</p>
                {b.tekst.split(/\n\s*\n/).map((p, j) => <p key={j} style={{ margin: "0.2rem 0 0", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{p}</p>)}
              </div>
            ))}
            <form className="knoprij" onSubmit={(e) => { e.preventDefault(); stel(); }}>
              <input value={vraag} onChange={(e) => setVraag(e.target.value)} maxLength={2000} style={{ flex: 1, minWidth: 0 }} disabled={vergrendeld}
                placeholder="Was er ook iets over Lp(a)? Wat betekent dit voor de NHG-standaard?" aria-label="Vraag aan de agent" />
              <button type="submit" className="knop" disabled={vergrendeld || vraag.trim().length < 3}>Vraag</button>
            </form>
          </div>
        </section>
      )}

      {d.bronnen.length > 0 && (
        <details className="uitleg">
          <summary>Geraadpleegde pagina's ({d.bronnen.length})</summary>
          <ul className="mini">{d.bronnen.map((b, i) => <li key={i} style={{ overflowWrap: "anywhere" }}><a href={b.url} target="_blank" rel="noreferrer">{b.titel}</a></li>)}</ul>
        </details>
      )}

      <div className="knoprij" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
        {d.fase !== "verkennen" && !d.werk && <button type="button" className="knop" onClick={() => void opnieuw()} disabled={bezig}>Opnieuw verkennen</button>}
        <button type="button" className="knop kaal gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</button>
      </div>
      {d.modellen.verbruik && (
        <p className="mini">{d.modellen.verbruik.stappen} {d.modellen.verbruik.stappen === 1 ? "stap" : "stappen"} met zoeken op het web{d.modellen.laatste_dienst ? `, laatst via ${d.modellen.laatste_dienst.split(":")[0]}` : ""}.</p>
      )}
    </>
  );
}

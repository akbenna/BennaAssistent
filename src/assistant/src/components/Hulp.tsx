import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Icoon } from "./ui";
import { HOOFDSTUKKEN, hoofdstukVoor, type Hoofdstuk } from "../lib/handleiding";

/**
 * HET VRAAGTEKEN IN DE KOP
 *
 * Opent de uitleg van de pagina waar je staat. Onderaan staan de andere
 * hoofdstukken, zodat dit ook de hele handleiding is en niet alleen een
 * losse tekstballon.
 *
 * Waarom hier en niet als los document: een handleiding in een apart bestand
 * open je één keer en vind je daarna nooit meer terug. Deze staat op de plek
 * waar de vraag opkomt.
 *
 * Het paneel gaat via een portaal naar `document.body` en niet gewoon hier.
 * De knop staat in de kopbalk, en die draagt een `backdrop-filter`; zo'n filter
 * maakt van het element het referentiekader voor alles wat `position: fixed`
 * is. Zonder portaal klapt het paneel dus dicht tot de hoogte van de balk —
 * zesenvijftig pixels, met de rest van de pagina eronder zichtbaar.
 */
export function HulpKnop() {
  const plek = useLocation();
  const [open, setOpen] = useState(false);
  const [gekozen, setGekozen] = useState<string | null>(null);

  // Van pagina wisselen sluit de uitleg: hij hoort bij waar je was.
  useEffect(() => { setOpen(false); setGekozen(null); }, [plek.pathname]);

  return (
    <>
      <button type="button" className="themaknop" onClick={() => setOpen(true)}
        title="Hoe werkt dit?" aria-label="Hoe werkt dit?">
        {Icoon.vraag({})}
      </button>
      {open && createPortal(
        <HulpPaneel
          pad={gekozen ?? plek.pathname}
          hier={plek.pathname}
          bijKiezen={setGekozen}
          bijSluiten={() => { setOpen(false); setGekozen(null); }}
        />,
        document.body,
      )}
    </>
  );
}

function HulpPaneel({
  pad, hier, bijKiezen, bijSluiten,
}: {
  pad: string;
  /** De pagina waar de gebruiker werkelijk staat; kan een ander hoofdstuk zijn
      dan het hoofdstuk dat hij leest. */
  hier: string;
  bijKiezen: (pad: string) => void;
  bijSluiten: () => void;
}) {
  const hoofdstuk: Hoofdstuk | null = hoofdstukVoor(pad);
  const eigen = hoofdstukVoor(hier);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === "Escape") bijSluiten(); };
    window.addEventListener("keydown", opToets);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", opToets);
      document.body.style.overflow = "";
    };
  }, [bijSluiten]);

  return (
    <div className="paneel-achter" onClick={(e) => { if (e.target === e.currentTarget) bijSluiten(); }}>
      <aside className="paneel" role="dialog" aria-label="Handleiding">
        <header>
          <button className="knop kaal" onClick={bijSluiten} aria-label="Sluiten">{Icoon.sluiten({})}</button>
          <span className="opschrift groei">Handleiding</span>
        </header>

        {hoofdstuk ? (
          <article className="hulp">
            <h2>{hoofdstuk.titel}</h2>
            <p className="kern">{hoofdstuk.kern}</p>
            {/* Alleen tonen als je een ánder hoofdstuk leest dan waar je staat:
                dan is het de weg terug. Op je eigen pagina zegt het niets. */}
            {eigen && eigen.pad !== hoofdstuk.pad && (
              <p className="mini" style={{ marginTop: "0.4rem" }}>
                Je staat zelf op{" "}
                <button type="button" className="alslink" onClick={() => bijKiezen(eigen.pad)}>
                  {eigen.titel}
                </button>.
              </p>
            )}
            {hoofdstuk.delen.map((d) => (
              <section key={d.kop}>
                <h3>{d.kop}</h3>
                {d.tekst.map((regel, i) => <p key={i}>{regel}</p>)}
              </section>
            ))}
          </article>
        ) : (
          <p className="klein">Voor dit scherm is nog geen uitleg geschreven.</p>
        )}

        <nav className="hulpwijzer" aria-label="Alle hoofdstukken">
          <p className="opschrift">Alle onderdelen</p>
          {HOOFDSTUKKEN.map((h) => (
            <button type="button" key={h.pad}
              className={h.pad === hoofdstukVoor(pad)?.pad ? "actief" : ""}
              onClick={() => bijKiezen(h.pad)}>
              <b>{h.titel}</b>
              <span>{h.kern}</span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { TaakPaneel } from "../components/TaakPaneel";
import { datumLang, relatief, tijdKort, vandaag } from "../lib/format";
import { haalDagoverzicht, haalTaken, haalTellingen } from "../lib/data";

export function Vandaag() {
  const [open, setOpen] = useState<string | null>(null);
  const [ronde, setRonde] = useState(0);

  const tellingen = useAsync(() => haalTellingen(), [ronde]);
  const overzicht = useAsync(() => haalDagoverzicht(), [ronde]);
  const nu = useAsync(
    () => haalTaken({ statussen: ["open", "antwoord_binnen"], deadlineTot: vandaag(), limiet: 25 }),
    [ronde],
  );
  const antwoorden = useAsync(() => haalTaken({ statussen: ["antwoord_binnen"], limiet: 25 }), [ronde]);

  const ververs = () => setRonde((r) => r + 1);
  const t = tellingen.data;
  const afspraken = overzicht.data?.afspraken ?? [];

  return (
    <>
      <div className="sectie">
        <p className="opschrift">{datumLang(vandaag())}</p>
        <h1>Vandaag</h1>
        <div className="rij" style={{ flexWrap: "wrap", marginTop: "0.6rem" }}>
          {t && t.voorstellen > 0 && (
            <Link to="/voorstellen" className="merkje accent" style={{ textDecoration: "none" }}>
              {t.voorstellen} voorstel{t.voorstellen === 1 ? "" : "len"}
            </Link>
          )}
          {t && t.antwoord > 0 && <Merkje kleur="groen">{t.antwoord} antwoord binnen</Merkje>}
          {t && t.wachten > 0 && <Merkje kleur="blauw">{t.wachten} wacht op antwoord</Merkje>}
          {t && t.voorstellen === 0 && t.antwoord === 0 && t.wachten === 0 && (
            <span className="mini">Niets dat op je wacht.</span>
          )}
        </div>
      </div>

      <section className="sectie">
        <header>
          <h2>Agenda</h2>
          <span className="aantal">{afspraken.length || ""}</span>
        </header>
        <div className="kaart">
          {overzicht.laden && <Skelet aantal={1} />}
          {!overzicht.laden && !overzicht.data && (
            <p className="mini" style={{ margin: 0 }}>
              Het dagoverzicht van vanochtend is er nog niet. Het wordt elke werkdag om 06.30 uur gemaakt.
            </p>
          )}
          {overzicht.data?.afspraken_fout && (
            <p className="mini" style={{ margin: 0, color: "var(--rood)" }}>
              Agenda kon niet worden gelezen: {overzicht.data.afspraken_fout}
            </p>
          )}
          {afspraken.map((a, i) => (
            <div className="brief-regel" key={`${a.start ?? i}-${a.titel}`}>
              <span className="tijd">{tijdKort(a.start)}</span>
              <span className="groei">
                {a.link ? <a href={a.link} target="_blank" rel="noreferrer">{a.titel}</a> : a.titel}
                {a.locatie && <span className="mini"> · {a.locatie}</span>}
              </span>
            </div>
          ))}
          {overzicht.data && afspraken.length === 0 && !overzicht.data.afspraken_fout && (
            <p className="mini" style={{ margin: 0 }}>Geen afspraken vandaag.</p>
          )}
        </div>
      </section>

      <section className="sectie">
        <header>
          <h2>Nu aan zet</h2>
          <span className="aantal">{nu.data?.length || ""}</span>
        </header>
        {nu.laden && <Skelet />}
        {nu.fout && <Fout tekst={nu.fout} opnieuw={nu.herlaad} />}
        <div className="stapel">
          {(nu.data ?? []).map((taak) => (
            <TaakKaart key={taak.id} taak={taak} bijKlik={() => setOpen(taak.id)} />
          ))}
        </div>
        {!nu.laden && (nu.data ?? []).length === 0 && (
          <Leeg teken="✓">Geen deadline die vandaag verloopt.</Leeg>
        )}
      </section>

      {(antwoorden.data ?? []).length > 0 && (
        <section className="sectie">
          <header>
            <h2>Antwoord binnen</h2>
            <span className="aantal">{antwoorden.data?.length}</span>
          </header>
          <div className="stapel">
            {(antwoorden.data ?? []).map((taak) => (
              <TaakKaart key={taak.id} taak={taak} bijKlik={() => setOpen(taak.id)} />
            ))}
          </div>
        </section>
      )}

      {(overzicht.data?.opvolging_verlopen ?? []).length > 0 && (
        <section className="sectie">
          <header><h2>Hier kwam nooit antwoord op</h2></header>
          <div className="stapel">
            {(overzicht.data?.opvolging_verlopen ?? []).map((f) => (
              <button type="button" className="kaart taak" key={f.task_id} onClick={() => setOpen(f.task_id)}>
                <div className="titel">{f.titel ?? "(taak)"}</div>
                <div className="meta">
                  <Merkje kleur="blauw">{Icoon.klok({})} verstuurd {relatief(f.sinds)}</Merkje>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {open && <TaakPaneel taakId={open} bijSluiten={() => setOpen(null)} bijWijziging={ververs} />}
    </>
  );
}

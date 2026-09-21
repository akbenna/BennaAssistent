import { useState } from "react";
import { Link } from "react-router-dom";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync } from "../components/ui";
import { Sfeer, type SfeerSoort } from "../components/sfeer";
import { TaakKaart } from "../components/TaakKaart";
import { TaakPaneel } from "../components/TaakPaneel";
import { datumLang, deadlineToon, relatief, tijdKort, vandaag } from "../lib/format";
import { haalAfrondingenPerDag, haalDagoverzicht, haalTaken, haalTellingen } from "../lib/data";

/* De groet volgt het uur in Amsterdam en niet dat van de browser: wie vanuit
   een andere tijdzone inlogt kijkt naar een Nederlandse werkdag. */
function groet(): string {
  const uur = Number(new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false,
  }).format(new Date()));
  if (uur < 6) return "Goedenacht";
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}

export function Vandaag() {
  const [open, setOpen] = useState<string | null>(null);
  const [ronde, setRonde] = useState(0);

  const tellingen = useAsync(() => haalTellingen(), [ronde]);
  const overzicht = useAsync(() => haalDagoverzicht(), [ronde]);
  const strook = useAsync(() => haalAfrondingenPerDag(14), [ronde]);
  const nu = useAsync(
    () => haalTaken({ statussen: ["open", "antwoord_binnen"], deadlineTot: vandaag(), limiet: 25 }),
    [ronde],
  );
  const antwoorden = useAsync(() => haalTaken({ statussen: ["antwoord_binnen"], limiet: 25 }), [ronde]);

  const ververs = () => setRonde((r) => r + 1);
  const t = tellingen.data;
  const afspraken = overzicht.data?.afspraken ?? [];
  const verlopen = (nu.data ?? []).filter((x) => deadlineToon(x.deadline) === "verlopen").length;

  /* De kleur van de hero is de stand van zaken, niet de smaak van de dag.
     Rood zodra er iets over tijd is, amber zodra er iets op je ligt te wachten,
     groen als je vandaag iets hebt afgerond en er niets meer ligt. */
  const afgerondVandaag = strook.data?.[strook.data.length - 1]?.aantal ?? 0;
  const ietsTeDoen = (t?.voorstellen ?? 0) + (t?.vandaag ?? 0) + (t?.antwoord ?? 0);
  const stand: "fout" | "let" | "goed" | "rust" =
    verlopen > 0 ? "fout" : ietsTeDoen > 0 ? "let" : afgerondVandaag > 0 ? "goed" : "rust";
  const motief: SfeerSoort = stand === "rust" || stand === "goed" ? "blad" : stand === "let" ? "heuvel" : "golf";

  const meest = Math.max(1, ...(strook.data ?? []).map((d) => d.aantal));

  return (
    <>
      <section className={`hero ${stand}`}>
        <Sfeer soort={motief} />
        <div className="heroboven">
          <div>
            <p className="opschrift" style={{ margin: 0 }}>{groet()}</p>
            <h1 style={{ marginTop: 2 }}>{samenvattingsregel(stand, verlopen, t?.voorstellen ?? 0, afgerondVandaag)}</h1>
            <p className="mini" style={{ margin: "4px 0 0" }}>{datumLang(vandaag())}</p>
          </div>
        </div>

        <div className="herotellers">
          <Link to="/voorstellen" className={`heroteller${(t?.voorstellen ?? 0) > 0 ? " aan" : ""}`}>
            <b>{t?.voorstellen ?? "–"}</b><span>voorstellen</span>
          </Link>
          <Link to="/taken" className={`heroteller${verlopen > 0 ? " aan" : ""}`}>
            <b>{t?.vandaag ?? "–"}</b><span>nu aan zet</span>
          </Link>
          <Link to="/taken" className="heroteller">
            <b>{t?.antwoord ?? "–"}</b><span>antwoord binnen</span>
          </Link>
          <Link to="/taken" className="heroteller">
            <b>{t?.wachten ?? "–"}</b><span>wacht op antwoord</span>
          </Link>
        </div>

        {/* Veertien dagen afrondingen. Eén dag zegt niets. */}
        {(strook.data ?? []).length > 0 && (
          <>
            <div className="strook" aria-hidden="true">
              {(strook.data ?? []).map((d, i) => (
                <i key={d.datum}
                  className={`${d.aantal > 0 ? "iets" : ""}${i === (strook.data?.length ?? 0) - 1 ? " nu" : ""}`}
                  style={{ height: `${Math.max(6, (d.aantal / meest) * 30)}px` }} />
              ))}
            </div>
            <p className="mini" style={{ margin: "6px 0 0" }}>
              veertien dagen · {(strook.data ?? []).reduce((s, d) => s + d.aantal, 0)}× afgerond
            </p>
          </>
        )}
      </section>

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
            <p className="mini" style={{ margin: 0, color: "var(--fout)" }}>
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
            <TaakKaart key={taak.id} taak={taak} bijKlik={() => setOpen(taak.id)} bijWijziging={ververs} />
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
              <TaakKaart key={taak.id} taak={taak} bijKlik={() => setOpen(taak.id)} bijWijziging={ververs} />
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

/* Eén regel die zegt hoe je ervoor staat. Hij vervangt de kop "Vandaag": die
   wist je al, dit niet. */
function samenvattingsregel(
  stand: "fout" | "let" | "goed" | "rust",
  verlopen: number,
  voorstellen: number,
  afgerond: number,
): string {
  if (stand === "fout") {
    return verlopen === 1 ? "Eén deadline is verlopen" : `${verlopen} deadlines zijn verlopen`;
  }
  if (stand === "let") {
    if (voorstellen > 0) {
      return voorstellen === 1 ? "Eén voorstel wacht op je" : `${voorstellen} voorstellen wachten op je`;
    }
    return "Er ligt werk klaar";
  }
  if (stand === "goed") {
    return afgerond === 1 ? "Eén taak afgerond vandaag" : `${afgerond} taken afgerond vandaag`;
  }
  return "Niets dat op je wacht";
}

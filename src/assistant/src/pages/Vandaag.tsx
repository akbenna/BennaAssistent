import { useState } from "react";
import { Link } from "react-router-dom";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync } from "../components/ui";
import { Sfeer, type SfeerSoort } from "../components/sfeer";
import type { Weekoverzicht } from "../types/db";
import { Cockpit } from "../components/Cockpit";
import { OpnameKnop } from "../components/Opname";
import { TaakKaart } from "../components/TaakKaart";
import { TaakPaneel } from "../components/TaakPaneel";
import { datumKort, datumLang, deadlineToon, relatief, tijdKort, vandaag } from "../lib/format";
import { haalAfrondingenPerDag, haalDagoverzicht, haalDocumenten, haalOpnames, haalProjecten, haalTaken, haalTellingen, haalVoorbereiding, haalWeekoverzicht } from "../lib/data";
import { projectVoorAfspraak } from "../lib/voorbereiding";
import type { Project } from "../types/db";

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
  const documenten = useAsync(() => haalDocumenten(6), [ronde]);
  const week = useAsync(() => haalWeekoverzicht(), [ronde]);
  const nu = useAsync(
    () => haalTaken({ statussen: ["open", "antwoord_binnen"], deadlineTot: vandaag(), limiet: 25 }),
    [ronde],
  );
  const antwoorden = useAsync(() => haalTaken({ statussen: ["antwoord_binnen"], limiet: 25 }), [ronde]);
  const projecten = useAsync(() => haalProjecten(), []);
  const [voorbereid, setVoorbereid] = useState<string | null>(null);
  const naTeLezen = useAsync(() => haalOpnames({ statussen: ["gereed", "geweigerd"], limiet: 5 }), [ronde]);

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

        {/* Eén tik vanaf het beginscherm: de app openen en meteen opnemen. Het
            project kiest de assistent zelf uit je agenda en het gesprek. */}
        <OpnameKnop compact />

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

      {(naTeLezen.data ?? []).length > 0 && (
        <section className="sectie">
          <header>
            <h2>Na te lezen</h2>
            <Link className="mini" to="/notities">alle notities</Link>
          </header>
          <div className="kaart">
            {(naTeLezen.data ?? []).map((n) => (
              <div className="brief-regel" key={n.id}>
                <span className="tijd">{datumKort(n.gestart_op)}</span>
                <span className="groei">
                  <Link to={`/notities/${n.id}`}>{n.titel || "Zonder titel"}</Link>
                  <div className="mini">{n.status === "geweigerd" ? "Het privacyfilter wacht op jou" : n.projects?.naam ?? "Klaar om na te lezen"}</div>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {week.data && <Weekstart w={week.data} bijOpenen={setOpen} />}

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
          {afspraken.map((a, i) => {
            const sleutel = `${a.start ?? i}-${a.titel}`;
            const project = projectVoorAfspraak(projecten.data ?? [], a.titel);
            const uitgeklapt = voorbereid === sleutel;
            return (
              <div key={sleutel}>
                <div className="brief-regel">
                  <span className="tijd">{tijdKort(a.start)}</span>
                  <span className="groei">
                    {a.link ? <a href={a.link} target="_blank" rel="noreferrer">{a.titel}</a> : a.titel}
                    {a.locatie && <span className="mini"> · {a.locatie}</span>}
                    {project && <span className="mini"> · {project.naam}</span>}
                  </span>
                  <button type="button" className="knop klein" aria-expanded={uitgeklapt}
                    onClick={() => setVoorbereid(uitgeklapt ? null : sleutel)}>
                    {uitgeklapt ? "Sluit" : "Voorbereiden"}
                  </button>
                </div>
                {uitgeklapt && <VoorbereidingKaart titel={a.titel} project={project} />}
              </div>
            );
          })}
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

      <Cockpit />

      {(documenten.data ?? []).length > 0 && (
        <section className="sectie">
          <header>
            <h2>Documenten</h2>
            <span className="aantal">{documenten.data?.length}</span>
          </header>
          <div className="kaart">
            {(documenten.data ?? []).map((d) => (
              <div className="brief-regel" key={d.id}>
                <span className="tijd">{relatief(d.ontvangen_op)}</span>
                <span className="groei">
                  {d.deeplink
                    ? <a href={d.deeplink} target="_blank" rel="noreferrer">{d.onderwerp}</a>
                    : d.onderwerp}
                  {d.samenvatting && <div className="mini">{d.samenvatting}</div>}
                </span>
              </div>
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

/*
 * DE WEEK IN ÉÉN BLOK
 *
 * Staat boven de agenda en blijft de hele week staan: het wordt op maandag
 * gemaakt en je kijkt er donderdag net zo goed naar. Vier dingen die je
 * nergens anders bij elkaar ziet — wat er aankomt, welk portaalonderhoud
 * verschijnt, wie je nog een antwoord schuldig is, en welke dossiers stil zijn
 * geworden. Dat laatste is waarvoor dit blok bestaat.
 */
function Weekstart({ w, bijOpenen }: { w: Weekoverzicht; bijOpenen: (id: string) => void }) {
  const deadlines = w.deadlines ?? [];
  const onderhoud = w.onderhoud ?? [];
  const wachten = w.wachten ?? [];
  const stil = w.stille_projecten ?? [];
  if (!deadlines.length && !onderhoud.length && !wachten.length && !stil.length) return null;

  return (
    <section className="sectie">
      <header>
        <h2>Deze week</h2>
        <span className="aantal">{datumKort(w.maandag)} – {datumKort(w.zondag)}</span>
      </header>
      <div className="kaart">
        {deadlines.map((t) => (
          <div className="brief-regel" key={t.id}>
            <span className="tijd">{datumKort(t.deadline)}</span>
            <button type="button" className="groei klein"
              style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}
              onClick={() => bijOpenen(t.id)}>
              {t.titel}
            </button>
          </div>
        ))}
        {onderhoud.map((o) => (
          <div className="brief-regel" key={o.titel}>
            <span className="tijd">{datumKort(o.wanneer)}</span>
            <span className="groei klein">
              {o.link && !o.link.startsWith("/")
                ? <a href={o.link} target="_blank" rel="noreferrer">{o.titel}</a>
                : o.titel}
              <div className="mini">terugkerend onderhoud</div>
            </span>
          </div>
        ))}
        {wachten.length > 0 && (
          <p className="mini" style={{ margin: "0.6rem 0 0" }}>
            {wachten.length === 1
              ? "Op één verstuurde mail kwam nog geen antwoord."
              : `Op ${wachten.length} verstuurde mails kwam nog geen antwoord.`}{" "}
            <Link to="/taken">Bekijk van wie.</Link>
          </p>
        )}
        {stil.length > 0 && (
          <p className="mini" style={{ margin: "0.4rem 0 0" }}>
            Veertien dagen stil: {stil.map((p) => p.naam).join(", ")}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Wat er de vorige keer gebeurde, opgezocht en niet samengevat. Onderaan de
 * knop die de opname meteen aan het goede project hangt.
 */
function VoorbereidingKaart({ titel, project }: { titel: string; project: Project | null }) {
  const v = useAsync(() => haalVoorbereiding({ projectId: project?.id ?? null, titel }), [project?.id, titel]);
  const lijst = (kop: string, regels: string[]) => regels.length > 0 && (
    <div className="voorbereiding-blok">
      <h3>{kop}</h3>
      <ul>{regels.map((r, i) => <li key={i}>{r}</li>)}</ul>
    </div>
  );
  return (
    <div className="voorbereiding">
      {v.laden && <Skelet aantal={1} />}
      {v.fout && <Fout tekst={v.fout} opnieuw={v.herlaad} />}
      {v.data && !v.data.vorige && (
        <p className="mini" style={{ margin: 0 }}>
          {project ? `Nog geen eerdere notities bij ${project.naam}.` : "Geen eerder overleg met deze titel gevonden, en de afspraak hoort niet herkenbaar bij een project."}
        </p>
      )}
      {v.data?.vorige && (
        <>
          <p className="mini" style={{ margin: 0 }}>
            Vorige keer: <Link to={`/notities/${v.data.vorige.id}`}>{v.data.vorige.titel}</Link>, {datumKort(v.data.vorige.datum)}
            {v.data.aantalNotities > 1 && ` (en ${v.data.aantalNotities - 1} eerder)`}
          </p>
          {lijst("Besloten", v.data.besluiten)}
          {lijst("Nog open", v.data.open_vragen)}
          {lijst("Wat jij zou doen", v.data.mijn_vervolgstappen)}
          {v.data.taken.length > 0 && (
            <div className="voorbereiding-blok">
              <h3>Taken die nog lopen</h3>
              <ul>{v.data.taken.map((t) => <li key={t.id}>{t.titel}{t.status === "voorstel" ? <span className="mini"> · voorstel</span> : t.deadline ? <span className="mini"> · {datumKort(t.deadline)}</span> : null}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <OpnameKnop projectId={project?.id ?? null} compact />
    </div>
  );
}

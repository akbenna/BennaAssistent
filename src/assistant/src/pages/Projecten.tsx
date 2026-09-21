import { useState } from "react";
import { Fout, Icoon, Leeg, Skelet, useAsync, useMelding } from "../components/ui";
import { bewaarProject, haalProjectTellingen, haalProjecten } from "../lib/data";
import type { Project } from "../types/db";

const KLEUREN = ["#b4622f", "#3f6b4a", "#3d5a73", "#7a5c8d", "#a33a2c", "#8b837b"];

export function Projecten() {
  const [ronde, setRonde] = useState(0);
  const [bewerk, setBewerk] = useState<Project | "nieuw" | null>(null);
  const projecten = useAsync(() => haalProjecten(true), [ronde]);
  const tellingen = useAsync(() => haalProjectTellingen(), [ronde]);

  return (
    <>
      <div className="sectie rij-tussen">
        <div>
          <p className="opschrift">Waar het over gaat</p>
          <h1>Projecten</h1>
        </div>
        <button className="knop primair" onClick={() => setBewerk("nieuw")}>{Icoon.plus({})} Nieuw</button>
      </div>

      <p className="klein zacht">
        Een project bundelt alles rond één dossier. Trefwoorden en afzenders bepalen waar nieuwe
        taken vanzelf terechtkomen.
      </p>

      {projecten.laden && <Skelet aantal={3} />}
      {projecten.fout && <Fout tekst={projecten.fout} opnieuw={projecten.herlaad} />}

      <div className="stapel" style={{ marginTop: "1rem" }}>
        {(projecten.data ?? []).map((p) => (
          <article className="kaart" key={p.id} style={p.gearchiveerd ? { opacity: 0.55 } : undefined}>
            <div className="rij-tussen">
              <div className="rij groei">
                <span className="stip" style={{ background: p.kleur ?? "var(--inkt-licht)", width: 10, height: 10 }} />
                <strong className="groei afkap">{p.naam}</strong>
              </div>
              <span className="mini">{tellingen.data?.[p.id] ?? 0} lopend</span>
              <button className="knop kaal klein" onClick={() => setBewerk(p)}>Bewerken</button>
            </div>
            {(p.trefwoorden.length > 0 || p.afzenders.length > 0) && (
              <p className="mini" style={{ margin: "0.5rem 0 0" }}>
                {p.trefwoorden.length > 0 && <>Trefwoorden: {p.trefwoorden.join(", ")}. </>}
                {p.afzenders.length > 0 && <>Afzenders: {p.afzenders.join(", ")}.</>}
              </p>
            )}
            {p.gearchiveerd && <p className="mini" style={{ margin: "0.4rem 0 0" }}>Gearchiveerd.</p>}
          </article>
        ))}
      </div>

      {!projecten.laden && (projecten.data ?? []).length === 0 && (
        <Leeg teken="·">Nog geen projecten. Begin met één per dossier, bijvoorbeeld “Gezondheidscentrum”.</Leeg>
      )}

      {bewerk && (
        <ProjectFormulier
          project={bewerk === "nieuw" ? null : bewerk}
          bijSluiten={() => setBewerk(null)}
          bijBewaren={() => { setBewerk(null); setRonde((r) => r + 1); }}
        />
      )}
    </>
  );
}

function ProjectFormulier({
  project, bijSluiten, bijBewaren,
}: { project: Project | null; bijSluiten: () => void; bijBewaren: () => void }) {
  const [naam, setNaam] = useState(project?.naam ?? "");
  const [kleur, setKleur] = useState(project?.kleur ?? KLEUREN[0]!);
  const [trefwoorden, setTrefwoorden] = useState((project?.trefwoorden ?? []).join(", "));
  const [afzenders, setAfzenders] = useState((project?.afzenders ?? []).join(", "));
  const [gearchiveerd, setGearchiveerd] = useState(project?.gearchiveerd ?? false);
  const [bezig, setBezig] = useState(false);
  const meld = useMelding();

  const splits = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function bewaar() {
    if (!naam.trim()) return;
    setBezig(true);
    try {
      await bewaarProject({
        ...(project ? { id: project.id } : {}),
        naam: naam.trim(),
        kleur,
        trefwoorden: splits(trefwoorden),
        afzenders: splits(afzenders),
        gearchiveerd,
      });
      meld("Project bewaard.");
      bijBewaren();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="paneel-achter" onClick={(e) => { if (e.target === e.currentTarget) bijSluiten(); }}>
      <aside className="paneel" role="dialog" aria-label="Project">
        <header>
          <button className="knop kaal" onClick={bijSluiten} aria-label="Sluiten">{Icoon.sluiten({})}</button>
          <span className="opschrift">{project ? "Project bewerken" : "Nieuw project"}</span>
        </header>
        <div className="kaart">
          <label className="veld">
            <span>Naam</span>
            <input type="text" value={naam} autoFocus onChange={(e) => setNaam(e.target.value)} />
          </label>
          <div className="veld">
            <span className="klein zacht">Kleur</span>
            <div className="rij" style={{ gap: "0.4rem", marginTop: "0.3rem" }}>
              {KLEUREN.map((k) => (
                <button key={k} type="button" aria-label={`kleur ${k}`} onClick={() => setKleur(k)}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", background: k, cursor: "pointer",
                    border: kleur === k ? "2px solid var(--inkt)" : "1px solid var(--lijn)",
                  }} />
              ))}
            </div>
          </div>
          <label className="veld">
            <span>Trefwoorden (komma’s ertussen)</span>
            <input type="text" value={trefwoorden} onChange={(e) => setTrefwoorden(e.target.value)}
              placeholder="gezondheidscentrum, parkeerdrukmeting, Didam" />
          </label>
          <label className="veld">
            <span>Afzenders (komma’s ertussen)</span>
            <input type="text" value={afzenders} onChange={(e) => setAfzenders(e.target.value)}
              placeholder="@roermond.nl, koppenol" />
          </label>
          <label className="rij klein" style={{ marginTop: "0.5rem" }}>
            <input type="checkbox" checked={gearchiveerd} style={{ width: "auto" }}
              onChange={(e) => setGearchiveerd(e.target.checked)} />
            Gearchiveerd
          </label>
          <div className="knoppen" style={{ marginTop: "1rem" }}>
            <button className="knop primair" disabled={bezig || !naam.trim()} onClick={() => void bewaar()}>Bewaren</button>
            <button className="knop" onClick={bijSluiten}>Annuleren</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

import { useState } from "react";
import { Fout, Icoon, Leeg, Skelet, useAsync, useMelding } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { TaakPaneel } from "../components/TaakPaneel";
import { vandaag } from "../lib/format";
import { haalProjecten, haalTaken, maakTaak } from "../lib/data";
import type { Prioriteit, TaakStatus } from "../types/db";

type TabNaam = "nu" | "open" | "wachten" | "antwoord" | "afgerond" | "alles";

const TABS: Array<{ id: TabNaam; label: string; statussen: TaakStatus[]; tot?: boolean }> = [
  { id: "nu", label: "Nu", statussen: ["open", "antwoord_binnen"], tot: true },
  { id: "open", label: "Open", statussen: ["open"] },
  { id: "wachten", label: "Wacht op antwoord", statussen: ["wacht_op_antwoord"] },
  { id: "antwoord", label: "Antwoord binnen", statussen: ["antwoord_binnen"] },
  { id: "afgerond", label: "Afgerond", statussen: ["afgerond"] },
  { id: "alles", label: "Alles", statussen: [] },
];

export function Taken() {
  const [tab, setTab] = useState<TabNaam>("open");
  const [projectId, setProjectId] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [ronde, setRonde] = useState(0);

  const projecten = useAsync(() => haalProjecten(), []);
  const huidig = TABS.find((t) => t.id === tab) ?? TABS[1]!;
  const taken = useAsync(
    () => haalTaken({
      statussen: huidig.statussen,
      projectId: projectId || null,
      ...(huidig.tot ? { deadlineTot: vandaag() } : {}),
    }),
    [tab, projectId, ronde],
  );

  const ververs = () => setRonde((r) => r + 1);

  return (
    <>
      <div className="sectie rij-tussen">
        <div>
          <p className="opschrift">Alles wat loopt</p>
          <h1>Taken</h1>
        </div>
        <button className="knop primair" onClick={() => setNieuw(true)}>{Icoon.plus({})} Nieuw</button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === tab}
            className={t.id === tab ? "actief" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {(projecten.data ?? []).length > 0 && (
        <label className="veld">
          <span>Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Alle projecten</option>
            {(projecten.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
          </select>
        </label>
      )}

      {taken.laden && <Skelet aantal={5} />}
      {taken.fout && <Fout tekst={taken.fout} opnieuw={taken.herlaad} />}

      <div className="stapel">
        {(taken.data ?? []).map((taak) => (
          <TaakKaart key={taak.id} taak={taak} bijKlik={() => setOpen(taak.id)} />
        ))}
      </div>

      {!taken.laden && (taken.data ?? []).length === 0 && (
        <Leeg teken="·">Niets in deze weergave.</Leeg>
      )}

      {nieuw && (
        <NieuweTaak
          projecten={(projecten.data ?? []).map((p) => ({ id: p.id, naam: p.naam }))}
          bijSluiten={() => setNieuw(false)}
          bijBewaren={() => { setNieuw(false); ververs(); }}
        />
      )}
      {open && <TaakPaneel taakId={open} bijSluiten={() => setOpen(null)} bijWijziging={ververs} />}
    </>
  );
}

export function NieuweTaak({
  projecten, bijSluiten, bijBewaren, beginTitel = "", beginToelichting = "",
}: {
  projecten: Array<{ id: string; naam: string }>;
  bijSluiten: () => void;
  bijBewaren: (id: string) => void;
  beginTitel?: string;
  beginToelichting?: string;
}) {
  const [titel, setTitel] = useState(beginTitel);
  const [toelichting, setToelichting] = useState(beginToelichting);
  const [deadline, setDeadline] = useState("");
  const [prioriteit, setPrioriteit] = useState<Prioriteit>("normaal");
  const [projectId, setProjectId] = useState("");
  const [bezig, setBezig] = useState(false);
  const meld = useMelding();

  async function bewaar() {
    if (!titel.trim()) return;
    setBezig(true);
    try {
      const id = await maakTaak({
        titel: titel.trim(),
        toelichting: toelichting.trim() || null,
        deadline: deadline || null,
        prioriteit,
        project_id: projectId || null,
      });
      meld("Taak toegevoegd.");
      bijBewaren(id);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="paneel-achter" onClick={(e) => { if (e.target === e.currentTarget) bijSluiten(); }}>
      <aside className="paneel" role="dialog" aria-label="Nieuwe taak">
        <header>
          <button className="knop kaal" onClick={bijSluiten} aria-label="Sluiten">{Icoon.sluiten({})}</button>
          <span className="opschrift">Nieuwe taak</span>
        </header>
        <div className="kaart">
          <label className="veld">
            <span>Wat moet er gebeuren?</span>
            <input type="text" value={titel} autoFocus onChange={(e) => setTitel(e.target.value)} />
          </label>
          <label className="veld">
            <span>Toelichting</span>
            <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} style={{ minHeight: 90 }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.6rem" }}>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span>Deadline</span>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span>Prioriteit</span>
              <select value={prioriteit} onChange={(e) => setPrioriteit(e.target.value as Prioriteit)}>
                <option value="laag">Laag</option>
                <option value="normaal">Normaal</option>
                <option value="hoog">Hoog</option>
              </select>
            </label>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span>Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— geen —</option>
                {projecten.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
              </select>
            </label>
          </div>
          <div className="knoppen" style={{ marginTop: "1rem" }}>
            <button className="knop primair" disabled={bezig || !titel.trim()} onClick={() => void bewaar()}>Bewaren</button>
            <button className="knop" onClick={bijSluiten}>Annuleren</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

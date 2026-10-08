import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Fout, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { duur } from "../components/Opname";
import { TaakPaneel } from "../components/TaakPaneel";
import { STATUS_TEKST } from "../components/TaakKaart";
import { useSessie } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  haalOpname, haalOpnameInstellingen, haalProjecten, haalTakenVanOpname, maakTaakUitOpname,
  notitieActie, verwerkOpnames, verwijderOpname, werkOpnameBij,
} from "../lib/data";
import { datumKort, datumLang, tijdKort } from "../lib/format";
import { OPNAME_STATUS } from "./Notities";
import type { Opname, OpnameStatus } from "../types/db";

const BEZIG: OpnameStatus[] = ["opname", "verwerken", "samenvatten", "bezig"];

/*
 * EEN NOTITIE NALEZEN, EN WAT ER UIT VOORTKOMT
 *
 * Bovenaan het verhaal, daaronder wat er moet gebeuren. Actiepunten van jou
 * staan al als voorstel klaar: hier zie je welke, en of je ze al hebt
 * geaccepteerd. Wat bij een ander ligt kun je met één tik als eigen taak
 * opvolgen ("navragen bij"). Een vervolgafspraak zet je met één tik in je
 * agenda. Niets daarvan gebeurt vanzelf.
 */
export function NotitieDetail() {
  const { id = "" } = useParams();
  const naar = useNavigate();
  const meld = useMelding();
  const { sessie } = useSessie();
  const [ronde, setRonde] = useState(0);
  const [titel, setTitel] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const n = useAsync(() => haalOpname(id), [id, ronde]);
  const projecten = useAsync(() => haalProjecten(), []);
  const taken = useAsync(() => haalTakenVanOpname(n.data?.item_id ?? null), [n.data?.item_id, ronde]);

  const notitie = n.data;
  useEffect(() => { if (notitie) setTitel((t) => t || notitie.titel || ""); }, [notitie]);
  useEffect(() => {
    if (!notitie || !BEZIG.includes(notitie.status)) return;
    const t = window.setInterval(() => setRonde((r) => r + 1), 5000);
    return () => window.clearInterval(t);
  }, [notitie]);

  if (n.laden && !notitie) return <Skelet />;
  if (n.fout) return <Fout tekst={n.fout} opnieuw={n.herlaad} />;
  if (!notitie) return <p className="mini">Deze notitie bestaat niet meer. <Link to="/notities">Alle notities</Link></p>;

  const r = notitie.samenvatting;
  const ververs = () => setRonde((x) => x + 1);
  const doe = async (actie: () => Promise<unknown>, bericht?: string) => {
    setBezig(true);
    try { await actie(); if (bericht) meld(bericht); ververs(); }
    catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
    finally { setBezig(false); }
  };

  const wijzig = (velden: Partial<Opname>) => doe(() => werkOpnameBij(notitie.id, velden));
  const opnieuwSamenvatten = () => doe(async () => {
    await werkOpnameBij(notitie.id, { status: "samenvatten", fout: null });
    await verwerkOpnames();
  }, "Wordt opnieuw samengevat.");
  const opnieuwProberen = () => doe(async () => {
    // Delen die definitief mislukten krijgen een nieuwe kans.
    await supabase.from("notitie_delen").update({ status: "klaar", pogingen: 0, fout: null }).eq("notitie_id", notitie.id).eq("status", "fout");
    await werkOpnameBij(notitie.id, { status: notitie.transcript ? "samenvatten" : "verwerken", fout: null });
    await verwerkOpnames();
  }, "Wordt opnieuw verwerkt.");
  const goedkeuren = () => doe(async () => {
    const inst = await haalOpnameInstellingen();
    const dagen = inst?.bewaartermijn_audio_dagen ?? 30;
    await werkOpnameBij(notitie.id, {
      status: "goedgekeurd", titel: titel || notitie.titel,
      audio_verwijderen_na: new Date(Date.now() + dagen * 86_400_000).toISOString(),
    });
  }, "Nagelezen. De audio wordt na de bewaartermijn gewist.");
  const kiesProject = (pid: string) => doe(async () => {
    await werkOpnameBij(notitie.id, {
      project_id: pid || null, project_vast: Boolean(pid),
      ...(notitie.transcript && !BEZIG.includes(notitie.status) && notitie.status !== "geweigerd" ? { status: "samenvatten" as const } : {}),
    });
    if (notitie.transcript) await verwerkOpnames();
  });
  const verwijder = () => {
    if (!sessie || !confirm("Notitie, audio en transcript verwijderen? Taken die eruit voortkwamen en het Google Doc blijven staan.")) return;
    void doe(async () => { await verwijderOpname(notitie, sessie.user.id); naar("/notities"); });
  };
  const bevestig = () => {
    if (!confirm("Je hebt het transcript gelezen en er staan geen patiëntgegevens in? Dan gaat het naar het taalmodel om te worden samengevat. Dit wordt in het logboek vastgelegd.")) return;
    void doe(async () => { await notitieActie(notitie.id, "bevestig"); await verwerkOpnames(); }, "Wordt samengevat.");
  };

  const takenOpTitel = new Map((taken.data ?? []).map((t) => [t.titel.toLowerCase(), t]));
  const alsTaak = (tekst: string, deadline: string | null) =>
    doe(() => maakTaakUitOpname(notitie, tekst.slice(0, 200), deadline), "Op je lijst gezet.");

  return (
    <>
      <p style={{ margin: "0 0 0.4rem" }}><Link className="mini" to="/notities">Alle notities</Link></p>
      <textarea className="titelveld" rows={2} value={titel} placeholder="Titel volgt na verwerking" aria-label="Titel"
        onChange={(e) => setTitel(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onBlur={() => { if (titel && titel !== (notitie.titel ?? "")) void wijzig({ titel }); }} />
      <p className="mini" style={{ margin: "0.2rem 0 0.8rem" }}>
        {datumLang(notitie.gestart_op)}, {tijdKort(notitie.gestart_op)}{notitie.duur_sec ? ` · ${duur(notitie.duur_sec)}` : ""}
        {notitie.agenda_titel ? ` · agenda: ${notitie.agenda_titel}` : ""}
      </p>

      <div className="kaart" style={{ marginBottom: "0.8rem" }}>
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Project</span>
          <select value={notitie.project_id ?? ""} onChange={(e) => void kiesProject(e.target.value)} disabled={bezig || BEZIG.includes(notitie.status)}>
            <option value="">Automatisch</option>
            {(projecten.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
          </select>
        </label>
      </div>

      {BEZIG.includes(notitie.status) && (
        <div className="kaart"><Merkje kleur="blauw">{OPNAME_STATUS[notitie.status]}…</Merkje>
          <p className="mini" style={{ margin: "0.5rem 0 0" }}>Deze pagina ververst vanzelf. Je kunt hem ook sluiten; de notitie verschijnt op Vandaag zodra hij klaar is.</p>
        </div>
      )}

      {notitie.status === "geweigerd" && (
        <div className="kaart" role="alert" style={{ borderLeft: "3px solid var(--fout)" }}>
          <p className="klein" style={{ marginTop: 0 }}>
            Het privacyfilter zag iets dat op patiëntgegevens lijkt ({notitie.privacy_reden}). Er is niets samengevat en niets naar het taalmodel gestuurd. Lees het transcript hieronder na.
          </p>
          <p className="mini">Staan er wel patiëntgegevens in, verwijder de notitie dan. De audio wordt anders over zeven dagen vanzelf gewist.</p>
          <div className="knoprij">
            <button type="button" className="knop klein gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</button>
            <button type="button" className="knop klein" onClick={bevestig} disabled={bezig}>Vals alarm: toch samenvatten</button>
          </div>
        </div>
      )}

      {notitie.status === "fout" && (
        <div className="kaart" role="alert">
          <p className="klein" style={{ marginTop: 0, color: "var(--fout)" }}>Verwerking mislukt: {notitie.fout}</p>
          {!notitie.audio_verwijderd && <button type="button" className="knop klein" onClick={() => void opnieuwProberen()} disabled={bezig}>Opnieuw proberen</button>}
        </div>
      )}

      {r && (
        <article className="kaart verslag">
          {r.samenvatting.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
          <Opsomming kop="Besluiten" items={r.besluiten} />

          {r.actiepunten.length > 0 && (
            <>
              <h3>Actiepunten</h3>
              <ul className="actielijst">
                {r.actiepunten.map((a, i) => {
                  const taak = takenOpTitel.get(a.wat.slice(0, 200).toLowerCase());
                  return (
                    <li key={i}>
                      <span><b>{a.van_mij ? "Ik" : a.wie}</b> {a.wat}{a.deadline && <span className="mini"> vóór {datumKort(a.deadline)}</span>}</span>
                      {taak ? (
                        <button type="button" className="knop klein kaal" onClick={() => setOpen(taak.id)}>
                          <Merkje kleur={taak.status === "voorstel" ? "amber" : taak.status === "afgerond" ? "groen" : undefined}>{STATUS_TEKST[taak.status]}</Merkje>
                        </button>
                      ) : a.van_mij ? (
                        <button type="button" className="knop klein" disabled={bezig} onClick={() => void alsTaak(a.wat, a.deadline || null)}>Op mijn lijst</button>
                      ) : (
                        <button type="button" className="knop klein" disabled={bezig}
                          onClick={() => void alsTaak(`Navragen bij ${a.wie}: ${a.wat}`, a.deadline || null)}>Volg op</button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {r.actiepunten.some((a) => a.van_mij) && (
                <p className="mini">Jouw actiepunten staan als voorstel klaar op <Link to="/voorstellen">Voorstellen</Link>. Pas als je ze accepteert staan ze op je lijst.</p>
              )}
            </>
          )}

          {r.afspraken.length > 0 && (
            <>
              <h3>Afspraken</h3>
              <ul className="actielijst">
                {r.afspraken.map((a, i) => (
                  <li key={i}>
                    <span>{datumKort(a.datum)}{a.begintijd ? ` ${a.begintijd}` : ""}: {a.wat}{a.locatie && <span className="mini">, {a.locatie}</span>}</span>
                    {a.event_id
                      ? <Merkje kleur="groen">In agenda</Merkje>
                      : <button type="button" className="knop klein" disabled={bezig}
                          onClick={() => void doe(() => notitieActie(notitie.id, "agenda", i), "In je agenda gezet.")}>In agenda</button>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <Opsomming kop="Open vragen" items={r.open_vragen} />
          {r.mijn_vervolgstappen.length > 0 && (
            <>
              <h3>Mijn vervolgstappen</h3>
              <ul className="actielijst">
                {r.mijn_vervolgstappen.map((v, i) => (
                  <li key={i}>
                    <span>{v}</span>
                    {takenOpTitel.has(v.slice(0, 200).toLowerCase())
                      ? <Merkje>Op je lijst</Merkje>
                      : <button type="button" className="knop klein" disabled={bezig} onClick={() => void alsTaak(v, null)}>Als taak</button>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
      )}

      {notitie.transcript && (
        <details className="uitleg transcript" open={notitie.status === "geweigerd"}>
          <summary>Transcript</summary>
          <pre>{notitie.transcript}</pre>
        </details>
      )}

      <div className="knoprij" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
        {notitie.status === "gereed" && <button type="button" className="knop primair" onClick={() => void goedkeuren()} disabled={bezig}>Goedkeuren</button>}
        {notitie.drive_doc_id && (
          <a className="knop" href={`https://docs.google.com/document/d/${encodeURIComponent(notitie.drive_doc_id)}/edit`} target="_blank" rel="noreferrer">Google Doc</a>
        )}
        {(notitie.status === "gereed" || notitie.status === "goedgekeurd") && (
          <button type="button" className="knop" onClick={() => void opnieuwSamenvatten()} disabled={bezig}>Opnieuw samenvatten</button>
        )}
        {notitie.status !== "geweigerd" && <button type="button" className="knop kaal gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</button>}
      </div>

      {notitie.modellen.drive_fout && <p className="mini" style={{ color: "var(--let)" }}>Geen Google Doc: {notitie.modellen.drive_fout}</p>}
      {notitie.modellen.samenvatting && (
        <p className="mini">
          Uitgeschreven met {(notitie.modellen.transcriptie ?? []).join(", ") || "onbekend"}, samengevat met {notitie.modellen.samenvatting}
          {notitie.modellen.samenvatting_uitval ? " (OpenAI viel uit)" : ""}.
          {notitie.audio_verwijderd ? " De audio is gewist." : ""}
        </p>
      )}

      {open && <TaakPaneel taakId={open} bijSluiten={() => setOpen(null)} bijWijziging={ververs} />}
    </>
  );
}

function Opsomming({ kop, items }: { kop: string; items: string[] }) {
  if (!items.length) return null;
  return <><h3>{kop}</h3><ul>{items.map((b, i) => <li key={i}>{b}</li>)}</ul></>;
}

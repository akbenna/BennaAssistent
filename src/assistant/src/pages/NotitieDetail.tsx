import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Fout, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { duur } from "../components/Opname";
import { TaakPaneel } from "../components/TaakPaneel";
import { STATUS_TEKST } from "../components/TaakKaart";
import { useSessie } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  haalFotos, haalOpname, haalOpnameInstellingen, haalProjecten, haalTakenVanOpname, haalVerwant, maakTaakUitOpname, notitieMail, voegFotoToe, werkActiepuntBij,
  notitieActie, verwerkOpnames, verwijderOpname, werkOpnameBij,
} from "../lib/data";
import { datumKort, datumLang, tijdKort } from "../lib/format";
import { verklein } from "../lib/beeld";
import { regelBij } from "../lib/transcript";
import { leesLabelVeld, OPNAME_STATUS, SOORT_TEKST } from "./Notities";
import type { Foto, Oordeel, Opname, OpnameSoort, OpnameStatus } from "../types/db";

const OORDEEL_KLEUR: Record<Oordeel, "groen" | "amber" | "rood" | undefined> = {
  bevestigd: "groen", genuanceerd: "amber", afwijkend: "rood", "niet te beoordelen": undefined,
};



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
  const fotos = useAsync(() => haalFotos(id), [id, ronde]);
  const fotoKiezer = useRef<HTMLInputElement>(null);
  const labelSleutel = (n.data?.labels ?? []).join(",");
  const verwant = useAsync(() => haalVerwant(id, n.data?.labels ?? []), [id, labelSleutel]);

  const notitie = n.data;
  useEffect(() => { if (notitie) setTitel((t) => t || notitie.titel || ""); }, [notitie]);
  const fotoBezig = (fotos.data ?? []).some((f) => f.status === "klaar" || f.status === "bezig");
  const verdiepBezig = notitie?.verdieping_status === "gevraagd" || notitie?.verdieping_status === "bezig";
  useEffect(() => {
    if (!notitie || (!BEZIG.includes(notitie.status) && !verdiepBezig && !fotoBezig)) return;
    const t = window.setInterval(() => setRonde((r) => r + 1), 5000);
    return () => window.clearInterval(t);
  }, [notitie, verdiepBezig, fotoBezig]);

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
  // Een snelle notitie heeft soms geen transcript, maar wel iets om samen te vatten.
  // Een uitwerking van de congres-agent heeft geen transcript om opnieuw samen te vatten.
  const heeftInhoud = notitie.bron !== "onderzoek" && (Boolean(notitie.transcript) || (notitie.bron === "tekst" && Boolean(r)));
  const opnieuw = heeftInhoud && !BEZIG.includes(notitie.status) && notitie.status !== "geweigerd";
  const kiesProject = (pid: string) => doe(async () => {
    await werkOpnameBij(notitie.id, {
      project_id: pid || null, project_vast: Boolean(pid),
      ...(opnieuw ? { status: "samenvatten" as const } : {}),
    });
    if (opnieuw) await verwerkOpnames();
  });
  const kiesSoort = (soort: OpnameSoort) => doe(async () => {
    await werkOpnameBij(notitie.id, {
      soort,
      ...(opnieuw ? { status: "samenvatten" as const } : {}),
    });
    if (opnieuw) await verwerkOpnames();
  }, opnieuw ? "Wordt opnieuw samengevat." : undefined);
  const zetLabels = (v: string) => {
    const l = leesLabelVeld(v);
    if (l.join(",") !== (notitie.labels ?? []).join(",")) void wijzig({ labels: l });
  };
  const fotoAchteraf = (f: File) => doe(async () => {
    if (!sessie) return;
    await voegFotoToe(notitie.id, sessie.user.id, await verklein(f), null);
    await verwerkOpnames();
  }, "Foto toegevoegd. Hij wordt gelezen; kies daarna Opnieuw samenvatten om hem mee te nemen.");
  const verdiepen = () => doe(async () => {
    await notitieActie(notitie.id, "verdiep");
    await verwerkOpnames();
  }, "De bronnen worden nagezocht. Dat duurt een minuut of twee.");
  const verwijder = () => {
    if (!sessie || !confirm("Notitie, audio en transcript verwijderen? Taken die eruit voortkwamen en het Google Doc blijven staan.")) return;
    void doe(async () => { await verwijderOpname(notitie, sessie.user.id); naar("/notities"); });
  };
  const bevestig = () => {
    if (!confirm("Je hebt het transcript gelezen en er staan geen patiëntgegevens in? Dan gaat het naar het taalmodel om te worden samengevat. Dit wordt in het logboek vastgelegd.")) return;
    void doe(async () => { await notitieActie(notitie.id, "bevestig"); await verwerkOpnames(); }, "Wordt samengevat.");
  };

  const klaar = notitie.status === "gereed" || notitie.status === "goedgekeurd";
  const verslagSturen = () => doe(async () => {
    const res = await notitieMail(notitie.id, "notulen");
    meld(res.ontvangers.length
      ? `Het verslag staat als concept in Gmail, aan ${res.ontvangers.length} ${res.ontvangers.length === 1 ? "genodigde" : "genodigden"}. Lees het na en verstuur het daar.`
      : "Het verslag staat als concept in Gmail. Er waren geen genodigden in de agenda; vul de ontvangers daar zelf in.");
  });
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

      {notitie.bron === "onderzoek" && (
        <p className="mini" style={{ margin: "0 0 0.8rem" }}>
          Uitgezocht door de congres-agent{notitie.agenda_titel ? ` voor ${notitie.agenda_titel}` : ""}.
          {notitie.modellen.onderzoek_id && <> <Link to={`/onderzoek/${notitie.modellen.onderzoek_id}`}>Terug naar het onderzoek</Link>.</>}
          {" "}De genoemde publicaties worden nagezocht in PubMed; het oordeel staat onder Bronnen.
        </p>
      )}

      {notitie.bron === "tekst" && (notitie.invoer || notitie.link) && (
        <div className="kaart eigen" style={{ marginBottom: "0.8rem" }}>
          {notitie.invoer && <p className="opschrift" style={{ margin: "0 0 0.3rem" }}>Mijn notitie</p>}
          {notitie.invoer?.split(/\n/).map((l, i) => <p key={i} style={{ margin: "0 0 0.3rem" }}>{l}</p>)}
          {notitie.link && /^https?:\/\//i.test(notitie.link) && (
            <p className="mini" style={{ margin: 0, overflowWrap: "anywhere" }}>
              <a href={notitie.link} target="_blank" rel="noreferrer">{notitie.link}</a>
              {notitie.modellen?.link_fout && <span style={{ color: "var(--fout)" }}> · {notitie.modellen.link_fout}</span>}
            </p>
          )}
        </div>
      )}

      <div className="kaart rij2" style={{ marginBottom: "0.8rem" }}>
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Soort</span>
          <select value={notitie.soort} onChange={(e) => void kiesSoort(e.target.value as OpnameSoort)} disabled={bezig || BEZIG.includes(notitie.status)}>
            {(Object.keys(SOORT_TEKST) as OpnameSoort[]).map((s) => <option key={s} value={s}>{SOORT_TEKST[s]}</option>)}
          </select>
        </label>
        <label className="veld" style={{ marginBottom: 0, gridColumn: "1 / -1" }}>
          <span>Labels</span>
          <input defaultValue={(notitie.labels ?? []).join(", ")} key={labelSleutel} placeholder="poh, financiering"
            onBlur={(e) => zetLabels(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </label>
        {notitie.soort === "congres" && (
          <>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span>Organisator (nascholing)</span>
              <input defaultValue={notitie.nascholing_organisator ?? ""} key={`o${notitie.nascholing_organisator ?? ""}`} maxLength={200}
                onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== notitie.nascholing_organisator) void wijzig({ nascholing_organisator: v }); }} />
            </label>
            <label className="veld" style={{ marginBottom: 0 }}>
              <span>Accreditatiepunten</span>
              <input type="number" min={0} max={99} step={0.5} inputMode="decimal" defaultValue={notitie.nascholing_punten ?? ""} key={`p${notitie.nascholing_punten ?? ""}`}
                onBlur={(e) => {
                  const v = e.target.value.trim() === "" ? null : Math.round(Number(e.target.value.replace(",", ".")) * 2) / 2;
                  if (v === null || (Number.isFinite(v) && v >= 0 && v <= 99)) { if (v !== notitie.nascholing_punten) void wijzig({ nascholing_punten: v }); }
                }} />
            </label>
          </>
        )}
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
          {(r.sprekers ?? []).some((x) => x.naam) && (
            <p className="mini" style={{ margin: "0 0 0.8rem" }}>
              Sprekers: {(r.sprekers ?? []).filter((x) => x.naam).map((x) => `${x.naam}${x.rol ? `, ${x.rol}` : ""} (${x.label.replace("Spreker", "spreker")})`).join(" · ")}
            </p>
          )}
          {(r.presentaties ?? []).map((p, i) => (
            <section key={i} className="presentatie">
              <h3>{p.onderwerp || "Presentatie"}</h3>
              <p className="mini" style={{ margin: "0 0 0.3rem" }}>{p.spreker}</p>
              {p.kernboodschappen.length > 0 && <ul>{p.kernboodschappen.map((k, j) => <li key={j}>{k}</li>)}</ul>}
              {p.onderbouwing.length > 0 && <><p className="opschrift" style={{ margin: "0.5rem 0 0.2rem" }}>Onderbouwing</p><ul>{p.onderbouwing.map((k, j) => <li key={j}>{k}</li>)}</ul></>}
            </section>
          ))}
          {r.relevantie_praktijk && <><h3>Relevantie voor de praktijk</h3><p>{r.relevantie_praktijk}</p></>}
          <Opsomming kop="Kanttekeningen" items={r.kanttekeningen ?? []} />
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
                      ) : a.afgehandeld ? (
                        <Merkje kleur="groen">afgehandeld</Merkje>
                      ) : (
                        <span className="knoprij">
                          <button type="button" className="knop klein" disabled={bezig}
                            onClick={() => void alsTaak(`Navragen bij ${a.wie}: ${a.wat}`, a.deadline || null)}>Volg op</button>
                          <button type="button" className="knop klein" disabled={bezig || !klaar}
                            onClick={() => void doe(async () => {
                              const res = await notitieMail(notitie.id, "herinnering", i);
                              meld(res.ontvangers.length ? `Herinnering staat als concept in Gmail, aan ${res.ontvangers.join(", ")}.` : "Herinnering staat als concept in Gmail. Vul daar de ontvanger in.");
                            })}>Herinnering{a.herinnerd_op ? " ✓" : ""}</button>
                          <button type="button" className="knop klein kaal" disabled={bezig}
                            onClick={() => void doe(() => werkActiepuntBij(notitie.id, i, { afgehandeld: true }))}>Afgehandeld</button>
                        </span>
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

      {((fotos.data ?? []).length > 0 || notitie.soort === "congres") && (
        <section className="sectie">
          <header>
            <h2>Slides en foto's</h2>
            <button type="button" className="knop klein" onClick={() => fotoKiezer.current?.click()} disabled={bezig}>Foto toevoegen</button>
            <input ref={fotoKiezer} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void fotoAchteraf(f); }} />
          </header>
          <div className="fotorij">
            {(fotos.data ?? []).map((f: Foto) => (
              <figure key={f.id} className="foto">
                {f.url ? <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={`Slide ${f.volgnummer}`} loading="lazy" /></a> : <div className="fotoleeg" />}
                <figcaption className="mini">
                  <b>{f.moment_sec != null ? duur(f.moment_sec) : "achteraf"}</b>{" "}
                  {f.status === "gereed" ? f.lezing?.kern
                    : f.status === "geweigerd" ? "Niet gelezen: mogelijk patiëntgegevens."
                    : f.status === "fout" ? "Kon niet worden gelezen."
                    : "Wordt gelezen…"}
                </figcaption>
              </figure>
            ))}
          </div>
          {(fotos.data ?? []).length === 0 && <p className="mini">Nog geen foto's. Tijdens de opname maak je ze met de knop Slide bovenaan.</p>}
        </section>
      )}

      {r && (r.bronnen ?? []).length > 0 && (
        <section className="sectie">
          <header><h2>Bronnen</h2><span className="aantal">{r.bronnen?.length}</span></header>
          {!notitie.verdieping && !verdiepBezig && (
            <div className="kaart vraagkaart">
              <p className="klein" style={{ marginTop: 0 }}>
                {r.bronnen!.length === 1 ? "Er werd één bron genoemd" : `Er werden ${r.bronnen!.length} bronnen genoemd`}, op de slides of in het gesprek.
                Zal ik ze opzoeken in PubMed en de notitie aanvullen met wat de studies werkelijk vonden?
              </p>
              <button type="button" className="knop primair klein" onClick={() => void verdiepen()} disabled={bezig}>Ja, zoek ze na</button>
              {notitie.verdieping_status === "fout" && <p className="mini" style={{ color: "var(--fout)" }}>Vorige poging mislukt: {notitie.modellen.verdieping_fout}</p>}
            </div>
          )}
          {verdiepBezig && <div className="kaart"><Merkje kleur="blauw">Bronnen worden nagezocht…</Merkje></div>}
          {notitie.verdieping ? (
            <div className="kaart verslag">
              {notitie.verdieping.duiding.split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
              <ol className="bronlijst">
                {notitie.verdieping.bronnen.map((b, i) => (
                  <li key={i}>
                    <div><Merkje kleur={OORDEEL_KLEUR[b.oordeel]}>{b.oordeel}</Merkje> <span className="mini">{b.herkomst}</span></div>
                    <p className="klein" style={{ margin: "0.3rem 0" }}><i>Bewering:</i> {b.bewering}</p>
                    {b.bevindingen && <p className="klein" style={{ margin: "0.3rem 0" }}><i>De studie:</i> {b.bevindingen}</p>}
                    {b.toelichting && <p className="mini" style={{ margin: "0.2rem 0" }}>{b.toelichting}</p>}
                    <p className="mini" style={{ margin: "0.2rem 0 0" }}>
                      {b.gegevens?.url ? <a href={b.gegevens.url} target="_blank" rel="noreferrer">{b.citaat}</a> : "Niet gevonden in PubMed."}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mini">Nagezocht met {notitie.verdieping.dienst}. De oordelen gaan alleen over het abstract; lees bij twijfel het artikel zelf.</p>
            </div>
          ) : (
            <div className="kaart">
              <ol className="bronlijst">
                {r.bronnen!.map((b, i) => (
                  <li key={i} className="klein">
                    {[b.auteurs, b.omschrijving, b.tijdschrift, b.jaar].filter(Boolean).join(". ")}
                    {b.doi && <> · <a href={`https://doi.org/${b.doi}`} target="_blank" rel="noreferrer">doi</a></>}
                    <span className="mini"> ({b.herkomst})</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {(notitie.aantekeningen ?? []).length > 0 && (
        <section className="sectie">
          <header><h2>Mijn aantekeningen</h2></header>
          <div className="kaart">
            {notitie.aantekeningen.map((a, i) => (
              <div className="brief-regel" key={i}>
                <span className="tijd">{duur(a.moment)}</span>
                <span className="groei">{a.tekst}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notitie.markeringen.length > 0 && notitie.transcript && (
        <section className="sectie">
          <header><h2>Gemarkeerde momenten</h2></header>
          <div className="kaart">
            {notitie.markeringen.map((m, i) => (
              <div className="brief-regel" key={i}>
                <span className="tijd">{duur(m)}</span>
                <span className="groei klein">{regelBij(notitie.transcript ?? "", m).replace(/^\[[^\]]+\]\s*/, "") || "…"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(verwant.data ?? []).length > 0 && (
        <section className="sectie">
          <header><h2>Verwant</h2></header>
          <div className="kaart">
            {(verwant.data ?? []).map((v) => (
              <div className="brief-regel" key={v.id}>
                <span className="tijd">{datumKort(v.gestart_op)}</span>
                <span className="groei">
                  <Link to={`/notities/${v.id}`}>{v.titel || "Zonder titel"}</Link>
                  <span className="mini"> · {(v.labels ?? []).filter((l) => notitie.labels.includes(l)).map((l) => `#${l}`).join(" ")}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notitie.transcript && (
        <details className="uitleg transcript" open={notitie.status === "geweigerd"}>
          <summary>{notitie.bron === "tekst" ? "Tekst van het artikel" : "Transcript"}</summary>
          <pre>{notitie.transcript}</pre>
        </details>
      )}

      <div className="knoprij" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
        {notitie.status === "gereed" && <button type="button" className="knop primair" onClick={() => void goedkeuren()} disabled={bezig}>Goedkeuren</button>}
        {notitie.drive_doc_id && (
          <a className="knop" href={`https://docs.google.com/document/d/${encodeURIComponent(notitie.drive_doc_id)}/edit`} target="_blank" rel="noreferrer">Google Doc</a>
        )}
        {klaar && notitie.bron !== "onderzoek" && notitie.soort !== "congres" && r && (
          <button type="button" className="knop" onClick={() => void verslagSturen()} disabled={bezig}>Verslag als concept in Gmail</button>
        )}
        {(notitie.status === "gereed" || notitie.status === "goedgekeurd") && notitie.bron !== "onderzoek" && (
          <button type="button" className="knop" onClick={() => void opnieuwSamenvatten()} disabled={bezig}>Opnieuw samenvatten</button>
        )}
        {notitie.status !== "geweigerd" && <button type="button" className="knop kaal gevaar" onClick={verwijder} disabled={bezig}>Verwijderen</button>}
      </div>

      {notitie.modellen.drive_fout && (
        <p className="mini" style={{ color: "var(--let)" }}>
          Geen Google Doc: {notitie.modellen.drive_fout}{" "}
          {notitie.modellen.drive_opnieuw
            ? <span>Wordt opnieuw geprobeerd…</span>
            : <button type="button" className="knop klein kaal" disabled={bezig}
                onClick={() => void doe(async () => { await werkOpnameBij(notitie.id, { modellen: { ...notitie.modellen, drive_opnieuw: true } }); await verwerkOpnames(); }, "Het document wordt opnieuw gemaakt.")}>
                Opnieuw proberen
              </button>}
        </p>
      )}
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

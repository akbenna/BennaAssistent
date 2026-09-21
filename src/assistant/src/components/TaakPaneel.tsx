import { useEffect, useState } from "react";
import { Fout, Icoon, Leeg, Merkje, Skelet, Uitleg, useAsync, useMelding } from "./ui";
import { PRIORITEIT_TEKST, STATUS_TEKST } from "./TaakKaart";
import { afzenderNaam, datumKort, datumLang, relatief } from "../lib/format";
import { roepFunctie } from "../lib/supabase";
import {
  haalBronnenVanTaak, haalConcepten, haalNotities, haalOpvolging, haalProjecten, haalTaak,
  voegNotitieToe, werkTaakBij,
} from "../lib/data";
import type { Prioriteit, TaakStatus } from "../types/db";

const STATUSSEN: TaakStatus[] = ["voorstel", "open", "wacht_op_antwoord", "antwoord_binnen", "afgerond", "vervallen"];
const PRIORITEITEN: Prioriteit[] = ["laag", "normaal", "hoog"];

/* De vier manieren waarop het model kan meedenken. Ze staan hier met hun label
   en met de reden dat ze bestaan: een knop zonder uitleg wordt niet gebruikt,
   en bij een knop die een taalmodel aanroept hoort te staan wat eruit komt. */
type Denkwijze = "stappen" | "samenvatting" | "hoeken" | "herschrijf";

const DENKWIJZEN: Array<{ wijze: Denkwijze; label: string; uitleg: string; draad: boolean }> = [
  { wijze: "stappen", label: "Hak in stappen", draad: false,
    uitleg: "Hooguit vijf concrete stappen, elk beginnend met een werkwoord." },
  { wijze: "samenvatting", label: "Vat de draad samen", draad: true,
    uitleg: "Wat er is afgesproken, wat openstaat en bij wie de bal ligt." },
  { wijze: "hoeken", label: "Geef drie invalshoeken", draad: true,
    uitleg: "Drie werkelijk verschillende manieren om te reageren, met wat je ermee wint of riskeert." },
];

const TONEN = ["korter", "formeler", "warmer", "zakelijker", "stelliger"];

interface Props {
  taakId: string;
  bijSluiten: () => void;
  bijWijziging: () => void;
}

export function TaakPaneel({ taakId, bijSluiten, bijWijziging }: Props) {
  const taakStand = useAsync(() => haalTaak(taakId), [taakId]);
  const bronnen = useAsync(() => haalBronnenVanTaak(taakId), [taakId]);
  const notities = useAsync(() => haalNotities(taakId), [taakId]);
  const concepten = useAsync(() => haalConcepten(taakId), [taakId]);
  const opvolging = useAsync(() => haalOpvolging(taakId), [taakId]);
  const projecten = useAsync(() => haalProjecten(), []);
  const meld = useMelding();

  const [concept, setConcept] = useState<{ id: string; tekst: string } | null>(null);
  const [instructie, setInstructie] = useState("");
  const [bezig, setBezig] = useState<string | null>(null);
  const [notitie, setNotitie] = useState("");
  const [gedachte, setGedachte] = useState<{ wijze: Denkwijze; tekst: string } | null>(null);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === "Escape") bijSluiten(); };
    window.addEventListener("keydown", opToets);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", opToets);
      document.body.style.overflow = "";
    };
  }, [bijSluiten]);

  const taak = taakStand.data;

  async function wijzig(velden: Parameters<typeof werkTaakBij>[1], bericht?: string) {
    try {
      await werkTaakBij(taakId, velden);
      taakStand.herlaad();
      bijWijziging();
      if (bericht) meld(bericht);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  async function schrijfConcept() {
    setBezig("concept");
    try {
      const uit = await roepFunctie<{ draft_id: string; tekst: string }>("create-draft", {
        task_id: taakId,
        instructie: instructie.trim() || undefined,
      });
      setConcept({ id: uit.draft_id, tekst: uit.tekst });
      concepten.herlaad();
      meld("Concept staat klaar in Gmail.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  }

  async function verstuur(draftId: string, naWerkdagen: number) {
    if (!window.confirm("Dit verstuurt de mail meteen vanuit jouw Gmail. Doorgaan?")) return;
    setBezig("versturen");
    try {
      await roepFunctie("send-draft", { draft_id: draftId, herinner_na_werkdagen: naWerkdagen });
      setConcept(null);
      concepten.herlaad();
      opvolging.herlaad();
      taakStand.herlaad();
      bijWijziging();
      meld("Verstuurd. Ik houd het antwoord in de gaten.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  }

  /**
   * Meedenken. Wat terugkomt gaat níét automatisch de database in: het komt op
   * het scherm met een knop eronder om het als notitie te bewaren. Het model
   * stelt voor, de eigenaar legt vast — hetzelfde uitgangspunt als bij de
   * concepten, en de reden dat er geen enkele automatische schrijfactie naar
   * een taak toe bestaat.
   */
  async function denk(wijze: Denkwijze, extra: { concept?: string; toon?: string; draft_id?: string } = {}) {
    setBezig(`denk-${wijze}`);
    try {
      const uit = await roepFunctie<{ tekst: string; wijze: Denkwijze }>("task-assist", {
        task_id: taakId, wijze, ...extra,
      });
      if (wijze === "herschrijf" && concept) setConcept({ ...concept, tekst: uit.tekst });
      else setGedachte({ wijze, tekst: uit.tekst });
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  }

  async function bewaarGedachte() {
    if (!gedachte) return;
    try {
      await voegNotitieToe(taakId, gedachte.tekst, "onderzoek");
      setGedachte(null);
      notities.herlaad();
      meld("Bewaard als notitie.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  async function bewaarNotitie() {
    const inhoud = notitie.trim();
    if (!inhoud) return;
    try {
      await voegNotitieToe(taakId, inhoud);
      setNotitie("");
      notities.herlaad();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  const openConcept = concepten.data?.find((c) => c.status !== "verstuurd") ?? null;
  const heeftMailbron = (bronnen.data ?? []).some((i) => i.thread_id && !i.uitgesloten);

  return (
    <div className="paneel-achter" onClick={(e) => { if (e.target === e.currentTarget) bijSluiten(); }}>
      <aside className="paneel" role="dialog" aria-label="Taak">
        <header>
          <button className="knop kaal" onClick={bijSluiten} aria-label="Sluiten">{Icoon.sluiten({})}</button>
          <span className="opschrift groei">Taak</span>
          {taak && taak.status !== "afgerond" && (
            <button className="knop klein" onClick={() => wijzig({ status: "afgerond", afgerond_op: new Date().toISOString() }, "Afgerond.")}>
              {Icoon.vink({})} Afronden
            </button>
          )}
        </header>

        {taakStand.laden && <Skelet aantal={2} />}
        {taakStand.fout && <Fout tekst={taakStand.fout} opnieuw={taakStand.herlaad} />}

        {taak && (
          <>
            <div className="kaart" style={{ marginBottom: "1rem" }}>
              <label className="veld">
                <span>Titel</span>
                <input type="text" defaultValue={taak.titel} key={`t-${taak.updated_at}`}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== taak.titel) void wijzig({ titel: v }); }} />
              </label>
              <label className="veld">
                <span>Toelichting</span>
                <textarea defaultValue={taak.toelichting ?? ""} key={`o-${taak.updated_at}`} style={{ minHeight: 90 }}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (taak.toelichting ?? "")) void wijzig({ toelichting: v || null }); }} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.6rem" }}>
                <label className="veld" style={{ marginBottom: 0 }}>
                  <span>Status</span>
                  <select value={taak.status} onChange={(e) => void wijzig({ status: e.target.value as TaakStatus })}>
                    {STATUSSEN.map((s) => <option key={s} value={s}>{STATUS_TEKST[s]}</option>)}
                  </select>
                </label>
                <label className="veld" style={{ marginBottom: 0 }}>
                  <span>Prioriteit</span>
                  <select value={taak.prioriteit} onChange={(e) => void wijzig({ prioriteit: e.target.value as Prioriteit })}>
                    {PRIORITEITEN.map((p) => <option key={p} value={p}>{PRIORITEIT_TEKST[p]}</option>)}
                  </select>
                </label>
                <label className="veld" style={{ marginBottom: 0 }}>
                  <span>Deadline</span>
                  <input type="date" value={taak.deadline ?? ""}
                    onChange={(e) => void wijzig({ deadline: e.target.value || null })} />
                </label>
                <label className="veld" style={{ marginBottom: 0 }}>
                  <span>Project</span>
                  <select value={taak.project_id ?? ""} onChange={(e) => void wijzig({ project_id: e.target.value || null })}>
                    <option value="">— geen —</option>
                    {(projecten.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
                  </select>
                </label>
              </div>
              <p className="mini" style={{ margin: "0.75rem 0 0" }}>
                Aangemaakt {relatief(taak.created_at)} door {taak.aangemaakt_door === "assistent" ? "de assistent" : "jou"}
                {taak.afgerond_op ? ` · afgerond ${relatief(taak.afgerond_op)}` : ""}
              </p>
            </div>

            <section className="sectie">
              <header><h3>Bron</h3></header>
              {bronnen.laden && <Skelet aantal={1} />}
              {!bronnen.laden && (bronnen.data ?? []).length === 0 && (
                <div className="kaart mini">Geen gekoppelde mail. Deze taak staat op zichzelf.</div>
              )}
              <div className="stapel">
                {(bronnen.data ?? []).map((i) => (
                  <div className="kaart" key={i.id}>
                    {i.uitgesloten ? (
                      <p className="klein zacht" style={{ margin: 0 }}>
                        Bericht is uitgesloten van verwerking ({i.uitsluitreden ?? "privacyfilter"}).
                      </p>
                    ) : (
                      <>
                        <div className="rij-tussen">
                          <strong className="klein afkap">{afzenderNaam(i.afzender)}</strong>
                          <span className="mini">{relatief(i.ontvangen_op)}</span>
                        </div>
                        <div className="klein" style={{ marginTop: 2 }}>{i.onderwerp}</div>
                        {i.samenvatting && <p className="mini" style={{ margin: "0.4rem 0 0" }}>{i.samenvatting}</p>}
                        {i.deeplink && (
                          <a className="knop klein" style={{ marginTop: "0.6rem" }} href={i.deeplink} target="_blank" rel="noreferrer">
                            {Icoon.extern({})} Open in Gmail
                          </a>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="sectie">
              <header>
                <h3>Meedenken</h3>
                {bezig?.startsWith("denk-") && <span className="aantal">bezig…</span>}
              </header>
              <div className="kaart">
                <div className="knoprij">
                  {DENKWIJZEN.map((d) => (
                    <button key={d.wijze} className="knop klein" title={d.uitleg}
                      disabled={bezig !== null || (d.draad && !heeftMailbron)}
                      onClick={() => void denk(d.wijze)}>
                      {Icoon.denk({})} {d.label}
                    </button>
                  ))}
                </div>
                {!heeftMailbron && (
                  <p className="mini" style={{ margin: "0.6rem 0 0" }}>
                    Samenvatten en invalshoeken vragen om een gekoppelde mailwisseling; die is er hier niet.
                  </p>
                )}

                {gedachte && (
                  <div style={{ marginTop: "0.8rem" }}>
                    <div className="concept">{gedachte.tekst}</div>
                    <div className="knoppen" style={{ marginTop: "0.6rem" }}>
                      <button className="knop klein primair" onClick={() => void bewaarGedachte()}>
                        Bewaar als notitie
                      </button>
                      <button className="knop klein" onClick={() => setGedachte(null)}>Weg ermee</button>
                    </div>
                  </div>
                )}

                <Uitleg kop="wat hier met je mail gebeurt">
                  <p className="mini" style={{ margin: 0 }}>
                    Bij samenvatten en invalshoeken wordt de mailwisseling opgehaald en aan Claude
                    voorgelegd. Het privacyfilter draait er eerst overheen: zit er in één van de
                    berichten iets dat op patiëntinformatie lijkt, dan wordt de hele aanvraag
                    geweigerd en gaat er niets de deur uit. Hak in stappen gebruikt alleen de titel
                    en de toelichting van de taak.
                  </p>
                </Uitleg>
              </div>
            </section>

            <section className="sectie">
              <header><h3>Antwoord</h3></header>
              {!heeftMailbron ? (
                <div className="kaart mini">Een concept kan alleen bij een taak met een gekoppelde mailwisseling.</div>
              ) : (
                <div className="kaart">
                  {concept ? (
                    <>
                      <div className="concept">{concept.tekst}</div>
                      {/* Herschrijven werkt óók het concept in Gmail bij. Alleen het
                          scherm veranderen zou betekenen dat "versturen" de oude tekst
                          pakt, en dat merk je pas als de mail de deur uit is. */}
                      <p className="mini" style={{ margin: "0.6rem 0 0.3rem" }}>Anders van toon:</p>
                      <div className="chips">
                        {TONEN.map((t) => (
                          <button key={t} className="chip" disabled={bezig !== null}
                            onClick={() => void denk("herschrijf", { concept: concept.tekst, toon: t, draft_id: concept.id })}>
                            {bezig === "denk-herschrijf" ? "…" : t}
                          </button>
                        ))}
                      </div>
                      <p className="mini" style={{ margin: "0.7rem 0" }}>
                        Het concept staat in Gmail. Pas het daar aan als je wilt; versturen kan hier.
                      </p>
                      <div className="knoppen">
                        <button className="knop primair" disabled={bezig !== null} onClick={() => void verstuur(concept.id, 5)}>
                          {bezig === "versturen" ? "Bezig…" : "Versturen en opvolgen"}
                        </button>
                        <button className="knop" onClick={() => setConcept(null)}>Verbergen</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="veld">
                        <span>Wat moet er in het antwoord staan? (optioneel)</span>
                        <textarea value={instructie} onChange={(e) => setInstructie(e.target.value)} style={{ minHeight: 80 }}
                          placeholder="Bijvoorbeeld: bedank voor de begroting, vraag om een toelichting op de kozijnpost en stel een afspraak voor volgende week voor." />
                      </label>
                      <div className="knoppen">
                        <button className="knop primair" disabled={bezig !== null} onClick={() => void schrijfConcept()}>
                          {bezig === "concept" ? "Schrijven…" : "Schrijf een concept"}
                        </button>
                        {openConcept && (
                          <button className="knop" disabled={bezig !== null} onClick={() => void verstuur(openConcept.id, 5)}>
                            Eerder concept versturen
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {(opvolging.data ?? []).length > 0 && (
                <div className="stapel" style={{ marginTop: "0.6rem" }}>
                  {(opvolging.data ?? []).map((f) => (
                    <div className="kaart mini rij" key={f.id}>
                      {Icoon.klok({})}
                      <span className="groei">
                        Verstuurd {relatief(f.verstuurd_op)}.{" "}
                        {f.beantwoord_op
                          ? `Antwoord binnen ${relatief(f.beantwoord_op)}.`
                          : `Nog geen antwoord; ik por na ${f.herinner_na_werkdagen} werkdagen.`}
                      </span>
                      {f.beantwoord_op ? <Merkje kleur="groen">beantwoord</Merkje> : <Merkje kleur="blauw">wacht</Merkje>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="sectie">
              <header><h3>Notities</h3></header>
              <div className="kaart">
                <textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} style={{ minHeight: 70 }}
                  placeholder="Korte aantekening bij deze taak…" />
                <div className="knoppen" style={{ marginTop: "0.5rem" }}>
                  <button className="knop klein" disabled={!notitie.trim()} onClick={() => void bewaarNotitie()}>Bewaren</button>
                </div>
              </div>
              <div className="stapel" style={{ marginTop: "0.6rem" }}>
                {(notities.data ?? []).map((n) => (
                  <div className="kaart" key={n.id}>
                    <div className="mini">{datumLang(n.created_at)}{n.soort === "onderzoek" ? " · onderzoek" : ""}</div>
                    <p className="klein" style={{ margin: "0.3rem 0 0", whiteSpace: "pre-wrap" }}>{n.inhoud}</p>
                  </div>
                ))}
                {!notities.laden && (notities.data ?? []).length === 0 && (
                  <Leeg teken="·">Nog geen notities.</Leeg>
                )}
              </div>
            </section>

            <div className="knoppen" style={{ marginTop: "1.5rem" }}>
              <button className="knop gevaar klein"
                onClick={() => { if (window.confirm("Taak archiveren?")) void wijzig({ gearchiveerd_op: new Date().toISOString() }, "Gearchiveerd."); bijSluiten(); }}>
                Archiveren
              </button>
              {taak.status === "afgerond" && (
                <button className="knop klein" onClick={() => void wijzig({ status: "open", afgerond_op: null }, "Weer open.")}>
                  Heropenen
                </button>
              )}
            </div>
            <p className="mini" style={{ marginTop: "0.75rem" }}>
              {taak.deadline ? `Deadline ${datumKort(taak.deadline)}.` : "Geen deadline."}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

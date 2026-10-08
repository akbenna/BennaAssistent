import { useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Fout, Leeg, Merkje, Skelet, Uitleg, useAsync, useMelding } from "../components/ui";
import { duur, OpnameKnop } from "../components/Opname";
import { useOpname } from "../lib/opname";
import { useSessie } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { bewaarOpnameInstellingen, haalLabels, haalOpnameInstellingen, haalOpnames, haalProjecten, maakSnelleNotitie, verwerkOpnames, vraagNotities } from "../lib/data";
import { verklein } from "../lib/beeld";
import { naarMono, pcmNaarWav, stukkenVan } from "../lib/geluid";
import { kiesFormaat } from "../lib/opnemer";
import { datumKort, tijdKort } from "../lib/format";
import type { NotitieAntwoord, OpnameSoort, OpnameStatus, Project } from "../types/db";

export const SOORT_TEKST: Record<OpnameSoort, string> = {
  vergadering: "Vergadering",
  congres: "Congres of webinar",
  telefoon: "Telefoon",
  notitie: "Notitie",
};

/** Wat je kunt opnemen; een notitie typ je. */
const OPNAME_SOORTEN: OpnameSoort[] = ["vergadering", "congres", "telefoon"];

export const OPNAME_STATUS: Record<OpnameStatus, string> = {
  opname: "Wordt opgenomen",
  verwerken: "Wordt uitgeschreven",
  samenvatten: "In de wachtrij",
  bezig: "Wordt samengevat",
  gereed: "Klaar om na te lezen",
  goedgekeurd: "Nagelezen",
  geweigerd: "Wacht op jou: privacy",
  fout: "Mislukt",
};

export const OPNAME_KLEUR: Partial<Record<OpnameStatus, "accent" | "groen" | "rood" | "blauw" | "amber">> = {
  gereed: "amber",
  geweigerd: "rood",
  fout: "rood",
  verwerken: "blauw",
  samenvatten: "blauw",
  bezig: "blauw",
};

export function Notities() {
  const [zoek, setZoek] = useState("");
  const [gezocht, setGezocht] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [soort, setSoort] = useState<OpnameSoort>("vergadering");
  const [upload, setUpload] = useState<string | null>(null);
  const bestand = useRef<HTMLInputElement>(null);
  const opname = useOpname();
  const naar = useNavigate();
  const meld = useMelding();

  const projecten = useAsync(() => haalProjecten(), []);
  const lijst = useAsync(() => haalOpnames({ zoek: gezocht, label }), [gezocht, label, opname.fase]);
  const labels = useAsync(() => haalLabels(), [opname.fase]);

  const verwerkBestand = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setUpload("Bestand wordt voorbereid…");
      const stukken = await stukkenVan(f);
      const { data: n, error } = await supabase.from("notities").insert({
        bron: "upload", status: "opname", titel: f.name.replace(/\.[^.]+$/, ""),
        gestart_op: new Date(f.lastModified || Date.now()).toISOString(),
        project_id: projectId, project_vast: Boolean(projectId), soort, modellen: { bestandsnaam: f.name },
      }).select("id,owner_id").single();
      if (error || !n) throw new Error(error?.message ?? "Kon geen notitie aanmaken");
      const { id, owner_id } = n as { id: string; owner_id: string };
      for (const [i, s] of stukken.entries()) {
        setUpload(`Deel ${i + 1} van ${stukken.length} wordt geüpload…`);
        const nr = i + 1;
        const type = s.blob.type || f.type || "audio/mp4";
        const ext = type.includes("wav") ? "wav" : (f.name.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "m4a").toLowerCase();
        const { error: e1 } = await supabase.from("notitie_delen").insert({
          notitie_id: id, volgnummer: nr, mime: type, begin_sec: s.beginSec, duur_sec: s.duurSec, status: "opname",
        });
        if (e1) throw new Error(e1.message);
        const pad = `${owner_id}/${id}/deel-${String(nr).padStart(3, "0")}/blok-00001.${ext}`;
        const { error: e2 } = await supabase.storage.from("opnames").upload(pad, s.blob, { contentType: type, upsert: true });
        if (e2) throw new Error(`Uploaden mislukt: ${e2.message}`);
        await supabase.from("notitie_delen").update({ status: "klaar" }).eq("notitie_id", id).eq("volgnummer", nr);
      }
      await supabase.from("notities").update({ status: "verwerken" }).eq("id", id);
      void verwerkOpnames();
      naar(`/notities/${id}`);
    } catch (err) {
      meld(err instanceof Error ? err.message : String(err), "fout");
    } finally {
      setUpload(null);
    }
  };

  return (
    <>
      <section className="sectie">
        <header><h2>Opnemen</h2></header>
        <div className="kaart">
          {/* De soort bepaalt de toon: bij een congres per spreker wat er werd
              beweerd en waarop, met de slides en de bronnen erbij. */}
          <div className="chips" role="radiogroup" aria-label="Wat voor gesprek is dit?" style={{ marginBottom: "0.5rem" }}>
            {OPNAME_SOORTEN.map((s) => (
              <button type="button" key={s} className={`chip${soort === s ? " aan" : ""}`} role="radio" aria-checked={soort === s}
                disabled={opname.fase !== "klaar"} onClick={() => setSoort(s)}>{SOORT_TEKST[s]}</button>
            ))}
          </div>
          <div className="chips" role="radiogroup" aria-label="Bij welk project hoort dit?">
            <button type="button" className={`chip${!projectId ? " aan" : ""}`} role="radio" aria-checked={!projectId} disabled={opname.fase !== "klaar"} onClick={() => setProjectId(null)}>Automatisch</button>
            {(projecten.data ?? []).map((p) => (
              <button type="button" className={`chip${projectId === p.id ? " aan" : ""}`} role="radio" key={p.id} aria-checked={projectId === p.id} disabled={opname.fase !== "klaar"} onClick={() => setProjectId(p.id)}>{p.naam}</button>
            ))}
          </div>
          <OpnameKnop projectId={projectId} soort={soort} />
          {soort === "congres" && opname.fase === "klaar" && (
            <p className="mini" style={{ margin: "0.4rem 0 0" }}>Tijdens de opname maak je met Slide een foto van wat er op het scherm staat; met de ster markeer je een moment dat je wilt terugvinden.</p>
          )}
          {opname.fase === "klaar" && (
            <div className="opnamebestand">
              <button type="button" className="knop" onClick={() => bestand.current?.click()} disabled={Boolean(upload)}>
                {upload ?? "Audiobestand verwerken"}
              </button>
              <input ref={bestand} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" hidden onChange={(e) => void verwerkBestand(e)} />
              <p className="mini">Spraakmemo, gespreksopname van de iPhone of een WAV uit SwyxIt. Op Automatisch kiest de assistent het project uit je agenda en het gesprek.</p>
            </div>
          )}
        </div>
      </section>

      <SnelleNotitie projecten={projecten.data ?? []} />

      <VraagHet />

      <section className="sectie">
        <header>
          <h2>Notities</h2>
          <span className="aantal">{lijst.data?.length || ""}</span>
          <Link className="mini" to="/nascholing" style={{ marginLeft: "auto" }}>Nascholingslogboek</Link>
        </header>
        {(labels.data ?? []).length > 0 && (
          <div className="chips" role="radiogroup" aria-label="Filter op label" style={{ marginBottom: "0.5rem" }}>
            <button type="button" className={`chip${!label ? " aan" : ""}`} role="radio" aria-checked={!label} onClick={() => setLabel(null)}>Alle</button>
            {(labels.data ?? []).slice(0, 20).map((l) => (
              <button type="button" key={l.label} className={`chip${label === l.label ? " aan" : ""}`} role="radio" aria-checked={label === l.label}
                onClick={() => setLabel(label === l.label ? null : l.label)}>#{l.label}</button>
            ))}
          </div>
        )}
        <form className="zoekregel" role="search" onSubmit={(e) => { e.preventDefault(); setGezocht(zoek); }}>
          <input type="search" placeholder="Zoek op onderwerp, naam of afspraak" aria-label="Zoeken" value={zoek}
            onChange={(e) => { setZoek(e.target.value); if (!e.target.value) setGezocht(""); }} />
        </form>
        {lijst.laden && <Skelet />}
        {lijst.fout && <Fout tekst={lijst.fout} opnieuw={lijst.herlaad} />}
        <div className="stapel">
          {(lijst.data ?? []).map((n) => (
            <Link className="kaart taak" key={n.id} to={`/notities/${n.id}`}>
              <div className="titel">{n.titel || "Zonder titel"}</div>
              <div className="meta">
                <span className="mini">{datumKort(n.gestart_op)} {tijdKort(n.gestart_op)}{n.duur_sec ? ` · ${duur(n.duur_sec)}` : ""}</span>
                {n.soort !== "vergadering" && <Merkje>{SOORT_TEKST[n.soort]}</Merkje>}
                {n.projects && <Merkje>{n.projects.naam}</Merkje>}
                {n.status !== "goedgekeurd" && <Merkje kleur={OPNAME_KLEUR[n.status]}>{n.bron === "tekst" && (n.status === "opname" || n.status === "verwerken") ? "Wordt verwerkt" : OPNAME_STATUS[n.status]}</Merkje>}
                {(n.labels ?? []).slice(0, 3).map((l) => <span className="mini" key={l}>#{l}</span>)}
              </div>
            </Link>
          ))}
        </div>
        {!lijst.laden && (lijst.data ?? []).length === 0 && (
          <Leeg teken="●">{gezocht || label ? "Niets gevonden." : "Nog geen notities. Neem je eerste overleg op met de knop hierboven."}</Leeg>
        )}
      </section>

      <StemEnBewaren />
    </>
  );
}

/** Labels uit een vrij veld: "poh, #financiering diabetes" wordt drie labels. */
export function leesLabelVeld(v: string): string[] {
  const uit: string[] = [];
  for (const d of v.split(/[,;\s]+/)) {
    const l = d.trim().toLocaleLowerCase("nl").replace(/^#+/, "").slice(0, 30);
    if (l && !uit.includes(l)) uit.push(l);
  }
  return uit.slice(0, 12);
}

/**
 * Een notitie zonder opname: wat je typt, een foto van een whiteboard of
 * flipover, een link naar een artikel. Hij gaat door dezelfde verwerking als
 * een opname, dus ook hier worden taken voorstellen en komt er een Google Doc.
 */
function SnelleNotitie({ projecten }: { projecten: Project[] }) {
  const { sessie } = useSessie();
  const [tekst, setTekst] = useState("");
  const [link, setLink] = useState("");
  const [labels, setLabels] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [bezig, setBezig] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const naar = useNavigate();
  const meld = useMelding();
  const linkFout = link.trim() && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(link.trim());
  const leeg = !tekst.trim() && !link.trim() && !fotos.length;

  const bewaar = async () => {
    if (leeg || linkFout || !sessie) return;
    setBezig(true);
    try {
      const klein = await Promise.all(fotos.map((f) => verklein(f)));
      const id = await maakSnelleNotitie({
        eigenaar: sessie.user.id, tekst: tekst.trim(), link: link.trim() || null,
        projectId, labels: leesLabelVeld(labels), fotos: klein,
      });
      naar(`/notities/${id}`);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
      setBezig(false);
    }
  };

  return (
    <section className="sectie">
      <header><h2>Notitie</h2></header>
      <form className="kaart snelnotitie" onSubmit={(e) => { e.preventDefault(); void bewaar(); }}>
        <textarea rows={4} value={tekst} onChange={(e) => setTekst(e.target.value)} maxLength={20000}
          placeholder="Wat wil je vastleggen? Een gedachte, een afspraak, wat er op het whiteboard stond." aria-label="Notitie" />
        <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)}
          placeholder="Link naar een artikel (mag leeg)" aria-label="Link" aria-invalid={Boolean(linkFout)} />
        {linkFout && <p className="mini" style={{ margin: 0, color: "var(--fout)" }}>Dat is geen link die met http of https begint.</p>}
        <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Labels, bijvoorbeeld poh, financiering (mag leeg)" aria-label="Labels" />
        <div className="chips" role="radiogroup" aria-label="Bij welk project hoort dit?">
          <button type="button" className={`chip${!projectId ? " aan" : ""}`} role="radio" aria-checked={!projectId} onClick={() => setProjectId(null)}>Automatisch</button>
          {projecten.map((p) => (
            <button type="button" className={`chip${projectId === p.id ? " aan" : ""}`} role="radio" key={p.id} aria-checked={projectId === p.id} onClick={() => setProjectId(p.id)}>{p.naam}</button>
          ))}
        </div>
        <div className="knoprij" style={{ flexWrap: "wrap" }}>
          <button type="button" className="knop" onClick={() => camera.current?.click()}>
            Foto{fotos.length ? `'s: ${fotos.length}` : " toevoegen"}
          </button>
          <input ref={camera} type="file" accept="image/*" multiple hidden
            onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; setFotos((x) => [...x, ...f].slice(0, 10)); }} />
          {fotos.length > 0 && <button type="button" className="knop klein" onClick={() => setFotos([])}>Foto's weg</button>}
          <button type="submit" className="knop primair" disabled={leeg || Boolean(linkFout) || bezig}>{bezig ? "Bewaren…" : "Bewaar"}</button>
        </div>
        <p className="mini" style={{ margin: 0 }}>De assistent maakt er een nette notitie van, zet taken als voorstel klaar en haalt bij een link de tekst van het artikel op.</p>
      </form>
    </section>
  );
}

/**
 * Een vraag aan al je notities. Het antwoord komt alleen uit je eigen
 * notities, met bij elke bewering het nummer van de notitie waar het staat.
 */
function VraagHet() {
  const [vraag, setVraag] = useState("");
  const [antwoord, setAntwoord] = useState<NotitieAntwoord | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const stel = async () => {
    if (vraag.trim().length < 3) return;
    setBezig(true); setFout(null); setAntwoord(null);
    try { setAntwoord(await vraagNotities(vraag.trim())); }
    catch (e) { setFout(e instanceof Error ? e.message : String(e)); }
    finally { setBezig(false); }
  };

  return (
    <section className="sectie">
      <header><h2>Vraag het je notities</h2></header>
      <form className="kaart vraaghet" onSubmit={(e) => { e.preventDefault(); void stel(); }}>
        <div className="knoprij">
          <input value={vraag} onChange={(e) => setVraag(e.target.value)} maxLength={500} style={{ flex: 1, minWidth: 0 }}
            placeholder="Wat spraken we met de zorggroep af over de POH-uren?" aria-label="Vraag" />
          <button type="submit" className="knop primair" disabled={bezig || vraag.trim().length < 3}>{bezig ? "Zoeken…" : "Vraag"}</button>
        </div>
        {fout && <p className="mini" role="alert" style={{ color: "var(--fout)", margin: 0 }}>{fout}</p>}
        {antwoord && (
          <div className="antwoord" role="status">
            {antwoord.antwoord.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
            {antwoord.bronnen.length > 0 && (
              <ol className="mini">
                {antwoord.bronnen.map((b) => (
                  <li key={b.id}>
                    <Link to={`/notities/${b.id}`}>{b.titel}</Link>, {datumKort(b.datum)}
                    {b.citaat && <><br /><i>"{b.citaat}"</i></>}
                  </li>
                ))}
              </ol>
            )}
            {!antwoord.gevonden && <p className="mini" style={{ margin: 0 }}>Niets gevonden betekent: niet in een afgeronde notitie. Notities die nog verwerkt worden, doen nog niet mee.</p>}
          </div>
        )}
      </form>
    </section>
  );
}

/* Acht seconden van je eigen stem, zodat de spraakherkenning jou bij naam
   noemt en jouw actiepunten ook echt bij jou terechtkomen. De opname wordt
   hier omgezet naar WAV, omdat de serverfunctie geen geluid kan omzetten. */
function StemEnBewaren() {
  const { sessie } = useSessie();
  const uid = sessie?.user.id ?? "";
  const inst = useAsync(() => haalOpnameInstellingen(), []);
  const [stem, setStem] = useState<string | null>(null);
  const meld = useMelding();
  const huidig = inst.data ?? { owner_id: uid, mijn_naam: "Abdelkader", stemreferentie_pad: null, bewaartermijn_audio_dagen: 30 };

  const bewaar = async (velden: Parameters<typeof bewaarOpnameInstellingen>[1]) => {
    try { await bewaarOpnameInstellingen(uid, velden); inst.herlaad(); } catch (e) { meld(String(e), "fout"); }
  };

  const neemOp = async () => {
    try {
      const f = kiesFormaat();
      const stroom = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stroom, f.mime ? { mimeType: f.mime } : undefined);
      const delen: Blob[] = [];
      rec.ondataavailable = (e) => delen.push(e.data);
      rec.start();
      for (let i = 8; i > 0; i--) { setStem(`Praat gewoon door… ${i}`); await new Promise((k) => setTimeout(k, 1000)); }
      await new Promise<void>((k) => { rec.onstop = () => k(); rec.stop(); });
      stroom.getTracks().forEach((t) => t.stop());
      const ctx = new OfflineAudioContext(1, 16000, 16000);
      const audio = await ctx.decodeAudioData(await new Blob(delen, { type: f.type }).arrayBuffer());
      const mono = naarMono(Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)));
      const wav = pcmNaarWav(mono.subarray(0, 16000 * 9.5), audio.sampleRate);
      const pad = `${uid}/stem/referentie.wav`;
      const { error } = await supabase.storage.from("opnames").upload(pad, wav, { contentType: "audio/wav", upsert: true });
      if (error) throw new Error(error.message);
      await bewaar({ stemreferentie_pad: pad });
      setStem("Stem opgeslagen. Je wordt voortaan bij naam herkend in transcripten.");
    } catch (e) {
      setStem(`Dat lukte niet: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className="sectie">
      <Uitleg kop="Stem, naam en bewaartermijn">
        <label className="veld">
          <span>Mijn naam in transcripten</span>
          <input defaultValue={huidig.mijn_naam} key={huidig.mijn_naam}
            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== huidig.mijn_naam) void bewaar({ mijn_naam: e.target.value.trim() }); }} />
        </label>
        <p className="klein">Neem acht seconden van je eigen stem op, zonder anderen op de achtergrond. Daarmee herkent de spraakherkenning wie jij bent, zodat actiepunten goed worden toegewezen.</p>
        <button type="button" className="knop klein" onClick={() => void neemOp()} disabled={stem?.startsWith("Praat") ?? false}>
          {huidig.stemreferentie_pad ? "Stem opnieuw opnemen" : "Stem opnemen"}
        </button>
        {stem && <p className="mini" role="status">{stem}</p>}
        <label className="veld" style={{ marginTop: "0.8rem" }}>
          <span>Audio bewaren na goedkeuren (dagen)</span>
          <input type="number" min={0} max={365} defaultValue={huidig.bewaartermijn_audio_dagen} key={huidig.bewaartermijn_audio_dagen}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n) && n >= 0 && n <= 365 && n !== huidig.bewaartermijn_audio_dagen) void bewaar({ bewaartermijn_audio_dagen: n });
            }} />
        </label>
        <p className="mini">Na goedkeuren wordt alleen de audio gewist; transcript en samenvatting blijven staan.</p>
      </Uitleg>
    </section>
  );
}

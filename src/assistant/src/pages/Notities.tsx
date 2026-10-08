import { useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Fout, Leeg, Merkje, Skelet, Uitleg, useAsync, useMelding } from "../components/ui";
import { duur, OpnameKnop } from "../components/Opname";
import { useOpname } from "../lib/opname";
import { useSessie } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { bewaarOpnameInstellingen, haalOpnameInstellingen, haalOpnames, haalProjecten, verwerkOpnames } from "../lib/data";
import { naarMono, pcmNaarWav, stukkenVan } from "../lib/geluid";
import { kiesFormaat } from "../lib/opnemer";
import { datumKort, tijdKort } from "../lib/format";
import type { OpnameStatus } from "../types/db";

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
  const [upload, setUpload] = useState<string | null>(null);
  const bestand = useRef<HTMLInputElement>(null);
  const opname = useOpname();
  const naar = useNavigate();
  const meld = useMelding();

  const projecten = useAsync(() => haalProjecten(), []);
  const lijst = useAsync(() => haalOpnames({ zoek: gezocht }), [gezocht, opname.fase]);

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
        project_id: projectId, project_vast: Boolean(projectId), modellen: { bestandsnaam: f.name },
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
          <div className="chips" role="radiogroup" aria-label="Bij welk project hoort dit?">
            <button type="button" className={`chip${!projectId ? " aan" : ""}`} role="radio" aria-checked={!projectId} disabled={opname.fase !== "klaar"} onClick={() => setProjectId(null)}>Automatisch</button>
            {(projecten.data ?? []).map((p) => (
              <button type="button" className={`chip${projectId === p.id ? " aan" : ""}`} role="radio" key={p.id} aria-checked={projectId === p.id} disabled={opname.fase !== "klaar"} onClick={() => setProjectId(p.id)}>{p.naam}</button>
            ))}
          </div>
          <OpnameKnop projectId={projectId} />
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

      <section className="sectie">
        <header>
          <h2>Notities</h2>
          <span className="aantal">{lijst.data?.length || ""}</span>
        </header>
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
                {n.projects && <Merkje>{n.projects.naam}</Merkje>}
                {n.status !== "goedgekeurd" && <Merkje kleur={OPNAME_KLEUR[n.status]}>{OPNAME_STATUS[n.status]}</Merkje>}
              </div>
            </Link>
          ))}
        </div>
        {!lijst.laden && (lijst.data ?? []).length === 0 && (
          <Leeg teken="●">{gezocht ? "Niets gevonden." : "Nog geen notities. Neem je eerste overleg op met de knop hierboven."}</Leeg>
        )}
      </section>

      <StemEnBewaren />
    </>
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

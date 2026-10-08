/**
 * DE OPNAME LEEFT BOVEN DE PAGINA'S
 *
 * Een vergadering duurt anderhalf uur, en in die tijd wil je een taak opzoeken
 * of een voorstel wegklikken zonder dat de opname stopt. Daarom hangt de
 * opnemer hier, rond de hele app, en niet in één pagina: navigeren breekt hem
 * niet af. Een balk bovenin laat zien dat hij loopt, op elke pagina.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { verwerkOpnames, voegFotoToe } from "./data";
import { verklein } from "./beeld";
import type { OpnameSoort } from "../types/db";
import { Opnemer } from "./opnemer";

export type Fase = "klaar" | "bezig" | "afronden";

interface OpnameStand {
  fase: Fase;
  seconden: number;
  niveau: number;
  wachtrij: number;
  melding: string | null;
  notitieId: string | null;
  kanOpnemen: boolean;
  begin: (projectId?: string | null, soort?: OpnameSoort) => Promise<void>;
  stop: () => Promise<string | null>;
  /** Zet een markering op dit moment: "dit is belangrijk". */
  markeer: () => void;
  markeringen: number;
  /** Een foto van een slide, met het moment in de opname erbij. */
  foto: (bestand: Blob) => Promise<void>;
  fotos: number;
}

const Ctx = createContext<OpnameStand | null>(null);

export function useOpname(): OpnameStand {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOpname buiten OpnameProvider");
  return c;
}

export function OpnameProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>("klaar");
  const [seconden, setSeconden] = useState(0);
  const [niveau, setNiveau] = useState(0);
  const [wachtrij, setWachtrij] = useState(0);
  const [melding, setMelding] = useState<string | null>(null);
  const [notitieId, setNotitieId] = useState<string | null>(null);
  const opnemer = useRef<Opnemer | null>(null);
  const eigenaar = useRef<string>("");
  const markeringenRef = useRef<number[]>([]);
  const [markeringen, setMarkeringen] = useState(0);
  const [fotos, setFotos] = useState(0);
  const kanOpnemen = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (fase !== "bezig") return;
    const t = window.setInterval(() => setSeconden(opnemer.current?.seconden ?? 0), 500);
    // Wie de app per ongeluk sluit, krijgt eerst de vraag of dat de bedoeling is.
    const waarschuw = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", waarschuw);
    return () => { window.clearInterval(t); window.removeEventListener("beforeunload", waarschuw); };
  }, [fase]);

  const begin = useCallback(async (projectId?: string | null, soort: OpnameSoort = "vergadering") => {
    if (opnemer.current) return;
    setMelding(null);
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) { setMelding("Je bent niet ingelogd."); return; }
    const { data, error } = await supabase.from("notities").insert({
      bron: "app", status: "opname", gestart_op: new Date().toISOString(),
      project_id: projectId ?? null, project_vast: Boolean(projectId), soort,
    }).select("id").single();
    if (error || !data) { setMelding(`Kon geen notitie aanmaken: ${error?.message ?? "onbekend"}`); return; }
    const id = (data as { id: string }).id;
    const o = new Opnemer(uid, id, {
      niveau: setNiveau, wachtrij: setWachtrij, melding: setMelding,
      // Een deel staat boven: laat de server het alvast uitschrijven.
      deelKlaar: () => { void verwerkOpnames(); },
    });
    try {
      await o.begin();
    } catch (e) {
      await supabase.from("notities").delete().eq("id", id);
      const f = e as { name?: string; message?: string };
      setMelding(f.name === "NotAllowedError"
        ? "Geef de app toegang tot de microfoon in de instellingen van je browser."
        : `Opnemen lukt niet: ${f.message ?? "onbekende fout"}`);
      return;
    }
    opnemer.current = o;
    eigenaar.current = uid;
    markeringenRef.current = [];
    setMarkeringen(0);
    setFotos(0);
    setNotitieId(id);
    setSeconden(0);
    setFase("bezig");
  }, []);

  const stop = useCallback(async () => {
    const o = opnemer.current;
    const id = notitieId;
    if (!o || !id) return null;
    setFase("afronden");
    const compleet = await o.stop();
    const klaarzetten = async () => {
      await supabase.from("notities").update({ status: "verwerken", duur_sec: Math.round(o.seconden) }).eq("id", id);
      void verwerkOpnames();
    };
    if (compleet) {
      await klaarzetten();
    } else {
      setMelding("Nog niet alles is geüpload. Laat de app open; de opname wordt verwerkt zodra de verbinding terug is.");
      void o.pomp();
      const t = window.setInterval(() => {
        if (!o.openstaand) { window.clearInterval(t); void klaarzetten(); setMelding(null); }
      }, 2000);
    }
    opnemer.current = null;
    setFase("klaar");
    setNiveau(0);
    setNotitieId(null);
    return id;
  }, [notitieId]);

  const markeer = useCallback(() => {
    const o = opnemer.current;
    const id = notitieId;
    if (!o || !id) return;
    markeringenRef.current = [...markeringenRef.current, Math.round(o.seconden)];
    setMarkeringen(markeringenRef.current.length);
    // De hele lijst, niet een toevoeging: twee snelle tikken mogen elkaar niet overschrijven.
    supabase.from("notities").update({ markeringen: markeringenRef.current }).eq("id", id).then(() => {}, () => {});
  }, [notitieId]);

  const foto = useCallback(async (bestand: Blob) => {
    const o = opnemer.current;
    const id = notitieId;
    if (!o || !id) return;
    const moment = Math.round(o.seconden);
    try {
      await voegFotoToe(id, eigenaar.current, await verklein(bestand), moment);
      setFotos((n) => n + 1);
      // De server kan hem alvast lezen, terwijl de opname doorloopt.
      void verwerkOpnames();
    } catch (e) {
      setMelding(e instanceof Error ? e.message : String(e));
    }
  }, [notitieId]);

  return (
    <Ctx.Provider value={{ fase, seconden, niveau, wachtrij, melding, notitieId, kanOpnemen, begin, stop, markeer, markeringen, foto, fotos }}>
      {children}
    </Ctx.Provider>
  );
}

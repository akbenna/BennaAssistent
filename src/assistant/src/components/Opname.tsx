import { useRef, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icoon } from "./ui";
import { useOpname } from "../lib/opname";
import type { OpnameSoort } from "../types/db";

export const duur = (s: number | null | undefined): string => {
  if (s == null || !Number.isFinite(s)) return "";
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * DE KNOP
 *
 * Eén tik en hij neemt op; nog een tik en hij stopt en gaat naar de notitie.
 * De ring om de knop beweegt met het geluid mee, zodat je ziet dát hij hoort,
 * ook als het scherm op tafel ligt.
 */
export function OpnameKnop({ projectId, soort = "vergadering", compact = false }: { projectId?: string | null; soort?: OpnameSoort; compact?: boolean }) {
  const o = useOpname();
  const naar = useNavigate();
  const aan = o.fase !== "klaar";
  const klik = async () => {
    if (o.fase === "bezig") {
      const id = await o.stop();
      if (id) naar(`/notities/${id}`);
    } else if (o.fase === "klaar") {
      await o.begin(projectId ?? null, soort);
    }
  };
  const stijl = { "--niveau": o.niveau } as CSSProperties;
  return (
    <div className={`opnamevlak${compact ? " compact" : ""}`}>
      <button
        type="button"
        className={`opnameknop${aan ? " aan" : ""}`}
        style={stijl}
        onClick={() => void klik()}
        disabled={!o.kanOpnemen || o.fase === "afronden"}
        aria-label={aan ? "Opname stoppen" : "Opname starten"}
      >
        <span className="ring" aria-hidden="true" />
        <span className="kern" aria-hidden="true" />
      </button>
      <div className="opnametekst">
        <b>{aan ? duur(o.seconden) : "Opnemen"}</b>
        <span className="mini">
          {o.fase === "klaar" && (o.kanOpnemen ? "Vergadering, overleg of telefoon. Zeg aan het begin dat je opneemt." : "Deze browser kan niet opnemen.")}
          {o.fase === "bezig" && (o.wachtrij > 1 ? `${o.wachtrij} stukken wachten op upload` : "Wordt elke dertig seconden veiliggesteld")}
          {o.fase === "afronden" && "Laatste stuk wordt geüpload…"}
        </span>
      </div>
      {o.melding && <p className="mini opnamemelding" role="status">{o.melding}</p>}
    </div>
  );
}

/**
 * Op elke pagina zichtbaar zolang er wordt opgenomen; navigeren stopt de
 * opname niet. Twee knoppen voor tijdens een lezing: een foto van de slide die
 * nu op het scherm staat, en een markering voor "dit wil ik terugvinden".
 * Allebei krijgen ze het moment in de opname mee.
 */
export function OpnameBalk() {
  const o = useOpname();
  const naar = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  if (o.fase === "klaar") return null;
  const stop = async () => {
    const id = await o.stop();
    if (id) naar(`/notities/${id}`);
  };
  return (
    <div className="opnamebalk" role="status">
      <span className="lamp" aria-hidden="true" />
      <Link to="/notities">Opname loopt · {duur(o.seconden)}</Link>
      {o.fase === "bezig" && (
        <>
          <button type="button" className="knop klein" onClick={() => camera.current?.click()} aria-label="Foto van een slide maken">
            {Icoon.camera({})} Slide{o.fotos ? ` ${o.fotos}` : ""}
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void o.foto(f); }} />
          <button type="button" className="knop klein" onClick={o.markeer} aria-label="Dit moment markeren">
            {Icoon.ster({})}{o.markeringen ? ` ${o.markeringen}` : ""}
          </button>
        </>
      )}
      <button type="button" className="knop klein" onClick={() => void stop()} disabled={o.fase === "afronden"}>
        {o.fase === "afronden" ? "Afronden…" : <>{Icoon.vink({})} Stop</>}
      </button>
    </div>
  );
}

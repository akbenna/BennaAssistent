import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { NieuweTaak } from "./Taken";
import { useAsync } from "../components/ui";
import { haalProjecten } from "../lib/data";

const DEELCACHE = "benna-deel";
const DEELSLEUTEL = "/__gedeeld";

interface Gedeeld { titel: string; tekst: string; url: string }

/**
 * DE INGANG VANUIT HET DEELMENU VAN JE TELEFOON
 *
 * Er zijn twee wegen hierheen. De nieuwe: het deelmenu stuurt een POST, de
 * service worker legt de inhoud in een cache op het apparaat zelf en stuurt
 * je door met `?deel=1`. Hier halen we het op en wissen het meteen — het hoort
 * in een taak thuis, niet in een cache.
 *
 * De oude weg met de inhoud in het adres blijft werken, want een geïnstalleerde
 * webapp houdt zijn manifest soms dagen vast, en een deelactie die stilletjes
 * niets doet is erger dan een adres met tekst erin.
 */
export function Delen() {
  const [params] = useSearchParams();
  const navigeer = useNavigate();
  const projecten = useAsync(() => haalProjecten(), []);
  const [uitCache, setUitCache] = useState<Gedeeld | null>(null);
  const [wachten, setWachten] = useState(params.get("deel") === "1");

  useEffect(() => {
    if (params.get("deel") !== "1") return;
    let actueel = true;
    (async () => {
      try {
        const c = await caches.open(DEELCACHE);
        const r = await c.match(DEELSLEUTEL);
        if (r) {
          const d = (await r.json()) as Gedeeld;
          await c.delete(DEELSLEUTEL);
          if (actueel) setUitCache(d);
        }
      } catch {
        /* Geen cache beschikbaar: dan opent het formulier leeg. */
      } finally {
        if (actueel) setWachten(false);
      }
    })();
    return () => { actueel = false; };
  }, [params]);

  const { titel, toelichting } = useMemo(() => {
    const t = uitCache?.titel ?? params.get("titel") ?? "";
    const tekst = uitCache?.tekst ?? params.get("tekst") ?? "";
    const url = uitCache?.url ?? params.get("url") ?? "";
    const regels = [tekst, url].filter(Boolean).join("\n\n");
    const eersteRegel = (t || tekst).split("\n")[0] ?? "";
    return {
      titel: eersteRegel.slice(0, 120) || "Gedeeld bericht",
      toelichting: regels,
    };
  }, [params, uitCache]);

  if (wachten) return <p className="mini">Even laden…</p>;

  return (
    <NieuweTaak
      projecten={(projecten.data ?? []).map((p) => ({ id: p.id, naam: p.naam }))}
      beginTitel={titel}
      beginToelichting={toelichting}
      bijSluiten={() => navigeer("/taken", { replace: true })}
      bijBewaren={() => navigeer("/taken", { replace: true })}
    />
  );
}

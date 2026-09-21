import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { NieuweTaak } from "./Taken";
import { useAsync } from "../components/ui";
import { haalProjecten } from "../lib/data";

/** Doel van het deelmenu: WhatsApp of een browser deelt iets met BennaAssistent. */
export function Delen() {
  const [params] = useSearchParams();
  const navigeer = useNavigate();
  const projecten = useAsync(() => haalProjecten(), []);

  const { titel, toelichting } = useMemo(() => {
    const t = params.get("titel") ?? "";
    const tekst = params.get("tekst") ?? "";
    const url = params.get("url") ?? "";
    const regels = [tekst, url].filter(Boolean).join("\n\n");
    const eersteRegel = (t || tekst).split("\n")[0] ?? "";
    return {
      titel: eersteRegel.slice(0, 120) || "Gedeeld bericht",
      toelichting: regels,
    };
  }, [params]);

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

import { useState } from "react";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { TaakPaneel } from "../components/TaakPaneel";
import { afzenderNaam, datumKort, knip, relatief } from "../lib/format";
import { haalBronnenVoorTaken, haalTaken, werkTaakBij } from "../lib/data";

export function Voorstellen() {
  const [ronde, setRonde] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const meld = useMelding();

  const voorstellen = useAsync(() => haalTaken({ statussen: ["voorstel"], limiet: 60 }), [ronde]);
  const ids = (voorstellen.data ?? []).map((t) => t.id).join(",");
  const bronnen = useAsync(() => haalBronnenVoorTaken(ids ? ids.split(",") : []), [ids]);

  const ververs = () => setRonde((r) => r + 1);

  async function beslis(id: string, akkoord: boolean) {
    setBezig(id);
    try {
      await werkTaakBij(id, akkoord
        ? { status: "open" }
        : { status: "vervallen", gearchiveerd_op: new Date().toISOString() });
      meld(akkoord ? "Op je lijst gezet." : "Voorstel verworpen.");
      ververs();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  }

  return (
    <>
      <div className="sectie">
        <p className="opschrift">Uit je mail gehaald</p>
        <h1>Voorstellen</h1>
        <p className="klein zacht" style={{ marginTop: "0.4rem" }}>
          Niets hiervan staat op je lijst tot jij het accepteert.
        </p>
      </div>

      {voorstellen.laden && <Skelet aantal={4} />}
      {voorstellen.fout && <Fout tekst={voorstellen.fout} opnieuw={voorstellen.herlaad} />}

      <div className="stapel">
        {(voorstellen.data ?? []).map((taak) => {
          const bron = (bronnen.data?.[taak.id] ?? []).find((i) => !i.uitgesloten);
          return (
            <article className="kaart" key={taak.id}>
              <button type="button" className="taak" style={{ background: "none", border: "none", padding: 0 }}
                onClick={() => setOpen(taak.id)}>
                <div className="titel">{taak.titel}</div>
              </button>
              {taak.toelichting && <p className="klein zacht" style={{ margin: "0.35rem 0 0" }}>{knip(taak.toelichting, 220)}</p>}

              {bron && (
                <div className="mini rij" style={{ marginTop: "0.6rem", gap: "0.4rem" }}>
                  {Icoon.mail({})}
                  <span className="afkap groei">
                    {afzenderNaam(bron.afzender)} — {bron.onderwerp}
                  </span>
                  <span>{relatief(bron.ontvangen_op)}</span>
                </div>
              )}

              <div className="meta" style={{ marginTop: "0.5rem" }}>
                {taak.deadline && <Merkje kleur="accent">{datumKort(taak.deadline)}</Merkje>}
                {taak.prioriteit !== "normaal" && <Merkje>{taak.prioriteit}</Merkje>}
                {taak.projects && (
                  <Merkje>
                    <span className="stip" style={taak.projects.kleur ? { background: taak.projects.kleur } : undefined} />
                    {taak.projects.naam}
                  </Merkje>
                )}
              </div>

              <div className="knoppen" style={{ marginTop: "0.75rem" }}>
                <button className="knop primair klein" disabled={bezig === taak.id} onClick={() => void beslis(taak.id, true)}>
                  {Icoon.vink({})} Op mijn lijst
                </button>
                <button className="knop klein" disabled={bezig === taak.id} onClick={() => void beslis(taak.id, false)}>
                  Niet doen
                </button>
                {bron?.deeplink && (
                  <a className="knop klein" href={bron.deeplink} target="_blank" rel="noreferrer">
                    {Icoon.extern({})} Mail
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!voorstellen.laden && (voorstellen.data ?? []).length === 0 && (
        <Leeg teken="✓">Geen openstaande voorstellen. De assistent kijkt elke tien minuten opnieuw.</Leeg>
      )}

      {open && <TaakPaneel taakId={open} bijSluiten={() => setOpen(null)} bijWijziging={ververs} />}
    </>
  );
}

import { useState } from "react";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { PRIORITEIT_TEKST } from "../components/TaakKaart";
import { TaakPaneel } from "../components/TaakPaneel";
import { afzenderNaam, datumKort, knip, relatief } from "../lib/format";
import {
  adresUit, haalBronnenVoorTaken, haalProjecten, haalTaken, sluitUit, stelUit, werkTaakBij,
} from "../lib/data";
import type { Item, TaakRij } from "../types/db";

export function Voorstellen() {
  const [ronde, setRonde] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const meld = useMelding();

  const voorstellen = useAsync(() => haalTaken({ statussen: ["voorstel"], limiet: 60 }), [ronde]);
  const ids = (voorstellen.data ?? []).map((t) => t.id).join(",");
  const bronnen = useAsync(() => haalBronnenVoorTaken(ids ? ids.split(",") : []), [ids]);
  const projecten = useAsync(() => haalProjecten(), []);

  const ververs = () => setRonde((r) => r + 1);

  async function doe(id: string, actie: () => Promise<void>, bericht: string) {
    setBezig(id);
    try {
      await actie();
      meld(bericht);
      ververs();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  }

  const lijst = voorstellen.data ?? [];

  return (
    <>
      <div className="sectie">
        <p className="opschrift">Uit je mail gehaald</p>
        <h1>Voorstellen</h1>
        <p className="klein" style={{ marginTop: "0.3rem", marginBottom: 0 }}>
          Niets hiervan staat op je lijst tot jij het accepteert. Wat je wegklikt komt niet terug.
        </p>
      </div>

      {voorstellen.laden && <Skelet aantal={4} />}
      {voorstellen.fout && <Fout tekst={voorstellen.fout} opnieuw={voorstellen.herlaad} />}

      <div className="stapel">
        {lijst.map((taak) => (
          <VoorstelKaart
            key={taak.id}
            taak={taak}
            bron={(bronnen.data?.[taak.id] ?? []).find((i) => !i.uitgesloten) ?? null}
            projecten={(projecten.data ?? []).map((p) => ({ id: p.id, naam: p.naam }))}
            bezig={bezig === taak.id}
            bijOpenen={() => setOpen(taak.id)}
            bijActie={(actie, bericht) => void doe(taak.id, actie, bericht)}
          />
        ))}
      </div>

      {!voorstellen.laden && lijst.length === 0 && (
        <Leeg teken="✓">Geen openstaande voorstellen. De assistent kijkt elke tien minuten opnieuw.</Leeg>
      )}

      {open && <TaakPaneel taakId={open} bijSluiten={() => setOpen(null)} bijWijziging={ververs} />}
    </>
  );
}

/*
 * ÉÉN VOORSTEL, EN WAT JE ERMEE KUNT
 *
 * De eerste rij is wat je in negen van de tien gevallen doet: accepteren, of
 * niet. De tweede rij zit achter "meer", want acht knoppen op een kaart maakt
 * van een beslissing een formulier, en er staan er soms vijftien onder elkaar.
 */
function VoorstelKaart({
  taak, bron, projecten, bezig, bijOpenen, bijActie,
}: {
  taak: TaakRij;
  bron: Item | null;
  projecten: Array<{ id: string; naam: string }>;
  bezig: boolean;
  bijOpenen: () => void;
  bijActie: (actie: () => Promise<void>, bericht: string) => void;
}) {
  const [meer, setMeer] = useState(false);
  const adres = adresUit(bron?.afzender);
  const domein = adres?.split("@")[1] ?? null;

  return (
    <article className="kaart">
      <button type="button" onClick={bijOpenen}
        style={{ background: "none", border: 0, padding: 0, textAlign: "left", width: "100%", cursor: "pointer", color: "inherit" }}>
        <div className="titel" style={{ fontFamily: "var(--kop)", fontWeight: 640, color: "var(--ink)" }}>
          {taak.titel}
        </div>
      </button>
      {taak.toelichting && <p className="klein" style={{ margin: "0.35rem 0 0" }}>{knip(taak.toelichting, 220)}</p>}

      {bron && (
        <div className="mini rij" style={{ marginTop: "0.6rem", gap: "0.4rem" }}>
          {Icoon.mail({})}
          <span className="afkap groei">{afzenderNaam(bron.afzender)} — {bron.onderwerp}</span>
          <span style={{ flex: "0 0 auto" }}>{relatief(bron.ontvangen_op)}</span>
        </div>
      )}

      <div className="meta" style={{ marginTop: "0.5rem" }}>
        {taak.deadline && <Merkje kleur="amber">{datumKort(taak.deadline)}</Merkje>}
        {taak.prioriteit !== "normaal" && <Merkje kleur={taak.prioriteit === "hoog" ? "rood" : undefined}>{PRIORITEIT_TEKST[taak.prioriteit]}</Merkje>}
        {taak.projects && (
          <Merkje>
            <span className="stip" style={taak.projects.kleur ? { background: taak.projects.kleur } : undefined} />
            {taak.projects.naam}
          </Merkje>
        )}
      </div>

      <div className="knoprij" style={{ marginTop: "0.75rem" }}>
        <button className="knop primair klein" disabled={bezig}
          onClick={() => bijActie(() => werkTaakBij(taak.id, { status: "open" }), "Op je lijst gezet.")}>
          {Icoon.vink({})} Op mijn lijst
        </button>
        <button className="knop klein" disabled={bezig}
          onClick={() => bijActie(() => stelUit(taak.id, 1), "Morgen, dan.")}>
          {Icoon.klok({})} Morgen
        </button>
        <button className="knop klein" disabled={bezig}
          onClick={() => bijActie(
            () => werkTaakBij(taak.id, { status: "vervallen", gearchiveerd_op: new Date().toISOString() }),
            "Voorstel verworpen.",
          )}>
          Niet doen
        </button>
        <button className="knop klein" onClick={() => setMeer((m) => !m)} aria-expanded={meer}>
          {Icoon.meer({})} Meer
        </button>
      </div>

      {meer && (
        <div style={{ marginTop: "0.7rem", borderTop: "1px solid var(--lijn)", paddingTop: "0.7rem" }}>
          <div className="knoprij">
            <button className="knop klein" disabled={bezig}
              onClick={() => bijActie(() => stelUit(taak.id, 7), "Een week opgeschoven.")}>
              Volgende week
            </button>
            <button className="knop klein" disabled={bezig}
              onClick={() => bijActie(
                () => werkTaakBij(taak.id, { status: "open", prioriteit: "hoog" }),
                "Op je lijst, met voorrang.",
              )}>
              {Icoon.ster({})} Met voorrang
            </button>
            {bron?.deeplink && (
              <a className="knop klein" href={bron.deeplink} target="_blank" rel="noreferrer">
                {Icoon.extern({})} Mail openen
              </a>
            )}
          </div>

          {projecten.length > 0 && (
            <label className="veld" style={{ marginTop: "0.7rem", marginBottom: 0 }}>
              <span>Op mijn lijst, bij een project</span>
              <select value="" disabled={bezig}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const naam = projecten.find((p) => p.id === id)?.naam ?? "het project";
                  bijActie(() => werkTaakBij(taak.id, { status: "open", project_id: id }), `Toegevoegd aan ${naam}.`);
                }}>
                <option value="">— kies een project —</option>
                {projecten.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
              </select>
            </label>
          )}

          {/* Uitsluiten is geen opruimactie maar een privacyregel: hij komt in
              dezelfde tabel terecht die het filter in de serverfuncties leest,
              en werkt dus vanaf de volgende ophaalronde. Daarom de bevestiging. */}
          {adres && (
            <div style={{ marginTop: "0.8rem" }}>
              <p className="mini" style={{ margin: "0 0 0.4rem" }}>
                Berichten hiervan voortaan overslaan — ze worden dan ook niet meer aan het
                taalmodel voorgelegd.
              </p>
              <div className="knoprij">
                <button className="knop klein gevaar" disabled={bezig}
                  onClick={() => {
                    if (!window.confirm(`Voortaan alle post van ${adres} overslaan?`)) return;
                    bijActie(
                      () => sluitUit("afzender", adres, `via voorstel: ${taak.titel}`),
                      `${adres} wordt voortaan overgeslagen.`,
                    );
                  }}>
                  {Icoon.blokkeer({})} Deze afzender
                </button>
                {domein && (
                  <button className="knop klein gevaar" disabled={bezig}
                    onClick={() => {
                      if (!window.confirm(`Voortaan alle post van het hele domein ${domein} overslaan?`)) return;
                      bijActie(
                        () => sluitUit("domein", domein, `via voorstel: ${taak.titel}`),
                        `Het domein ${domein} wordt voortaan overgeslagen.`,
                      );
                    }}>
                    {Icoon.blokkeer({})} Hele domein {domein}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

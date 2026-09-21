import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { datumLang, relatief } from "../lib/format";
import { roepFunctie } from "../lib/supabase";
import { useSessie } from "../lib/auth";
import {
  bewaarFilter, bewaarSjabloon, haalBronnen, haalFilters, haalLogboek, haalSjablonen,
  verwijderFilter, verwijderSjabloon,
} from "../lib/data";
import type { FilterSoort, Sjabloon } from "../types/db";

const GOOGLE_MELDING: Record<string, string> = {
  gekoppeld: "Google is gekoppeld. De eerste mail wordt binnen tien minuten opgehaald.",
  geweigerd: "De koppeling is afgebroken.",
  verlopen: "De koppelpoging is verlopen. Probeer het opnieuw.",
  "geen-refresh-token": "Google gaf geen vernieuwingstoken. Ontkoppel de app in je Google-account en koppel opnieuw.",
  opslagfout: "De koppeling kon niet worden opgeslagen.",
  vaultfout: "Het token kon niet veilig worden opgeborgen.",
};

const FILTER_UITLEG: Record<FilterSoort, string> = {
  afzender: "Volledig e-mailadres",
  domein: "Domein, bijvoorbeeld ziekenhuis.nl",
  label: "Gmail-label",
  patroon: "Woord of zinsdeel in de tekst",
};

export function Instellingen() {
  const [params, setParams] = useSearchParams();
  const meld = useMelding();
  const { sessie, afmelden } = useSessie();
  const [ronde, setRonde] = useState(0);
  const [koppelen, setKoppelen] = useState(false);

  const bronnen = useAsync(() => haalBronnen(), [ronde]);
  const filters = useAsync(() => haalFilters(), [ronde]);
  const sjablonen = useAsync(() => haalSjablonen(), [ronde]);
  const logboek = useAsync(() => haalLogboek(40), [ronde]);

  useEffect(() => {
    const g = params.get("google");
    if (!g) return;
    meld(GOOGLE_MELDING[g] ?? `Google: ${g}`, g === "gekoppeld" ? "gewoon" : "fout");
    params.delete("google");
    setParams(params, { replace: true });
  }, [params, setParams, meld]);

  async function koppelGoogle() {
    setKoppelen(true);
    try {
      const { url } = await roepFunctie<{ url: string }>("google-oauth-start");
      window.location.href = url;
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
      setKoppelen(false);
    }
  }

  const gmail = (bronnen.data ?? []).find((b) => b.kind === "gmail");

  return (
    <>
      <div className="sectie">
        <p className="opschrift">Onder de motorkap</p>
        <h1>Instellingen</h1>
      </div>

      <section className="sectie">
        <header><h2>Google</h2></header>
        <div className="kaart">
          {bronnen.laden && <Skelet aantal={1} />}
          {bronnen.fout && <Fout tekst={bronnen.fout} opnieuw={bronnen.herlaad} />}
          {!bronnen.laden && !gmail && (
            <>
              <p className="klein zacht">
                Nog geen koppeling. Na het koppelen leest de assistent elke tien minuten je nieuwe
                mail, maakt taakvoorstellen en leest je agenda voor het dagoverzicht. Versturen
                gebeurt nooit zonder dat jij erop tikt.
              </p>
              <button className="knop primair" disabled={koppelen} onClick={() => void koppelGoogle()}>
                {koppelen ? "Bezig…" : "Koppel Google"}
              </button>
              <p className="mini" style={{ marginTop: "0.6rem", marginBottom: 0 }}>
                Google toont een scherm met “niet-geverifieerde app”. Dat hoort zo bij een privé-app;
                kies daar “Doorgaan”.
              </p>
            </>
          )}
          {(bronnen.data ?? []).map((b) => (
            <div className="rij-tussen" key={b.id} style={{ padding: "0.35rem 0" }}>
              <div className="groei">
                <strong className="klein">{b.kind}</strong>
                <div className="mini afkap">{b.account ?? "—"}</div>
                {b.laatste_fout && (
                  <div className="mini" style={{ color: "var(--rood)" }}>{b.laatste_fout}</div>
                )}
              </div>
              {b.laatst_gesynct
                ? <Merkje kleur="groen">{relatief(b.laatst_gesynct)}</Merkje>
                : <Merkje>nog niet gesynct</Merkje>}
            </div>
          ))}
          {gmail && (
            <button className="knop klein" style={{ marginTop: "0.6rem" }} disabled={koppelen}
              onClick={() => void koppelGoogle()}>
              Opnieuw koppelen
            </button>
          )}
        </div>
      </section>

      <section className="sectie">
        <header>
          <h2>Privacyfilters</h2>
          <span className="aantal">{(filters.data ?? []).length}</span>
        </header>
        <p className="klein zacht">
          Mail die hieronder valt wordt niet gelezen, niet samengevat en nooit aan een taalmodel
          voorgelegd. Alleen het domein van de afzender en de reden worden bewaard.
        </p>
        <FilterFormulier bijBewaren={() => setRonde((r) => r + 1)} />
        <div className="stapel" style={{ marginTop: "0.6rem" }}>
          {(filters.data ?? []).map((f) => (
            <div className="kaart rij-tussen" key={f.id}>
              <div className="groei">
                <span className="klein"><strong>{f.soort}</strong> · {f.waarde}</span>
                {f.omschrijving && <div className="mini">{f.omschrijving}</div>}
              </div>
              {!f.actief && <Merkje>uit</Merkje>}
              <button className="knop kaal klein"
                onClick={() => void bewaarFilter({ ...f, actief: !f.actief }).then(() => setRonde((r) => r + 1))}>
                {f.actief ? "Uit" : "Aan"}
              </button>
              <button className="knop kaal klein" aria-label="Verwijderen"
                onClick={() => { if (window.confirm("Filter verwijderen?")) void verwijderFilter(f.id).then(() => setRonde((r) => r + 1)); }}>
                {Icoon.sluiten({})}
              </button>
            </div>
          ))}
          {!filters.laden && (filters.data ?? []).length === 0 && (
            <Leeg teken="!">Nog geen filters. Voeg in elk geval je HIS- en ziekenhuisdomeinen toe.</Leeg>
          )}
        </div>
      </section>

      <section className="sectie">
        <header>
          <h2>Schrijfsjablonen</h2>
          <span className="aantal">{(sjablonen.data ?? []).length}</span>
        </header>
        <p className="klein zacht">
          Voorbeelden van hoe jij schrijft. De assistent gebruikt ze als richtlijn voor toon en opbouw.
        </p>
        <SjabloonLijst sjablonen={sjablonen.data ?? []} bijWijziging={() => setRonde((r) => r + 1)} />
      </section>

      <section className="sectie">
        <header><h2>Logboek</h2></header>
        <div className="kaart">
          {logboek.laden && <Skelet aantal={2} />}
          {(logboek.data ?? []).map((r) => (
            <div className="brief-regel" key={r.id}>
              <span className="tijd">{relatief(r.created_at)}</span>
              <span className="groei klein">
                {r.actie}
                {r.model && <span className="mini"> · {r.model}</span>}
              </span>
            </div>
          ))}
          {!logboek.laden && (logboek.data ?? []).length === 0 && (
            <p className="mini" style={{ margin: 0 }}>Nog niets gebeurd.</p>
          )}
        </div>
      </section>

      <section className="sectie">
        <header><h2>Account</h2></header>
        <div className="kaart">
          <p className="klein zacht">
            Ingelogd als <strong>{sessie?.user.email}</strong>.
          </p>
          <p className="mini">Sessie geopend op {datumLang(sessie?.user.last_sign_in_at ?? null)}.</p>
          <button className="knop" onClick={() => void afmelden()}>Afmelden</button>
        </div>
      </section>
    </>
  );
}

function FilterFormulier({ bijBewaren }: { bijBewaren: () => void }) {
  const [soort, setSoort] = useState<FilterSoort>("domein");
  const [waarde, setWaarde] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const meld = useMelding();

  async function bewaar() {
    if (!waarde.trim()) return;
    try {
      await bewaarFilter({ soort, waarde: waarde.trim(), omschrijving: omschrijving.trim() || null, actief: true });
      setWaarde("");
      setOmschrijving("");
      bijBewaren();
      meld("Filter toegevoegd.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  return (
    <div className="kaart">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.6rem" }}>
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Soort</span>
          <select value={soort} onChange={(e) => setSoort(e.target.value as FilterSoort)}>
            {(Object.keys(FILTER_UITLEG) as FilterSoort[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Waarde</span>
          <input type="text" value={waarde} onChange={(e) => setWaarde(e.target.value)} placeholder={FILTER_UITLEG[soort]} />
        </label>
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Waarom</span>
          <input type="text" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="optioneel" />
        </label>
      </div>
      <div className="knoppen" style={{ marginTop: "0.75rem" }}>
        <button className="knop klein" disabled={!waarde.trim()} onClick={() => void bewaar()}>Toevoegen</button>
      </div>
    </div>
  );
}

function SjabloonLijst({ sjablonen, bijWijziging }: { sjablonen: Sjabloon[]; bijWijziging: () => void }) {
  const [open, setOpen] = useState<Sjabloon | "nieuw" | null>(null);
  const meld = useMelding();
  const huidig = open === "nieuw" ? null : open;

  const [naam, setNaam] = useState("");
  const [wanneer, setWanneer] = useState("");
  const [inhoud, setInhoud] = useState("");

  function begin(s: Sjabloon | "nieuw") {
    setOpen(s);
    setNaam(s === "nieuw" ? "" : s.naam);
    setWanneer(s === "nieuw" ? "" : s.wanneer ?? "");
    setInhoud(s === "nieuw" ? "" : s.inhoud);
  }

  async function bewaar() {
    if (!naam.trim() || !inhoud.trim()) return;
    try {
      await bewaarSjabloon({
        ...(huidig ? { id: huidig.id } : {}),
        naam: naam.trim(), wanneer: wanneer.trim() || null, inhoud: inhoud.trim(), actief: true,
      });
      setOpen(null);
      bijWijziging();
      meld("Sjabloon bewaard.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  return (
    <>
      <div className="stapel">
        {sjablonen.map((s) => (
          <div className="kaart rij-tussen" key={s.id}>
            <div className="groei">
              <strong className="klein">{s.naam}</strong>
              {s.wanneer && <div className="mini">{s.wanneer}</div>}
            </div>
            <button className="knop kaal klein" onClick={() => begin(s)}>Bewerken</button>
            <button className="knop kaal klein" aria-label="Verwijderen"
              onClick={() => { if (window.confirm("Sjabloon verwijderen?")) void verwijderSjabloon(s.id).then(bijWijziging); }}>
              {Icoon.sluiten({})}
            </button>
          </div>
        ))}
      </div>
      <div className="knoppen" style={{ marginTop: "0.6rem" }}>
        <button className="knop klein" onClick={() => begin("nieuw")}>{Icoon.plus({})} Sjabloon toevoegen</button>
      </div>

      {open && (
        <div className="paneel-achter" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <aside className="paneel" role="dialog" aria-label="Sjabloon">
            <header>
              <button className="knop kaal" onClick={() => setOpen(null)} aria-label="Sluiten">{Icoon.sluiten({})}</button>
              <span className="opschrift">{huidig ? "Sjabloon bewerken" : "Nieuw sjabloon"}</span>
            </header>
            <div className="kaart">
              <label className="veld">
                <span>Naam</span>
                <input type="text" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bestuurlijke brief" />
              </label>
              <label className="veld">
                <span>Wanneer gebruiken</span>
                <input type="text" value={wanneer} onChange={(e) => setWanneer(e.target.value)}
                  placeholder="Bij gemeente, zorgverzekeraar en bestuurders" />
              </label>
              <label className="veld">
                <span>Voorbeeldtekst</span>
                <textarea value={inhoud} onChange={(e) => setInhoud(e.target.value)} style={{ minHeight: 220 }} />
              </label>
              <div className="knoppen">
                <button className="knop primair" disabled={!naam.trim() || !inhoud.trim()} onClick={() => void bewaar()}>Bewaren</button>
                <button className="knop" onClick={() => setOpen(null)}>Annuleren</button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

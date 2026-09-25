import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Fout, Icoon, Leeg, Merkje, Skelet, useAsync, useMelding } from "../components/ui";
import { datumLang, relatief } from "../lib/format";
import { roepFunctie, supabase } from "../lib/supabase";
import { useSessie } from "../lib/auth";
import {
  bewaarFilter, bewaarKoppeling, bewaarSjabloon, bewaarTerugkerend, haalBronnen, haalFilters,
  haalGezondheid, haalKoppelingen, haalLogboek, haalSjablonen, haalTerugkerend, haalVerbruik,
  verwijderFilter, verwijderKoppeling, verwijderSjabloon,
} from "../lib/data";
import type { FilterSoort, Koppeling, Sjabloon, TerugkerendRij } from "../types/db";

const GOOGLE_MELDING: Record<string, string> = {
  gekoppeld: "Google is gekoppeld. De eerste mail wordt binnen tien minuten opgehaald.",
  geweigerd: "De koppeling is afgebroken.",
  verlopen: "De koppelpoging is verlopen. Probeer het opnieuw.",
  "geen-refresh-token": "Google gaf geen vernieuwingstoken. Ontkoppel de app in je Google-account en koppel opnieuw.",
  opslagfout: "De koppeling kon niet worden opgeslagen.",
  vaultfout: "Het token kon niet veilig worden opgeborgen.",
  tokenfout: "Google weigerde de koppelcode. Meestal is de poging te lang blijven liggen; probeer het opnieuw.",
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
  const koppelingen = useAsync(() => haalKoppelingen(true), [ronde]);
  const ritmes = useAsync(() => haalTerugkerend(), [ronde]);
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

      <Nachtploeg />

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

      <section className="sectie" id="koppelingen">
        <header>
          <h2>Doorsteek</h2>
          <span className="aantal">{(koppelingen.data ?? []).length}</span>
        </header>
        <p className="klein zacht">
          De tegels op Vandaag. Eén blik, één klik naar de juiste pagina van het portaal
          of naar een van je andere apps.
        </p>
        {koppelingen.laden && <Skelet aantal={2} />}
        {!koppelingen.laden && (
          <Doorsteek koppelingen={koppelingen.data ?? []} bijWijziging={() => setRonde((r) => r + 1)} />
        )}
      </section>

      <section className="sectie" id="onderhoud">
        <header>
          <h2>Onderhoudsritme</h2>
          <span className="aantal">{(ritmes.data ?? []).length}</span>
        </header>
        <p className="klein zacht">
          Wat vanzelf terugkomt. Elke nacht kijkt de database of er iets aan de beurt is en
          zet het als taak op je lijst. Valt een datum in het weekend, dan schuift hij naar
          de eerstvolgende werkdag in plaats van over te slaan.
        </p>
        {ritmes.laden && <Skelet aantal={3} />}
        {!ritmes.laden && (
          <Onderhoud ritmes={ritmes.data ?? []} bijWijziging={() => setRonde((r) => r + 1)} />
        )}
      </section>

      <section className="sectie">
        <header><h2>Logboek</h2></header>
        <Verbruikje />
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
        <Wachtwoord />
        <TweeStappen />
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

/*
 * WACHTWOORD WIJZIGEN
 *
 * Staat hier zodat het instellen van een wachtwoord nooit meer via de SQL-editor
 * hoeft. Twee velden en geen "huidig wachtwoord" ervoor: je bent al ingelogd, en
 * GoTrue controleert de sessie. Wel twee keer intikken — een typefout in een
 * wachtwoord dat je daarna niet meer ziet, sluit je buiten.
 */
function Wachtwoord() {
  const meld = useMelding();
  const [open, setOpen] = useState(false);
  const [een, setEen] = useState("");
  const [twee, setTwee] = useState("");
  const [bezig, setBezig] = useState(false);

  const kort = een.length > 0 && een.length < 10;
  const ongelijk = twee.length > 0 && een !== twee;
  const kan = een.length >= 10 && een === twee && !bezig;

  async function bewaar() {
    setBezig(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: een });
      if (error) throw new Error(error.message);
      setEen("");
      setTwee("");
      setOpen(false);
      meld("Wachtwoord gewijzigd.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  if (!open) {
    return (
      <button className="knop klein" style={{ marginTop: "0.6rem" }} onClick={() => setOpen(true)}>
        Wachtwoord instellen of wijzigen
      </button>
    );
  }

  return (
    <div className="kaart" style={{ marginTop: "0.6rem" }}>
      <label className="veld">
        <span>Nieuw wachtwoord (minstens tien tekens)</span>
        <input type="password" autoComplete="new-password" value={een}
          onChange={(e) => setEen(e.target.value)} />
      </label>
      <label className="veld">
        <span>Nog een keer</span>
        <input type="password" autoComplete="new-password" value={twee}
          onChange={(e) => setTwee(e.target.value)} />
      </label>
      {kort && <p className="mini" style={{ color: "var(--let)" }}>Nog wat langer, minstens tien tekens.</p>}
      {ongelijk && <p className="mini" style={{ color: "var(--fout)" }}>De twee komen niet overeen.</p>}
      <div className="knoppen">
        <button className="knop primair klein" disabled={!kan} onClick={() => void bewaar()}>
          {bezig ? "Bezig…" : "Bewaren"}
        </button>
        <button className="knop klein" onClick={() => { setOpen(false); setEen(""); setTwee(""); }}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- doorsteek ------- */

/* De snelkoppelingen die op Vandaag als tegels staan. */
function Doorsteek({ koppelingen, bijWijziging }: { koppelingen: Koppeling[]; bijWijziging: () => void }) {
  const meld = useMelding();
  const [naam, setNaam] = useState("");
  const [url, setUrl] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [groep, setGroep] = useState("");

  const groepen = Array.from(new Set(koppelingen.map((k) => k.groep).filter((g): g is string => !!g)));

  async function schakel(k: Koppeling) {
    try {
      await bewaarKoppeling({ ...k, actief: !k.actief });
      bijWijziging();
    } catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
  }

  async function weg(k: Koppeling) {
    if (!window.confirm(`"${k.naam}" verwijderen?`)) return;
    try {
      await verwijderKoppeling(k.id);
      bijWijziging();
    } catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
  }

  async function voegToe(e: React.FormEvent) {
    e.preventDefault();
    if (!naam.trim() || !url.trim()) return;
    try {
      await bewaarKoppeling({
        naam: naam.trim(), url: url.trim(),
        omschrijving: omschrijving.trim() || null,
        groep: groep.trim() || null,
        volgorde: 400, actief: true,
      });
      setNaam(""); setUrl(""); setOmschrijving("");
      bijWijziging();
      meld("Toegevoegd.");
    } catch (e2) { meld(e2 instanceof Error ? e2.message : String(e2), "fout"); }
  }

  return (
    <div className="kaart">
      {koppelingen.map((k) => (
        <div className="brief-regel" key={k.id}>
          <span className="groei klein">
            {k.naam}
            <div className="mini">{k.groep ? `${k.groep} · ` : ""}{k.url}</div>
          </span>
          <button className="knop klein" onClick={() => void schakel(k)}>
            {k.actief ? "Verbergen" : "Tonen"}
          </button>
          <button className="knop klein kaal" onClick={() => void weg(k)} aria-label={`${k.naam} verwijderen`}>
            {Icoon.sluiten({})}
          </button>
        </div>
      ))}
      {koppelingen.length === 0 && <p className="mini" style={{ margin: 0 }}>Nog geen snelkoppelingen.</p>}

      <form className="rij koppelvorm" onSubmit={(e) => void voegToe(e)}>
        <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam" required />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… of /taken" required />
        <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Waar is het voor?" />
        <input value={groep} onChange={(e) => setGroep(e.target.value)} placeholder="Groep" list="cockpitgroepen" />
        <datalist id="cockpitgroepen">
          {groepen.map((g) => <option value={g} key={g} />)}
        </datalist>
        <button className="knop hoofd" type="submit">Toevoegen</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------- onderhoud ------- */

const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"];

/** Het ritme in gewoon Nederlands, zodat je niet hoeft te rekenen. */
function ritmeTekst(t: TerugkerendRij): string {
  switch (t.ritme) {
    case "dagelijks": return t.alleen_werkdagen ? "elke werkdag" : "elke dag";
    case "wekelijks": return `elke ${DAGEN[(t.dag_van_week ?? 1) - 1] ?? "maandag"}`;
    case "maandelijks": return `elke maand rond de ${t.dag_van_maand ?? 1}e`;
    case "kwartaal": return `elk kwartaal, rond de ${t.dag_van_maand ?? 1}e`;
    case "jaarlijks": return `elk jaar rond ${t.dag_van_maand ?? 1} ${MAANDEN[(t.maand ?? 1) - 1] ?? "januari"}`;
  }
}

/* Wat er vanzelf terugkomt. De database plant het elke nacht; hier zet je het
   aan of uit en zie je wanneer het voor het laatst op je lijst kwam. */
function Onderhoud({ ritmes, bijWijziging }: { ritmes: TerugkerendRij[]; bijWijziging: () => void }) {
  const meld = useMelding();

  async function schakel(t: TerugkerendRij) {
    try {
      await bewaarTerugkerend({ id: t.id, actief: !t.actief });
      bijWijziging();
    } catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
  }

  if (ritmes.length === 0) {
    return <Leeg teken="↻">Nog geen terugkerend onderhoud ingesteld.</Leeg>;
  }

  return (
    <div className="kaart">
      {ritmes.map((t) => (
        <div className="ritme-rij" key={t.id}>
          <span className="groei">
            <span className="titel">{t.titel}</span>
            <p className="mini">
              {ritmeTekst(t)}
              {t.projects && ` · ${t.projects.naam}`}
              {t.laatst_gepland && ` · laatst gepland ${relatief(t.laatst_gepland)}`}
            </p>
            {t.link && (
              <p className="mini">
                {t.link.startsWith("/")
                  ? <Link to={t.link}>{t.link}</Link>
                  : <a href={t.link} target="_blank" rel="noreferrer">{t.link}</a>}
              </p>
            )}
          </span>
          {!t.actief && <Merkje>uit</Merkje>}
          <button className="knop klein" onClick={() => void schakel(t)}>
            {t.actief ? "Stoppen" : "Aanzetten"}
          </button>
        </div>
      ))}
    </div>
  );
}

/*
 * TWEESTAPSVERIFICATIE
 *
 * Met een wachtwoord alleen kan wie het raadt of ergens vandaan haalt namens
 * jou mail versturen vanuit jouw Gmail — dat is precies wat deze app kan. Een
 * zescijferige code uit je telefoon sluit dat af.
 *
 * Er zijn met opzet geen herstelcodes. Die moet je ergens bewaren, en dat wordt
 * in de praktijk een briefje of een notitie-app; de inloglink per mail is het
 * vangnet en die heb je al. Raak je je telefoon kwijt, dan haal je de factor
 * weg via de inloglink.
 */
function TweeStappen() {
  const meld = useMelding();
  const stand = useAsync(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return (data.totp ?? []).filter((f) => f.status === "verified");
  }, []);
  const [bezig, setBezig] = useState(false);
  const [nieuw, setNieuw] = useState<{ id: string; qr: string; geheim: string } | null>(null);
  const [code, setCode] = useState("");

  async function begin() {
    setBezig(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `BennaAssistent ${new Date().toLocaleDateString("nl-NL")}`,
      });
      if (error) throw new Error(error.message);
      setNieuw({ id: data.id, qr: data.totp.qr_code, geheim: data.totp.secret });
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  async function bevestig() {
    if (!nieuw) return;
    setBezig(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: nieuw.id,
        code: code.replace(/\s/g, ""),
      });
      if (error) throw new Error(error.message);
      setNieuw(null);
      setCode("");
      stand.herlaad();
      meld("Tweestapsverificatie staat aan.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  async function weg(id: string) {
    if (!window.confirm("Tweestapsverificatie uitzetten? Je account is daarna alleen door je wachtwoord beschermd.")) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw new Error(error.message);
      stand.herlaad();
      meld("Tweestapsverificatie staat uit.");
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  }

  const aan = (stand.data ?? []).length > 0;

  if (nieuw) {
    return (
      <div className="kaart let" style={{ marginTop: "0.6rem" }}>
        <p className="klein" style={{ marginTop: 0 }}>
          Scan deze code met je authenticator-app (1Password, Google Authenticator, Bitwarden)
          en tik daarna de zes cijfers in die hij toont.
        </p>
        <img src={nieuw.qr} alt="QR-code voor je authenticator-app" width={180} height={180}
          style={{ background: "#fff", borderRadius: 8, padding: 6 }} />
        <p className="mini">Werkt scannen niet, tik dan deze sleutel over: <code>{nieuw.geheim}</code></p>
        <label className="veld">
          <span>De zes cijfers</span>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
            value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <div className="knoppen">
          <button className="knop primair klein" disabled={bezig || code.replace(/\s/g, "").length < 6}
            onClick={() => void bevestig()}>
            {bezig ? "Bezig…" : "Aanzetten"}
          </button>
          <button className="knop klein" onClick={() => { setNieuw(null); setCode(""); }}>Annuleren</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.6rem" }}>
      {aan ? (
        <div className="rij">
          <Merkje kleur="groen">{Icoon.vink({})} tweestapsverificatie aan</Merkje>
          <button className="knop klein kaal" onClick={() => void weg(stand.data![0]!.id)}>Uitzetten</button>
        </div>
      ) : (
        <>
          <p className="mini" style={{ margin: "0 0 0.4rem" }}>
            Deze app kan namens jou mail versturen. Een code uit je telefoon erbij maakt een
            gestolen wachtwoord waardeloos.
          </p>
          <button className="knop klein" disabled={bezig} onClick={() => void begin()}>
            Tweestapsverificatie aanzetten
          </button>
        </>
      )}
    </div>
  );
}

/*
 * HOE HET DE NACHTPLOEG VERGAAT
 *
 * De 404 op de mailkoppeling stond twintig rondes in de database voordat hij
 * op een telefoon werd opgemerkt. Dit blokje is het antwoord daarop: het staat
 * bovenaan Instellingen en het zegt in één regel of alles nog draait.
 *
 * pg_cron schrijft bij een geslaagde ronde "1 row" in hetzelfde veld waar bij
 * een mislukte ronde de fout staat. Dat is hier geen fout en wordt dus alleen
 * getoond als de laatste ronde ook echt misging.
 */
const KLOK: Record<string, string> = {
  "*/10 * * * *": "elke tien minuten",
  "5 * * * *": "elk uur",
  "20 * * * *": "elk uur",
  "30 4,5 * * 1-5": "elke werkdag om 06.30 uur",
  "0 5 * * 1": "maandagochtend",
  "5 4 * * *": "elke nacht",
  "15 3 * * *": "elke nacht",
  "30 3 * * *": "elke nacht",
};

const WERK: Record<string, string> = {
  "bennaassistent-gmail": "Mail ophalen",
  "bennaassistent-followup": "Antwoorden nakijken",
  "bennaassistent-drive": "Drive nakijken",
  "bennaassistent-brief": "Dagoverzicht maken",
  "bennaassistent-week": "Weekoverzicht maken",
  "bennaassistent-terugkerend": "Onderhoud inplannen",
  "bennaassistent-opruimen": "Oude gegevens wissen",
  "bennaassistent-hertriage": "Mislukte triage inhalen",
};

function Nachtploeg() {
  const stand = useAsync(() => haalGezondheid(), []);
  const rijen = stand.data ?? [];

  const stuk = rijen.filter((r) => r.mislukt_24u >= 2);
  const hapert = rijen.filter((r) => r.mislukt_24u === 1);
  const kleur = stuk.length ? "foutrand" : hapert.length ? "let" : "goedrand";

  const kop = stuk.length
    ? `${stuk.length === 1 ? "Eén nachtelijke taak faalt" : `${stuk.length} nachtelijke taken falen`} herhaaldelijk`
    : hapert.length
      ? "Eén ronde ging mis, de rest loopt"
      : "Alles draait";

  return (
    <section className="sectie">
      <header><h2>Nachtploeg</h2></header>
      {stand.laden && <Skelet aantal={1} />}
      {stand.fout && <Fout tekst={stand.fout} opnieuw={stand.herlaad} />}
      {!stand.laden && !stand.fout && (
        <div className={`kaart ${kleur}`}>
          <p className="klein" style={{ marginTop: 0, fontWeight: 600 }}>{kop}</p>
          {rijen.map((r) => (
            <div className="brief-regel" key={r.taak}>
              <span className="groei klein">
                {WERK[r.taak] ?? r.taak}
                <div className="mini">
                  {KLOK[r.rooster] ?? r.rooster}
                  {r.laatste ? ` · laatst ${relatief(r.laatste)}` : " · nog niet gedraaid"}
                </div>
                {/* Alleen tonen als de laatste ronde ook echt misging. */}
                {r.status && r.status !== "succeeded" && r.fout && (
                  <div className="mini" style={{ color: "var(--fout)" }}>{r.fout}</div>
                )}
              </span>
              {r.mislukt_24u > 0 && (
                <Merkje kleur={r.mislukt_24u >= 2 ? "rood" : "amber"}>
                  {r.mislukt_24u}× mis vandaag
                </Merkje>
              )}
            </div>
          ))}
          {rijen.length === 0 && <p className="mini" style={{ margin: 0 }}>Geen taken ingepland.</p>}
        </div>
      )}
    </section>
  );
}

/* Wat de modellen deze maand kosten, in tokens. Geen euro's: de prijs per
   token verandert en een verouderd bedrag is misleidender dan geen bedrag. */
function Verbruikje() {
  const stand = useAsync(() => haalVerbruik(), []);
  const rijen = stand.data ?? [];
  if (!rijen.length) return null;
  const getal = (n: number) => new Intl.NumberFormat("nl-NL").format(n);
  return (
    <div className="kaart plat" style={{ marginBottom: "0.6rem" }}>
      <p className="mini" style={{ margin: "0 0 0.4rem" }}>Deze maand aan het taalmodel gevraagd:</p>
      {rijen.map((v) => (
        <div className="brief-regel" key={v.model}>
          <span className="groei mini">{v.model}</span>
          <span className="mini">{v.aanroepen}× · {getal(v.invoer)} in / {getal(v.uitvoer)} uit</span>
        </div>
      ))}
    </div>
  );
}

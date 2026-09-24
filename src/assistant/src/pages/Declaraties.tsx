import { useState } from "react";
import { Fout, Leeg, Merkje, Skelet, Uitleg, useAsync, useMelding } from "../components/ui";
import { leesBestand } from "../lib/tabel";
import { MaandNodig, ontleed, type Ontleding, type Rapport } from "../lib/bricks";
import { bewaarDeclaraties, haalDeclaratieImports, haalMaandstaat } from "../lib/data";
import { relatief } from "../lib/format";
import type { DeclaratieMaand } from "../types/db";

/* Waar elk rapport vandaan komt. VIPLive is de geldbron, Bricks de
   registratiebron; wie dat door elkaar haalt gaat in het verkeerde systeem
   zoeken. De rapportenkalender op het portaal houdt dezelfde indeling aan. */
const RAPPORT: Record<Rapport, { naam: string; bron: "VIPLive" | "Bricks" }> = {
  "05": { naam: "Overzicht gedeclareerde prestaties per maand", bron: "VIPLive" },
  "09": { naam: "Totaal overzicht facturen voor accountant of boekhouding", bron: "VIPLive" },
  "25": { naam: "Verrichtingen per medewerker", bron: "Bricks" },
};

const euro = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const getalNL = (n: number | null | undefined): string =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL").format(n);

/** De vorige maand als YYYY-MM: de maand waar een ronde bijna altijd over gaat. */
function vorigeMaand(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const maandNaam = (datum: string): string =>
  new Intl.DateTimeFormat("nl-NL", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(`${datum}T12:00:00Z`));

export function Declaraties() {
  const [ronde, setRonde] = useState(0);
  const maanden = useAsync(() => haalMaandstaat(), [ronde]);
  const imports = useAsync(() => haalDeclaratieImports(), [ronde]);

  return (
    <>
      <div className="sectie">
        <p className="opschrift">Uit VIPLive en Bricks</p>
        <h1>Declaraties</h1>
        <p className="klein" style={{ marginTop: "0.3rem", marginBottom: 0 }}>
          Rapport 05 en 09 komen uit VIPLive, rapport 25 uit Bricks. Geen van beide heeft een
          koppeling om uit te lezen, dus dit loopt via je eigen export. Het bestand wordt in dit
          tabblad gelezen; alleen de uitkomst gaat naar de database.
        </p>
      </div>

      <Invoer bijKlaar={() => setRonde((r) => r + 1)} />

      <section className="sectie">
        <header>
          <h2>Per maand</h2>
          <span className="aantal">{(maanden.data ?? []).length || ""}</span>
        </header>
        {maanden.laden && <Skelet aantal={2} />}
        {maanden.fout && <Fout tekst={maanden.fout} opnieuw={maanden.herlaad} />}
        {!maanden.laden && (maanden.data ?? []).length === 0 && (
          <Leeg teken="·">Nog geen declaratiedata. Kies hierboven een export uit VIPLive of Bricks.</Leeg>
        )}
        {(maanden.data ?? []).length > 0 && <Maandstaat rijen={maanden.data ?? []} />}
      </section>

      {(imports.data ?? []).length > 0 && (
        <section className="sectie">
          <header><h2>Wat er is ingelezen</h2></header>
          <div className="kaart">
            {(imports.data ?? []).map((i) => (
              <div className="brief-regel" key={i.id}>
                <span className="tijd">{relatief(i.created_at)}</span>
                <span className="groei">
                  <strong className="klein">Rapport {i.rapport}</strong>
                  <div className="mini afkap">
                    {i.bestandsnaam} · {getalNL(i.aantal_regels)} regels
                    {i.periode ? ` · ${i.periode}` : ""}
                  </div>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------- invoer ---- */

/*
 * EERST LATEN ZIEN, DAN PAS WEGSCHRIJVEN
 *
 * De kolomposities van een export liggen niet vast voor de eeuwigheid.
 * Schuift er iets op, dan komen er getallen in de verkeerde kolom terecht en
 * dat merk je pas maanden later in een analyse. Daarom eerst tonen wat er is
 * herkend — welk rapport, hoeveel regels, welke maanden, wat is overgeslagen —
 * en pas opslaan als jij het herkent.
 */
function Invoer({ bijKlaar }: { bijKlaar: () => void }) {
  const meld = useMelding();
  const [ontleding, setOntleding] = useState<Ontleding | null>(null);
  const [bestand, setBestand] = useState<File | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [maandNodig, setMaandNodig] = useState(false);
  const [maand, setMaand] = useState(vorigeMaand);

  async function lees(f: File, gedwongen?: Rapport, maand?: string) {
    setBezig(true);
    setFout(null);
    try {
      const bladen = await leesBestand(f);
      setOntleding(ontleed(bladen, { gedwongen, maand }));
      setMaandNodig(false);
    } catch (e) {
      // De platte vorm van rapport 25 draagt geen periode. Dat is geen fout in
      // het bestand maar een vraag aan de gebruiker, en hoort dus ook niet als
      // foutmelding op het scherm te staan.
      setMaandNodig(e instanceof MaandNodig);
      setFout(e instanceof Error ? e.message : String(e));
      setOntleding(null);
    } finally {
      setBestand(f);
      setBezig(false);
    }
  }

  async function bewaar() {
    if (!ontleding || !bestand) return;
    setBezig(true);
    try {
      const r = await bewaarDeclaraties(ontleding, bestand.name);
      meld(`${getalNL(r.weggeschreven)} regels ingelezen.`);
      setOntleding(null);
      setBestand(null);
      bijKlaar();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  const maanden = ontleding ? [...new Set(ontleding.prestaties.map((p) => p.maand))].sort() : [];

  return (
    <section className="sectie">
      <div className="kaart">
        <label className="veld" style={{ marginBottom: 0 }}>
          <span>Export uit VIPLive of Bricks (xlsx of csv)</span>
          <input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void lees(f); }} />
        </label>

        {bezig && !ontleding && <p className="mini" style={{ margin: "0.6rem 0 0" }}>Bezig met lezen…</p>}

        {fout && (
          <>
            <p className="klein" style={{ color: maandNodig ? "var(--let)" : "var(--fout)", marginTop: "0.8rem" }}>
              {fout}
            </p>
            {maandNodig && bestand && (
              <div className="rij" style={{ gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="veld" style={{ marginBottom: 0 }}>
                  <span>Maand van dit bestand</span>
                  <input type="month" value={maand} onChange={(e) => setMaand(e.target.value)} />
                </label>
                <button className="knop primair klein" disabled={!maand}
                  onClick={() => void lees(bestand, "25", `${maand}-01`)}>
                  Lees in op deze maand
                </button>
              </div>
            )}
            {!maandNodig && bestand && (
              <div className="knoprij">
                {(["05", "09", "25"] as Rapport[]).map((r) => (
                  <button key={r} className="knop klein" onClick={() => void lees(bestand, r)}>
                    Lees als rapport {r}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {ontleding && (
          <div style={{ marginTop: "0.9rem", borderTop: "1px solid var(--lijn)", paddingTop: "0.8rem" }}>
            <div className="rij" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
              <Merkje kleur="accent">Rapport {ontleding.rapport}</Merkje>
              <Merkje>{RAPPORT[ontleding.rapport].bron}</Merkje>
              <span className="klein">{RAPPORT[ontleding.rapport].naam}</span>
            </div>
            <p className="klein" style={{ margin: "0.6rem 0 0" }}>
              {ontleding.prestaties.length > 0 && (
                <>
                  {getalNL(ontleding.prestaties.length)} verrichtingregels over {maanden.length}{" "}
                  {maanden.length === 1 ? "maand" : "maanden"}
                  {maanden.length > 0 && ` (${maandNaam(maanden[0]!)} tot en met ${maandNaam(maanden[maanden.length - 1]!)})`}.
                </>
              )}
              {ontleding.facturen.length > 0 && (
                <>{getalNL(ontleding.facturen.length)} factuurregels, verdeeld over{" "}
                  {new Set(ontleding.facturen.map((f) => f.blok)).size} blok(ken).</>
              )}
            </p>
            {ontleding.praktijknummer && (
              <p className="mini" style={{ margin: "0.3rem 0 0" }}>
                {ontleding.praktijknummer}{ontleding.standDatabase ? ` · ${ontleding.standDatabase}` : ""}
              </p>
            )}

            {ontleding.overgeslagen.map((w) => (
              <p className="mini" key={w} style={{ color: "var(--let)", margin: "0.4rem 0 0" }}>{w}</p>
            ))}

            <div className="knoppen" style={{ marginTop: "0.8rem" }}>
              <button className="knop primair" disabled={bezig} onClick={() => void bewaar()}>
                {bezig ? "Bezig…" : "Klopt, inlezen"}
              </button>
              <button className="knop" onClick={() => { setOntleding(null); setBestand(null); }}>
                Annuleren
              </button>
            </div>
            <p className="mini" style={{ margin: "0.6rem 0 0" }}>
              Maanden die er al in staan worden overschreven. Dat is met opzet: een export wordt vaak
              opnieuw gemaakt na nadeclaratie, en twee halve waarheden naast elkaar zijn erger dan één
              bijgewerkte.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- maandstaat --- */

function Maandstaat({ rijen }: { rijen: DeclaratieMaand[] }) {
  const laatste = rijen.slice(-18);

  /* Het aandeel lange consulten per maand. Een abrupte sprong hierin is bijna
     altijd een registratie-artefact — een HIS-update, een codewijziging, een
     personele wisseling — en niet een verandering in zorgpatroon. De app zegt
     dat erbij in plaats van jou het zelf te laten ontdekken. */
  const aandeelLang = (r: DeclaratieMaand): number | null => {
    const totaal = (r.consult_lang ?? 0) + (r.consult_middel ?? 0) + (r.consult_kort ?? 0);
    return totaal > 0 ? ((r.consult_lang ?? 0) / totaal) * 100 : null;
  };

  const sprongen: Array<{ maand: string; van: number; naar: number }> = [];
  for (let i = 1; i < laatste.length; i++) {
    const a = aandeelLang(laatste[i - 1]!);
    const b = aandeelLang(laatste[i]!);
    if (a != null && b != null && Math.abs(b - a) >= 10) {
      sprongen.push({ maand: laatste[i]!.maand, van: a, naar: b });
    }
  }

  return (
    <>
      <div className="kaart" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--grijs)" }}>
              <th style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>Maand</th>
              <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Omzet</th>
              <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Ingeschreven</th>
              <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Opslagwijk</th>
              <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Lang</th>
              <th style={{ padding: "6px 0 6px 8px", fontWeight: 600, textAlign: "right" }}>POH-GGZ</th>
            </tr>
          </thead>
          <tbody>
            {laatste.map((r) => {
              const pct = r.ingeschreven && r.opslagwijk ? (r.opslagwijk / r.ingeschreven) * 100 : null;
              const lang = aandeelLang(r);
              return (
                <tr key={r.maand} style={{ borderTop: "1px solid var(--lijn)" }}>
                  <td style={{ padding: "6px 8px 6px 0", whiteSpace: "nowrap" }}>{maandNaam(r.maand)}</td>
                  <td className="cijfer" style={{ padding: "6px 8px", textAlign: "right" }}>{euro(r.omzet)}</td>
                  <td className="cijfer" style={{ padding: "6px 8px", textAlign: "right" }}>{getalNL(r.ingeschreven)}</td>
                  <td className="cijfer" style={{ padding: "6px 8px", textAlign: "right" }}>
                    {pct == null ? "—" : `${pct.toFixed(0)}%`}
                  </td>
                  <td className="cijfer" style={{ padding: "6px 8px", textAlign: "right" }}>
                    {lang == null ? "—" : `${lang.toFixed(0)}%`}
                  </td>
                  <td className="cijfer" style={{ padding: "6px 0 6px 8px", textAlign: "right" }}>{getalNL(r.poh_ggz)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sprongen.map((s) => (
        <div className="kaart let" key={s.maand} style={{ marginTop: "0.6rem" }}>
          <p className="klein" style={{ margin: 0 }}>
            Het aandeel lange consulten sprong in {maandNaam(s.maand)} van {s.van.toFixed(0)}% naar{" "}
            {s.naar.toFixed(0)}%. Een verschuiving van meer dan tien procentpunt binnen een maand is
            bijna altijd een registratie-artefact — een HIS-update, een gewijzigde code, of een
            personele wisseling — en zelden een echte verandering in zorgpatroon.
          </p>
        </div>
      ))}

      <Uitleg kop="hoe deze cijfers zijn geteld">
        <p className="mini" style={{ margin: 0 }}>
          <strong>Ingeschreven</strong> is de som van 11115 tot en met 11118. Code 11119 zit daar
          bewust niet bij: dat is de opslagwijktoeslag, een toeslag op bestaande inschrijvingen en
          geen aparte patiënt. Wie hem meetelt, telt een deel van de praktijk dubbel. Die regel staat
          in de database zelf, zodat geen enkele latere analyse eromheen kan.
        </p>
        <p className="mini" style={{ margin: "0.5rem 0 0" }}>
          <strong>Opslagwijk</strong> is 11119 gedeeld door dat aantal — de indicator voor het
          achterstandswijkprofiel van de praktijk. In een achterstandswijk ligt die doorgaans rond de
          35 tot 40 procent.
        </p>
        <p className="mini" style={{ margin: "0.5rem 0 0" }}>
          <strong>Lang</strong> is het aandeel consulten van twintig minuten of meer, inclusief
          visites, binnen alle consulten. Inschrijvingen worden per kwartaal gedeclareerd, dus de
          omzet in januari, april, juli en oktober ligt structureel hoger. Extrapoleer daar niet
          lineair overheen.
        </p>
      </Uitleg>
    </>
  );
}

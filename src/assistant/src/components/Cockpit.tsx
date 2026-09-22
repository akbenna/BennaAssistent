import { Link } from "react-router-dom";
import { Icoon, useAsync } from "./ui";
import { haalKoppelingen } from "../lib/data";
import type { Koppeling } from "../types/db";

/* Een url die met een schuine streep begint hoort bij deze app zelf; die mag
   niet door een nieuw tabblad, anders verlies je je plek. */
const intern = (url: string) => url.startsWith("/");

function Tegel({ k }: { k: Koppeling }) {
  const binnenkant = (
    <>
      <b>{k.naam}</b>
      {k.omschrijving && <span>{k.omschrijving}</span>}
    </>
  );
  if (intern(k.url)) {
    return <Link className="tegel" to={k.url}>{binnenkant}</Link>;
  }
  return (
    <a className="tegel" href={k.url} target="_blank" rel="noreferrer">
      {binnenkant}
      <i className="hoekje" aria-hidden="true">{Icoon.extern({})}</i>
    </a>
  );
}

/**
 * De brug naar de andere apps. Bewust plat: geen tellers, geen status die
 * eerst opgehaald moet worden. Als dit blokje traag is, is het waardeloos.
 */
export function Cockpit() {
  const { data } = useAsync(() => haalKoppelingen(), []);
  const koppelingen = data ?? [];
  if (koppelingen.length === 0) return null;

  // Volgorde van de groepen volgt de database; een lege groep heet "Overig".
  const groepen: Array<[string, Koppeling[]]> = [];
  for (const k of koppelingen) {
    const naam = k.groep ?? "Overig";
    const bestaand = groepen.find(([g]) => g === naam);
    if (bestaand) bestaand[1].push(k);
    else groepen.push([naam, [k]]);
  }

  return (
    <section className="sectie">
      <header>
        <h2>Doorsteek</h2>
        <Link className="mini" to="/instellingen#koppelingen">bewerken</Link>
      </header>
      <div className="cockpit">
        {groepen.map(([groep, rij]) => (
          <div className="cockpitgroep" key={groep}>
            <p className="opschrift">{groep}</p>
            <div className="tegels">
              {rij.map((k) => <Tegel k={k} key={k.id} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useState } from "react";
import { Icoon, Merkje, useMelding } from "./ui";
import { datumKort, deadlineToon } from "../lib/format";
import { rondTaakAf, stelUit } from "../lib/data";
import type { Prioriteit, TaakRij, TaakStatus } from "../types/db";

export const STATUS_TEKST: Record<TaakStatus, string> = {
  voorstel: "Voorstel",
  open: "Open",
  wacht_op_antwoord: "Wacht op antwoord",
  antwoord_binnen: "Antwoord binnen",
  afgerond: "Afgerond",
  vervallen: "Vervallen",
};

const STATUS_KLEUR: Partial<Record<TaakStatus, "accent" | "groen" | "rood" | "blauw" | "amber">> = {
  voorstel: "amber",
  wacht_op_antwoord: "blauw",
  antwoord_binnen: "groen",
};

export const PRIORITEIT_TEKST: Record<Prioriteit, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
};

/*
 * DE KAART WAS ÉÉN GROTE KNOP, EN DAT KON NIET BLIJVEN
 *
 * Alles aanklikken opende het paneel, en dus kostte "morgen even niet" vier
 * handelingen: openen, datum zoeken, datum kiezen, sluiten. Nu is de titel de
 * knop die opent en staan de veelgebruikte handelingen als losse knoppen op de
 * kaart. Een knop in een knop bestaat niet, dus de kaart zelf is geen knop meer.
 */
export function TaakKaart({
  taak, bijKlik, bijWijziging,
}: {
  taak: TaakRij;
  bijKlik: () => void;
  bijWijziging?: () => void;
}) {
  const toon = deadlineToon(taak.deadline);
  const rand = toon === "verlopen" ? " verlopen" : toon === "vandaag" ? " vandaag" : "";
  const [bezig, setBezig] = useState(false);
  const meld = useMelding();

  async function doe(actie: () => Promise<void>, bericht: string) {
    setBezig(true);
    try {
      await actie();
      meld(bericht);
      bijWijziging?.();
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  }

  return (
    <article className={`kaart taak${rand}`}>
      <button type="button" onClick={bijKlik}
        style={{ background: "none", border: 0, padding: 0, textAlign: "left", width: "100%", cursor: "pointer", color: "inherit" }}>
        <div className="titel">{taak.titel}</div>
        {taak.toelichting && <div className="mini afkap" style={{ marginTop: 2 }}>{taak.toelichting}</div>}
      </button>

      <div className="meta">
        {taak.status !== "open" && (
          <Merkje kleur={STATUS_KLEUR[taak.status]}>{STATUS_TEKST[taak.status]}</Merkje>
        )}
        {taak.deadline && (
          <Merkje kleur={toon === "verlopen" ? "rood" : toon === "vandaag" ? "amber" : undefined}>
            {toon === "verlopen" ? "Verlopen: " : ""}{datumKort(taak.deadline)}
          </Merkje>
        )}
        {taak.prioriteit === "hoog" && <Merkje kleur="rood">Hoog</Merkje>}
        {taak.projects && (
          <Merkje>
            <span className="stip" style={taak.projects.kleur ? { background: taak.projects.kleur } : undefined} />
            {taak.projects.naam}
          </Merkje>
        )}
      </div>

      {bijWijziging && taak.status !== "afgerond" && (
        <div className="knoprij" style={{ marginTop: "0.6rem" }}>
          <button className="knop klein" disabled={bezig}
            onClick={() => void doe(() => rondTaakAf(taak.id), "Afgerond.")}>
            {Icoon.vink({})} Afronden
          </button>
          <button className="knop klein" disabled={bezig}
            onClick={() => void doe(() => stelUit(taak.id, 1), "Naar morgen geschoven.")}>
            {Icoon.klok({})} Morgen
          </button>
          <button className="knop klein" disabled={bezig}
            onClick={() => void doe(() => stelUit(taak.id, 7), "Een week opgeschoven.")}>
            Volgende week
          </button>
        </div>
      )}
    </article>
  );
}

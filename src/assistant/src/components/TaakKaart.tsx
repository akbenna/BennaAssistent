import { Merkje } from "./ui";
import { datumKort, deadlineToon } from "../lib/format";
import type { Prioriteit, TaakRij, TaakStatus } from "../types/db";

export const STATUS_TEKST: Record<TaakStatus, string> = {
  voorstel: "Voorstel",
  open: "Open",
  wacht_op_antwoord: "Wacht op antwoord",
  antwoord_binnen: "Antwoord binnen",
  afgerond: "Afgerond",
  vervallen: "Vervallen",
};

const STATUS_KLEUR: Partial<Record<TaakStatus, "accent" | "groen" | "rood" | "blauw">> = {
  voorstel: "accent",
  wacht_op_antwoord: "blauw",
  antwoord_binnen: "groen",
};

export const PRIORITEIT_TEKST: Record<Prioriteit, string> = {
  laag: "Laag",
  normaal: "Normaal",
  hoog: "Hoog",
};

export function TaakKaart({ taak, bijKlik }: { taak: TaakRij; bijKlik: () => void }) {
  const toon = deadlineToon(taak.deadline);
  const rand = toon === "verlopen" ? " verlopen" : toon === "vandaag" ? " vandaag" : "";

  return (
    <button type="button" className={`kaart taak${rand}`} onClick={bijKlik}>
      <div className="titel">{taak.titel}</div>
      {taak.toelichting && <div className="mini afkap" style={{ marginTop: 2 }}>{taak.toelichting}</div>}
      <div className="meta">
        {taak.status !== "open" && (
          <Merkje kleur={STATUS_KLEUR[taak.status]}>{STATUS_TEKST[taak.status]}</Merkje>
        )}
        {taak.deadline && (
          <Merkje kleur={toon === "verlopen" ? "rood" : toon === "vandaag" ? "accent" : undefined}>
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
    </button>
  );
}

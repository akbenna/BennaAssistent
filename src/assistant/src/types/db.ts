// Handmatig bijgehouden spiegel van schema 0001/0002.
// Opnieuw genereren kan met: npx supabase gen types typescript --project-id cohgbocslfgxfshelsts

export type TaakStatus =
  | "voorstel" | "open" | "wacht_op_antwoord" | "antwoord_binnen" | "afgerond" | "vervallen";
export type Prioriteit = "laag" | "normaal" | "hoog";
export type ConceptStatus = "klaar" | "aangepast" | "goedgekeurd" | "verstuurd" | "weggegooid";
export type BronSoort = "gmail" | "calendar" | "drive" | "whatsapp_share" | "handmatig";
export type FilterSoort = "afzender" | "domein" | "label" | "patroon";
export type NotitieSoort = "notitie" | "onderzoek";

export interface Taak {
  id: string;
  project_id: string | null;
  titel: string;
  toelichting: string | null;
  status: TaakStatus;
  prioriteit: Prioriteit;
  deadline: string | null;
  aangemaakt_door: string;
  afgerond_op: string | null;
  gearchiveerd_op: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  naam: string;
  kleur: string | null;
  trefwoorden: string[];
  afzenders: string[];
  gearchiveerd: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  source_id: string;
  extern_id: string;
  thread_id: string | null;
  deeplink: string | null;
  afzender: string | null;
  onderwerp: string | null;
  samenvatting: string | null;
  ontvangen_op: string | null;
  uitgesloten: boolean;
  uitsluitreden: string | null;
}

export interface Bron {
  id: string;
  kind: BronSoort;
  account: string | null;
  actief: boolean;
  laatst_gesynct: string | null;
  laatste_fout: string | null;
}

export interface Concept {
  id: string;
  task_id: string | null;
  gmail_draft_id: string | null;
  thread_id: string | null;
  status: ConceptStatus;
  goedgekeurd_op: string | null;
  verstuurd_op: string | null;
  created_at: string;
}

export interface Opvolging {
  id: string;
  task_id: string;
  thread_id: string;
  verstuurd_op: string;
  herinner_na_werkdagen: number;
  beantwoord_op: string | null;
  laatste_herinnering_op: string | null;
}

export interface Notitie {
  id: string;
  task_id: string;
  soort: NotitieSoort;
  inhoud: string;
  created_at: string;
}

export interface Filter {
  id: string;
  soort: FilterSoort;
  waarde: string;
  omschrijving: string | null;
  actief: boolean;
}

export interface Sjabloon {
  id: string;
  naam: string;
  wanneer: string | null;
  inhoud: string;
  actief: boolean;
}

export interface Logregel {
  id: number;
  actie: string;
  object_type: string | null;
  object_id: string | null;
  model: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Afspraak {
  titel: string;
  start: string | null;
  locatie: string | null;
  link: string | null;
}

export interface Dagoverzicht {
  afspraken?: Afspraak[];
  afspraken_fout?: string;
  deadlines?: Array<Pick<Taak, "id" | "titel" | "deadline" | "prioriteit" | "status">>;
  antwoorden?: Array<Pick<Taak, "id" | "titel">>;
  voorstellen?: Array<Pick<Taak, "id" | "titel">>;
  aantal_voorstellen?: number;
  opvolging_verlopen?: Array<{ task_id: string; titel: string | null; sinds: string }>;
}

/** Taak met de namen erbij die de lijstweergave toont. */
export interface TaakRij extends Taak {
  projects: { naam: string; kleur: string | null } | null;
}

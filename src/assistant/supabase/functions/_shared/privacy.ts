// BennaAssistent privacyfilter.
// Draait vóór elke modelaanroep. Uitgesloten items gaan nooit naar het taalmodel.
// Harde regels (HARD_*) kunnen niet via de database worden uitgezet.

export interface MailLike {
  from: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string;
  labels?: string[];
}

export interface FilterRow {
  soort: "afzender" | "domein" | "label" | "patroon";
  waarde: string;
  actief: boolean;
}

export interface FilterResult {
  excluded: boolean;
  reason: string | null;
}

// Zorgmail-/beveiligde zorgdomeinen: berichten hierover bevatten patiëntzaken.
const HARD_DOMAINS = ["ezorg.nl", "zorgmail.nl", "zorgdomein.nl", "zorgdomein.com"];

// Sterke contextsignalen voor patiëntinformatie. Bewust smal: het woord
// "patiënten" in een businesscase mag niet tot uitsluiting leiden.
const HARD_PHRASES: RegExp[] = [
  /\buw pati[eë]nt(e)?\b/i,
  /\bbetreft\s*:?\s*pati[eë]nt/i,
  /\bgeboortedatum\b/i,
  /\bgeb\.?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/i,
  /\bzorgdomein\b/i,
  /\bedifact\b/i,
  /\b(lab|laboratorium)uitslag(en)?\b/i,
  /\b(specialisten|ontslag|verwijs)brief\b/i,
  /\bconsultverslag\b/i,
  /\bICPC[- ]?[A-Z]\d{2}\b/i,
  /\bBSN\b/,
];

const NINE_DIGITS = /\b\d{9}\b|\b\d{4}[.\s]\d{2}[.\s]\d{3}\b/g;

/** Burgerservicenummer-elfproef (gewichten 9..2 en -1). */
export function isBsn(candidate: string): boolean {
  const d = candidate.replace(/\D/g, "");
  if (d.length !== 9 || /^0+$/.test(d)) return false;
  const w = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  return sum % 11 === 0;
}

function domainOf(address: string): string {
  const m = address.toLowerCase().match(/@([a-z0-9.-]+)/);
  return m ? m[1] : "";
}

function domainMatches(domain: string, rule: string): boolean {
  const r = rule.toLowerCase().replace(/^@/, "");
  return domain === r || domain.endsWith("." + r);
}

export function checkPrivacy(mail: MailLike, rows: FilterRow[] = []): FilterResult {
  const parties = [mail.from, ...(mail.to ?? []), ...(mail.cc ?? [])].filter(Boolean);
  const domains = parties.map(domainOf);
  const body = `${mail.subject ?? ""}\n${mail.text ?? ""}`;
  const active = rows.filter((r) => r.actief);

  for (const d of domains) {
    for (const h of HARD_DOMAINS) {
      if (domainMatches(d, h)) return { excluded: true, reason: `zorgdomein: ${h}` };
    }
  }

  for (const re of HARD_PHRASES) {
    if (re.test(body)) return { excluded: true, reason: `patiëntsignaal: ${re.source}` };
  }

  for (const m of body.match(NINE_DIGITS) ?? []) {
    if (isBsn(m)) return { excluded: true, reason: "mogelijk BSN (elfproef)" };
  }

  const lowerParties = parties.map((p) => p.toLowerCase());
  for (const r of active) {
    const v = r.waarde.toLowerCase().trim();
    if (!v) continue;
    if (r.soort === "afzender" && lowerParties.some((p) => p.includes(v))) {
      return { excluded: true, reason: `afzender: ${r.waarde}` };
    }
    if (r.soort === "domein" && domains.some((d) => domainMatches(d, v))) {
      return { excluded: true, reason: `domein: ${r.waarde}` };
    }
    if (r.soort === "label" && (mail.labels ?? []).some((l) => l.toLowerCase() === v)) {
      return { excluded: true, reason: `label: ${r.waarde}` };
    }
    if (r.soort === "patroon") {
      let re: RegExp | null = null;
      try {
        re = new RegExp(r.waarde, "i");
      } catch {
        // Ongeldig patroon: bij twijfel uitsluiten.
        return { excluded: true, reason: `ongeldig patroon: ${r.waarde}` };
      }
      if (re.test(body)) return { excluded: true, reason: `patroon: ${r.waarde}` };
    }
  }

  return { excluded: false, reason: null };
}

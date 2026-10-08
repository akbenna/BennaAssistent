/**
 * EEN BEWAARD ARTIKEL LEZEN
 *
 * Wie een link bij een notitie zet, wil dat de samenvatting over het artikel
 * gaat en niet over de link. Dus halen we de pagina op en houden we de
 * leesbare tekst over. Geen browser, geen JavaScript: een artikel achter een
 * inlogscherm of een app die zichzelf pas in de browser opbouwt, levert weinig
 * op, en dan zegt de notitie dat ook.
 *
 * Alleen http(s) naar een gewone hostnaam. Adressen in het eigen netwerk
 * (localhost, 10.x, 192.168.x, de metadata van de cloud) worden geweigerd: de
 * functie draait naast de database, en een link mag geen deur naar binnen zijn.
 */

const MAX_BYTES = 2_000_000;
const MAX_TEKENS = 30_000;

/** Een link die we willen ophalen, of de reden waarom niet. */
export function toetsLink(ruw: string): { url: URL } | { fout: string } {
  let u: URL;
  try { u = new URL(ruw.trim()); } catch { return { fout: "geen geldige link" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { fout: "alleen http- en https-links" };
  if (u.username || u.password) return { fout: "links met inloggegevens worden niet opgehaald" };
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const intern =
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
    !h.includes(".") && !h.includes(":") ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) ||
    h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h) || /^::ffff:/.test(h);
  if (intern) return { fout: "deze link wijst naar een intern adres" };
  return { url: u };
}

const ENTITEITEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "\u2014", ndash: "\u2013", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', euml: "ë", eacute: "é", iuml: "ï", ouml: "ö", uuml: "ü" };

function ontcijfer(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITEITEN[e.toLowerCase()] ?? m;
  });
}

/**
 * De leesbare tekst van een HTML-pagina: titel apart, en het artikel als dat
 * er is, anders de hele body zonder menu's, kop- en voetregels en scripts.
 * Alinea's blijven alinea's.
 */
export function htmlNaarTekst(html: string): { titel: string; tekst: string } {
  const titel = ontcijfer((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 300);
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
  const artikel = h.match(/<article\b[\s\S]*?<\/article>/gi);
  if (artikel?.length) h = artikel.join("\n");
  else h = h.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? h;
  const tekst = ontcijfer(h
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|figcaption|dd|dt)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " "))
    .split("\n").map((r) => r.replace(/[ \t ]+/g, " ").trim()).filter(Boolean)
    .join("\n").slice(0, MAX_TEKENS);
  return { titel, tekst };
}

export async function leesPagina(link: string): Promise<{ titel: string; tekst: string }> {
  const t = toetsLink(link);
  if ("fout" in t) throw new Error(t.fout);
  const r = await fetch(t.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; BennaAssistent/1.0; notitie)", accept: "text/html,text/plain;q=0.9" },
  });
  if (!r.ok) throw new Error(`de pagina gaf ${r.status}`);
  // Een doorverwijzing mag niet alsnog naar binnen wijzen.
  if (r.url && "fout" in toetsLink(r.url)) throw new Error("de link verwijst door naar een intern adres");
  const soort = r.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)|application\/xhtml/i.test(soort)) throw new Error(`geen tekstpagina (${soort.split(";")[0] || "onbekend"})`);
  const lezer = r.body?.getReader();
  if (!lezer) throw new Error("lege pagina");
  const stukken: Uint8Array[] = [];
  let totaal = 0;
  while (totaal < MAX_BYTES) {
    const { done, value } = await lezer.read();
    if (done) break;
    stukken.push(value);
    totaal += value.length;
  }
  await lezer.cancel().catch(() => {});
  const bytes = new Uint8Array(totaal);
  let o = 0;
  for (const s of stukken) { bytes.set(s.subarray(0, Math.min(s.length, totaal - o)), o); o += s.length; }
  const ruw = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return /text\/plain/i.test(soort) ? { titel: "", tekst: ruw.slice(0, MAX_TEKENS) } : htmlNaarTekst(ruw);
}

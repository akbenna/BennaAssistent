import { type Admin, env } from "./core.ts";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
];

export class GoogleError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(body: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...body,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new GoogleError(r.status, `Token: ${JSON.stringify(j)}`);
  return j;
}

export function exchangeCode(code: string) {
  return tokenCall({
    code,
    grant_type: "authorization_code",
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
  });
}

export async function accessToken(admin: Admin, sourceId: string): Promise<string> {
  const { data, error } = await admin.rpc("lees_token", { p_source: sourceId });
  if (error || !data) throw new Error(`Geen token voor bron ${sourceId}`);
  const j = await tokenCall({ refresh_token: data as string, grant_type: "refresh_token" });
  return j.access_token as string;
}

export async function g<T = any>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new GoogleError(r.status, `${url}: ${await r.text()}`);
  return r.status === 204 ? (undefined as T) : await r.json();
}

export const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const CAL = "https://www.googleapis.com/calendar/v3";

// ---------- Berichten ontleden ----------

function b64urlDecode(s: string): string {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}

export function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stripHtml(h: string): string {
  return h.replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

function findPart(p: any, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return b64urlDecode(p.body.data);
  for (const c of p.parts ?? []) {
    const r = findPart(c, mime);
    if (r) return r;
  }
  return null;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labels: string[];
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  messageIdHeader: string | null;
  date: Date;
  text: string;
}

const splitAddr = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseMessage(m: any): ParsedMessage {
  const h = (n: string) =>
    m.payload?.headers?.find((x: any) => x.name.toLowerCase() === n.toLowerCase())?.value as string | undefined;
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  return {
    id: m.id,
    threadId: m.threadId,
    labels: m.labelIds ?? [],
    from: h("From") ?? "",
    to: splitAddr(h("To")),
    cc: splitAddr(h("Cc")),
    subject: h("Subject") ?? "",
    messageIdHeader: h("Message-ID") ?? h("Message-Id") ?? null,
    date: new Date(Number(m.internalDate)),
    text: (plain ?? (html ? stripHtml(html) : m.snippet ?? "")).slice(0, 8000),
  };
}

export const threadLink = (threadId: string) => `https://mail.google.com/mail/u/0/#all/${threadId}`;

/** Onderwerp met niet-ASCII-tekens veilig coderen (RFC 2047). */
export function encodeSubject(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
}

export function buildRaw(o: { to: string; subject: string; body: string; inReplyTo?: string | null }): string {
  const lines = [
    `To: ${o.to}`,
    `Subject: ${encodeSubject(o.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (o.inReplyTo) lines.push(`In-Reply-To: ${o.inReplyTo}`, `References: ${o.inReplyTo}`);
  return b64urlEncode(lines.join("\r\n") + "\r\n\r\n" + o.body);
}

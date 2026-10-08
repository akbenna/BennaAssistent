/**
 * DE OPNEMER
 *
 * Neemt op in delen van vijf minuten, en binnen elk deel in blokken van
 * dertig seconden die meteen naar boven gaan. Twee getallen, elk met een reden:
 *
 * - Dertig seconden, omdat iOS de microfoon kan stilzetten als het scherm op
 *   slot gaat. Wat boven staat is veilig; een uitval kost hooguit een blok.
 * - Vijf minuten, omdat de serverfunctie geen ffmpeg heeft. Elk deel is een
 *   eigen opnamesessie en dus een zelfstandig bestand: de blokken achter elkaar
 *   geplakt zijn weer geldig, want alleen het eerste blok draagt de kop. En
 *   zodra een deel klaar is, kan het al worden uitgeschreven terwijl de
 *   vergadering doorloopt.
 *
 * Het volgende deel begint een seconde vóór het vorige stopt. Een naad zonder
 * overlap verliest een lettergreep; een naad met overlap herhaalt er hooguit
 * één, en dat weet het taalmodel.
 *
 * Alles wat naar de server gaat loopt door één wachtrij, op volgorde, en wordt
 * herhaald tot het lukt: het aanmelden van een deel, elk blok, en het melden
 * dat een deel compleet is. Een deel dat 'klaar' heet terwijl er nog een blok
 * onderweg is, zou zonder zijn laatste halve minuut worden uitgeschreven.
 */
import { supabase } from "./supabase";

export const BLOK_MS = 30_000;
export const DEEL_MS = 5 * 60_000;
const OVERLAP_MS = 1_000;

export interface Formaat { mime: string; ext: string; type: string }

export function kiesFormaat(): Formaat {
  const opties: Formaat[] = [
    { mime: "audio/webm;codecs=opus", ext: "webm", type: "audio/webm" },
    { mime: "audio/mp4", ext: "mp4", type: "audio/mp4" },
    { mime: "audio/webm", ext: "webm", type: "audio/webm" },
  ];
  const kan = (m: string) => typeof MediaRecorder !== "undefined"
    && typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(m);
  return opties.find((o) => kan(o.mime)) ?? { mime: "", ext: "webm", type: "audio/webm" };
}

const drie = (n: number) => String(n).padStart(3, "0");
const vijf = (n: number) => String(n).padStart(5, "0");

/** Op naam gesorteerd is dat ook op volgorde: tot 999 delen en 99.999 blokken. */
export const deelMap = (uid: string, notitie: string, deel: number) => `${uid}/${notitie}/deel-${drie(deel)}`;
export const blokPad = (uid: string, notitie: string, deel: number, blok: number, ext: string) =>
  `${deelMap(uid, notitie, deel)}/blok-${vijf(blok)}.${ext}`;

type Klus =
  | { soort: "deel"; volgnummer: number; mime: string; beginSec: number }
  | { soort: "blok"; pad: string; blob: Blob; type: string }
  | { soort: "compleet"; volgnummer: number; duurSec: number };

const wacht = (ms: number) => new Promise((k) => setTimeout(k, ms));

export interface Terugmelding {
  niveau?: (n: number) => void;
  wachtrij?: (n: number) => void;
  melding?: (m: string | null) => void;
  /** Een deel staat compleet boven en kan worden uitgeschreven. */
  deelKlaar?: () => void;
}

export class Opnemer {
  private klussen: Klus[] = [];
  private pompt = false;
  private stroom: MediaStream | null = null;
  private huidig: { rec: MediaRecorder; volgnummer: number; blok: number; begin: number } | null = null;
  private wisselTimer: number | undefined;
  private slot: WakeLockSentinel | null = null;
  private klank: AudioContext | null = null;
  private start = 0;
  private gestopt = false;
  private openSessies = 0;
  private formaat = kiesFormaat();

  constructor(private readonly uid: string, private readonly notitieId: string, private readonly terug: Terugmelding) {}

  get openstaand(): number { return this.klussen.length; }

  async begin(): Promise<void> {
    this.stroom = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.start = Date.now();
    this.nieuwDeel(1);
    this.meter();
    await this.houdWakker();
    document.addEventListener("visibilitychange", this.zichtbaar);
  }

  private zichtbaar = () => {
    if (document.visibilityState === "visible" && !this.gestopt) void this.houdWakker();
  };

  private async houdWakker() {
    try { this.slot = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* niet ondersteund */ }
  }

  private nieuwDeel(volgnummer: number) {
    if (!this.stroom) return;
    const rec = new MediaRecorder(this.stroom, {
      ...(this.formaat.mime ? { mimeType: this.formaat.mime } : {}),
      audioBitsPerSecond: 32_000,
    });
    const deel = { rec, volgnummer, blok: 0, begin: Date.now() };
    this.zetInRij({ soort: "deel", volgnummer, mime: this.formaat.type, beginSec: (deel.begin - this.start) / 1000 });
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      deel.blok += 1;
      this.zetInRij({ soort: "blok", pad: blokPad(this.uid, this.notitieId, volgnummer, deel.blok, this.formaat.ext), blob: e.data, type: this.formaat.type });
    };
    rec.onstop = () => {
      // Het laatste blok komt altijd vóór onstop binnen; daarna is het deel compleet.
      this.zetInRij({ soort: "compleet", volgnummer, duurSec: (Date.now() - deel.begin) / 1000 });
      this.openSessies -= 1;
    };
    this.openSessies += 1;
    rec.start(BLOK_MS);
    this.huidig = deel;
    this.wisselTimer = window.setTimeout(() => this.wissel(), DEEL_MS);
  }

  /** Het volgende deel begint, het vorige stopt een seconde later. */
  private wissel() {
    if (this.gestopt || !this.huidig) return;
    const oud = this.huidig.rec;
    this.nieuwDeel(this.huidig.volgnummer + 1);
    window.setTimeout(() => { if (oud.state !== "inactive") oud.stop(); }, OVERLAP_MS);
  }

  private meter() {
    try {
      const Klank = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Klank || !this.stroom) return;
      this.klank = new Klank();
      const an = this.klank.createAnalyser();
      an.fftSize = 512;
      this.klank.createMediaStreamSource(this.stroom).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tik = () => {
        if (this.gestopt) return;
        an.getByteTimeDomainData(buf);
        let som = 0;
        for (const v of buf) som += ((v - 128) / 128) ** 2;
        this.terug.niveau?.(Math.min(1, Math.sqrt(som / buf.length) * 4));
        requestAnimationFrame(tik);
      };
      tik();
    } catch { /* de meter is versiering */ }
  }

  private zetInRij(k: Klus) {
    this.klussen.push(k);
    this.terug.wachtrij?.(this.klussen.filter((x) => x.soort === "blok").length);
    void this.pomp();
  }

  async pomp(): Promise<void> {
    if (this.pompt) return;
    this.pompt = true;
    let poging = 0;
    while (this.klussen.length) {
      const k = this.klussen[0]!;
      const fout = await this.voerUit(k);
      if (fout) {
        poging += 1;
        this.terug.melding?.(`Uploaden mislukt, nieuwe poging. (${fout})`);
        await wacht(Math.min(30_000, 1000 * 2 ** poging));
        continue;
      }
      poging = 0;
      this.terug.melding?.(null);
      this.klussen.shift();
      this.terug.wachtrij?.(this.klussen.filter((x) => x.soort === "blok").length);
      if (k.soort === "compleet") this.terug.deelKlaar?.();
    }
    this.pompt = false;
  }

  private async voerUit(k: Klus): Promise<string | null> {
    if (k.soort === "deel") {
      const { error } = await supabase.from("notitie_delen").upsert(
        { notitie_id: this.notitieId, volgnummer: k.volgnummer, mime: k.mime, begin_sec: k.beginSec, status: "opname" },
        { onConflict: "notitie_id,volgnummer", ignoreDuplicates: true },
      );
      return error?.message ?? null;
    }
    if (k.soort === "blok") {
      const { error } = await supabase.storage.from("opnames").upload(k.pad, k.blob, { contentType: k.type, upsert: true });
      if (!error) {
        /* Ook een teken van leven: een opname die drie uur niets bijwerkt geldt
           als afgebroken. Een query van Supabase gaat pas de deur uit als iemand
           op het antwoord wacht; `void` alleen zou hem nooit versturen. */
        supabase.from("notities").update({ duur_sec: Math.round((Date.now() - this.start) / 1000) })
          .eq("id", this.notitieId).then(() => {}, () => {});
      }
      return error?.message ?? null;
    }
    const { error } = await supabase.from("notitie_delen")
      .update({ status: "klaar", duur_sec: k.duurSec }).eq("notitie_id", this.notitieId).eq("volgnummer", k.volgnummer);
    return error?.message ?? null;
  }

  /** Stopt en wacht tot alles boven staat. Geeft true als er niets meer openstaat. */
  async stop(maxWachtMs = 120_000): Promise<boolean> {
    this.gestopt = true;
    window.clearTimeout(this.wisselTimer);
    if (this.huidig && this.huidig.rec.state !== "inactive") this.huidig.rec.stop();
    const tot = Date.now() + maxWachtMs;
    // Eerst wachten tot elke sessie zijn onstop heeft gehad, dan tot de rij leeg is.
    while (this.openSessies > 0 && Date.now() < tot) await wacht(100);
    this.stroom?.getTracks().forEach((t) => t.stop());
    void this.klank?.close().catch(() => {});
    void this.slot?.release().catch(() => {});
    document.removeEventListener("visibilitychange", this.zichtbaar);
    while ((this.klussen.length || this.pompt) && Date.now() < tot) await wacht(300);
    return this.klussen.length === 0;
  }

  get seconden(): number { return this.start ? (Date.now() - this.start) / 1000 : 0; }
}

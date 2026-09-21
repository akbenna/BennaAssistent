import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

/*
 * TWEE MANIEREN OM BINNEN TE KOMEN, EN WAAROM DE ENE VOOROP STAAT
 *
 * Inloggen met Google is één tik en er komt geen mail aan te pas. De inloglink
 * werkt ook, maar hangt aan de mailserver van Supabase, en die laat maar een
 * paar berichten per uur door. Wie twee keer op de knop drukt omdat de eerste
 * mail niet meteen binnen is, zit voor een uur op slot — precies wat er gebeurde
 * op de avond dat deze pagina werd herschreven.
 *
 * De link blijft staan als achtervang, ingeklapt. Hij is de enige weg terug als
 * er ooit iets misgaat met de Google-koppeling, en dat is genoeg reden om hem
 * niet weg te halen.
 *
 * Dit staat los van de koppeling met Gmail en Agenda. Die loopt via een eigen
 * toestemming met een eigen vernieuwingstoken in de Vault, en blijft bestaan
 * ook als je hier met een mailtje binnenkomt. Inloggen zegt wie je bent; de
 * koppeling zegt waar de assistent bij mag.
 */

/* Foutmeldingen van GoTrue komen in het Engels binnen en zeggen niet wat je
   eraan kunt doen. De belangrijkste drie krijgen een Nederlandse uitleg. */
function leesbaar(bericht: string): string {
  const b = bericht.toLowerCase();
  if (b.includes("rate limit")) {
    return "Er zijn de afgelopen tijd te veel inloglinks aangevraagd. Kijk in je mailbox: "
      + "waarschijnlijk staat er al een geldige link. Anders is inloggen met Google de snelste weg.";
  }
  if (b.includes("only request this after")) {
    return "Nog even wachten — een nieuwe link mag pas na een halve minuut.";
  }
  if (b.includes("provider is not enabled")) {
    return "Inloggen met Google staat nog niet aan in Supabase. Gebruik voor nu de inloglink per mail.";
  }
  return bericht;
}

export function Login() {
  const [email, setEmail] = useState("");
  const [stand, setStand] = useState<"leeg" | "bezig" | "google" | "verstuurd">("leeg");
  const [fout, setFout] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  /* Komt Google met een weigering terug, dan zet hij de reden in de fragment-
     identificator. Zonder dit blijf je op een leeg inlogscherm staan zonder te
     weten waarom je er nog bent. */
  useEffect(() => {
    const brok = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const beschrijving = brok.get("error_description") ?? brok.get("error");
    if (beschrijving) {
      setFout(leesbaar(decodeURIComponent(beschrijving.replace(/\+/g, " "))));
      history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function metGoogle() {
    setStand("google");
    setFout(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // Zonder dit pakt Google stilzwijgend het account waarmee je in de
        // browser al bent ingelogd. Met meerdere accounts op één toestel kom je
        // dan binnen als iemand anders en zie je een lege lijst.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setFout(leesbaar(error.message));
      setStand("leeg");
    }
    // Bij succes verlaat de browser deze pagina; er valt hier niets meer te doen.
  }

  async function verstuurLink(e: FormEvent) {
    e.preventDefault();
    setStand("bezig");
    setFout(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setFout(leesbaar(error.message));
      setStand("leeg");
      return;
    }
    setStand("verstuurd");
  }

  return (
    <main style={{ minHeight: "100%", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <div style={{ width: "min(400px, 100%)" }}>
        <div className="rij" style={{ gap: "0.6rem", marginBottom: "1.5rem" }}>
          <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 11 }} />
          <div>
            <h1 style={{ fontSize: "1.35rem" }}>BennaAssistent</h1>
            <p className="mini" style={{ margin: 0 }}>Mail wordt taak, taak wordt antwoord.</p>
          </div>
        </div>

        {stand === "verstuurd" ? (
          <div className="kaart">
            <h2 style={{ fontSize: "1.05rem" }}>Kijk in je mail</h2>
            <p className="klein" style={{ marginBottom: 0 }}>
              Er staat een inloglink in je inbox op <strong>{email}</strong>. Die opent de app meteen;
              een wachtwoord heb je niet nodig. Komt hij niet aan, kijk dan in de map ongewenste post.
            </p>
          </div>
        ) : (
          <div className="kaart">
            <button type="button" className="knop google" style={{ width: "100%" }}
              disabled={stand !== "leeg"} onClick={() => void metGoogle()}>
              <GoogleMerk />
              {stand === "google" ? "Even doorverwijzen…" : "Inloggen met Google"}
            </button>
            <p className="mini" style={{ margin: "0.65rem 0 0", textAlign: "center" }}>
              Hetzelfde account waar je mail en agenda in staan.
            </p>

            {fout && (
              <p className="klein" style={{ color: "var(--fout)", marginTop: "0.9rem", marginBottom: 0 }}>
                {fout}
              </p>
            )}

            <div style={{ borderTop: "1px solid var(--lijn)", marginTop: "1rem", paddingTop: "0.8rem" }}>
              {linkOpen ? (
                <form onSubmit={(e) => void verstuurLink(e)}>
                  <label className="veld">
                    <span>E-mailadres</span>
                    <input type="email" required autoComplete="email" value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" />
                  </label>
                  <button className="knop" style={{ width: "100%" }} type="submit" disabled={stand !== "leeg"}>
                    {stand === "bezig" ? "Bezig…" : "Stuur mij een inloglink"}
                  </button>
                </form>
              ) : (
                <button type="button" className="knop kaal klein" style={{ width: "100%" }}
                  onClick={() => setLinkOpen(true)}>
                  Liever een inloglink per mail
                </button>
              )}
            </div>
          </div>
        )}

        <p className="mini" style={{ marginTop: "1rem", textAlign: "center" }}>
          Alleen jouw eigen account heeft toegang tot deze gegevens.
        </p>
      </div>
    </main>
  );
}

/* Het merkteken van Google, in de vier kleuren die het hoort te hebben. Geen
   eigen tekening en geen pictogram uit de set hiernaast: Google schrijft voor
   dat een knop die "inloggen met Google" zegt dit teken draagt, en een
   nagemaakte G is juist wat hun richtlijn verbiedt. De kleuren staan hard in
   deze component en niet in een token: ze zijn niet van deze app. */
function GoogleMerk() {
  return (
    <svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

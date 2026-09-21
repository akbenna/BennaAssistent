import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [stand, setStand] = useState<"leeg" | "bezig" | "verstuurd">("leeg");
  const [fout, setFout] = useState<string | null>(null);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setStand("bezig");
    setFout(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setFout(error.message);
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
            <p className="klein zacht" style={{ marginBottom: 0 }}>
              Er staat een inloglink in je inbox op <strong>{email}</strong>. Die opent de app meteen;
              een wachtwoord heb je niet nodig.
            </p>
          </div>
        ) : (
          <form className="kaart" onSubmit={(e) => void verstuur(e)}>
            <label className="veld">
              <span>E-mailadres</span>
              <input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="jij@voorbeeld.nl" />
            </label>
            {fout && <p className="klein" style={{ color: "var(--rood)" }}>{fout}</p>}
            <button className="knop primair" style={{ width: "100%" }} type="submit" disabled={stand === "bezig"}>
              {stand === "bezig" ? "Bezig…" : "Stuur mij een inloglink"}
            </button>
          </form>
        )}

        <p className="mini" style={{ marginTop: "1rem", textAlign: "center" }}>
          Alleen jouw eigen account heeft toegang tot deze gegevens.
        </p>
      </div>
    </main>
  );
}

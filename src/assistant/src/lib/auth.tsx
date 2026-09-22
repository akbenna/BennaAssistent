import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface SessieWaarde {
  sessie: Session | null;
  gereed: boolean;
  /** Er is een sessie, maar hij is nog niet door de tweede stap gekomen. */
  tweedeStapNodig: boolean;
  hertoets: () => void;
  afmelden: () => Promise<void>;
}

const Ctx = createContext<SessieWaarde>({
  sessie: null, gereed: false, tweedeStapNodig: false,
  hertoets: () => {}, afmelden: async () => {},
});

export function SessieProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null);
  const [gereed, setGereed] = useState(false);
  const [tweedeStapNodig, setTweede] = useState(false);
  const [ronde, setRonde] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session);
      setGereed(true);
    });
    const { data: abo } = supabase.auth.onAuthStateChange((_gebeurtenis, s) => setSessie(s));
    return () => abo.subscription.unsubscribe();
  }, []);

  /*
   * Met tweestapsverificatie geeft GoTrue ná het wachtwoord al een sessie,
   * maar op niveau aal1. Pas de code uit de telefoon tilt hem naar aal2. Zonder
   * deze controle zou de app dus gewoon opengaan met alleen een wachtwoord en
   * was de tweede stap een sierknop.
   */
  useEffect(() => {
    let actueel = true;
    if (!sessie) { setTweede(false); return; }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (actueel) setTweede(data?.nextLevel === "aal2" && data.currentLevel !== "aal2");
      })
      .catch(() => { if (actueel) setTweede(false); });
    return () => { actueel = false; };
  }, [sessie, ronde]);

  const waarde = useMemo<SessieWaarde>(
    () => ({
      sessie,
      gereed,
      tweedeStapNodig,
      hertoets: () => setRonde((r) => r + 1),
      afmelden: async () => {
        await supabase.auth.signOut();
      },
    }),
    [sessie, gereed, tweedeStapNodig],
  );

  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export function useSessie(): SessieWaarde {
  return useContext(Ctx);
}

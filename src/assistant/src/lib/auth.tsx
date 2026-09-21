import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface SessieWaarde {
  sessie: Session | null;
  gereed: boolean;
  afmelden: () => Promise<void>;
}

const Ctx = createContext<SessieWaarde>({ sessie: null, gereed: false, afmelden: async () => {} });

export function SessieProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null);
  const [gereed, setGereed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session);
      setGereed(true);
    });
    const { data: abo } = supabase.auth.onAuthStateChange((_gebeurtenis, s) => setSessie(s));
    return () => abo.subscription.unsubscribe();
  }, []);

  const waarde = useMemo<SessieWaarde>(
    () => ({
      sessie,
      gereed,
      afmelden: async () => {
        await supabase.auth.signOut();
      },
    }),
    [sessie, gereed],
  );

  return <Ctx.Provider value={waarde}>{children}</Ctx.Provider>;
}

export function useSessie(): SessieWaarde {
  return useContext(Ctx);
}

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        /* React, de router en de Supabase-client veranderen bijna nooit; de
           app zelf wekelijks. Apart gebundeld hoeft een update alleen het
           kleine stuk opnieuw over de lijn te halen in plaats van alles.
           Rollup wil hier sinds versie 5 een functie in plaats van een lijst;
           de pakketnaam wordt daarom uit het pad gehaald in plaats van dat we
           op een losse tekenreeks zoeken — "react" komt in genoeg paden voor. */
        manualChunks(id: string) {
          const pakket = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)?.[1];
          if (!pakket) return undefined;
          if (["react", "react-dom", "react-router", "react-router-dom"].includes(pakket)) return "react";
          if (pakket.startsWith("@supabase/")) return "supabase";
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
});

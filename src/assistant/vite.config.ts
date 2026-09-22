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
           kleine stuk opnieuw over de lijn te halen in plaats van alles. */
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
  server: { port: 5173 },
});

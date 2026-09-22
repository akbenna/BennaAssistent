import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // De tabel-lezer gebruikt DOMParser en DecompressionStream. Het tweede zit
    // in Node, het eerste niet; happy-dom vult dat aan zonder een hele browser
    // te starten.
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});

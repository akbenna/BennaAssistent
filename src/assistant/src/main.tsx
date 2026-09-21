import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SessieProvider } from "./lib/auth";
import { MeldingProvider } from "./components/ui";
import { huidigThema, zetThema } from "./lib/thema";
import "./app.css";

// Vóór de eerste render, anders flitst er een licht scherm voor een donker langs.
zetThema(huidigThema());

const wortel = document.getElementById("root");
if (!wortel) throw new Error("Element #root ontbreekt in index.html");

createRoot(wortel).render(
  <StrictMode>
    <BrowserRouter>
      <SessieProvider>
        <MeldingProvider>
          <App />
        </MeldingProvider>
      </SessieProvider>
    </BrowserRouter>
  </StrictMode>,
);

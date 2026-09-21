import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Icoon } from "./components/ui";
import { useSessie } from "./lib/auth";
import { haalTellingen, type Tellingen } from "./lib/data";
import { Login } from "./pages/Login";
import { Vandaag } from "./pages/Vandaag";
import { Voorstellen } from "./pages/Voorstellen";
import { Taken } from "./pages/Taken";
import { Projecten } from "./pages/Projecten";
import { Instellingen } from "./pages/Instellingen";
import { Delen } from "./pages/Delen";

export default function App() {
  const { sessie, gereed } = useSessie();

  if (!gereed) {
    return <main style={{ display: "grid", placeItems: "center", height: "100%" }}><span className="mini">Even laden…</span></main>;
  }
  if (!sessie) return <Login />;

  return (
    <div className="schil">
      <header className="kop">
        <span className="merk">
          <img src="/icons/icon-192.png" alt="" width={26} height={26} />
          BennaAssistent
        </span>
      </header>
      <main className="inhoud">
        <Routes>
          <Route path="/" element={<Vandaag />} />
          <Route path="/voorstellen" element={<Voorstellen />} />
          <Route path="/taken" element={<Taken />} />
          <Route path="/projecten" element={<Projecten />} />
          <Route path="/instellingen" element={<Instellingen />} />
          <Route path="/delen" element={<Delen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Navigatie />
    </div>
  );
}

function Navigatie() {
  const [tellingen, setTellingen] = useState<Tellingen | null>(null);
  const plek = useLocation();

  useEffect(() => {
    let actueel = true;
    const laad = () => {
      haalTellingen()
        .then((t) => { if (actueel) setTellingen(t); })
        .catch(() => { /* tellingen zijn bijzaak; de pagina toont de echte fout */ });
    };
    laad();
    const tik = window.setInterval(laad, 60_000);
    const opFocus = () => laad();
    window.addEventListener("focus", opFocus);
    return () => {
      actueel = false;
      window.clearInterval(tik);
      window.removeEventListener("focus", opFocus);
    };
  }, [plek.pathname]);

  const link = (naar: string, label: string, icoon: JSX.Element, teller?: number) => (
    <NavLink to={naar} end={naar === "/"} className={({ isActive }) => (isActive ? "actief" : "")}>
      {icoon}
      <span>{label}</span>
      {teller ? <span className="teller">{teller > 99 ? "99+" : teller}</span> : null}
    </NavLink>
  );

  return (
    <nav className="nav" aria-label="Hoofdmenu">
      {link("/", "Vandaag", Icoon.vandaag({}), tellingen?.vandaag)}
      {link("/voorstellen", "Voorstellen", Icoon.inbox({}), tellingen?.voorstellen)}
      {link("/taken", "Taken", Icoon.taken({}))}
      {link("/projecten", "Projecten", Icoon.projecten({}))}
      {link("/instellingen", "Instellingen", Icoon.instellingen({}))}
    </nav>
  );
}

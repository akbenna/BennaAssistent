import { Suspense, lazy, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Icoon } from "./components/ui";
import { HulpKnop } from "./components/Hulp";
import { useSessie } from "./lib/auth";
import { haalTellingen, type Tellingen } from "./lib/data";
import { huidigThema, THEMA_LABEL, volgendThema, zetThema, type Thema } from "./lib/thema";
import { Login, TweedeStap } from "./pages/Login";
import { Vandaag } from "./pages/Vandaag";
import { Voorstellen } from "./pages/Voorstellen";
import { Taken } from "./pages/Taken";
import { OpnameProvider } from "./lib/opname";
import { OpnameBalk } from "./components/Opname";

/* Vandaag, Voorstellen en Taken zijn de dagelijkse route; die laden meteen.
   De rest komt pas als je erheen gaat. */
const Projecten = lazy(() => import("./pages/Projecten").then((m) => ({ default: m.Projecten })));
const Instellingen = lazy(() => import("./pages/Instellingen").then((m) => ({ default: m.Instellingen })));
const Delen = lazy(() => import("./pages/Delen").then((m) => ({ default: m.Delen })));
const Notities = lazy(() => import("./pages/Notities").then((m) => ({ default: m.Notities })));
const NotitieDetail = lazy(() => import("./pages/NotitieDetail").then((m) => ({ default: m.NotitieDetail })));
const Nascholing = lazy(() => import("./pages/Nascholing").then((m) => ({ default: m.Nascholing })));
const Toezeggingen = lazy(() => import("./pages/Toezeggingen").then((m) => ({ default: m.Toezeggingen })));
const Onderzoek = lazy(() => import("./pages/Onderzoek").then((m) => ({ default: m.Onderzoek })));
const OnderzoekDetail = lazy(() => import("./pages/OnderzoekDetail").then((m) => ({ default: m.OnderzoekDetail })));

export default function App() {
  const { sessie, gereed, tweedeStapNodig } = useSessie();

  if (!gereed) {
    return <main style={{ display: "grid", placeItems: "center", height: "100%" }}><span className="mini">Even laden…</span></main>;
  }
  if (!sessie) return <Login />;
  if (tweedeStapNodig) return <TweedeStap />;

  /* De opname hangt rond de hele schil: wie tijdens een vergadering naar een
     taak kijkt, breekt de opname daarmee niet af. */
  return (
    <OpnameProvider>
    <div className="schil">
      <header className="kop">
        <span className="merk">
          <img src="/icons/icon-192.png" alt="" width={24} height={24} />
          BennaAssistent
        </span>
        <span className="rechts"><HulpKnop /><ThemaKnop /></span>
      </header>
      <main className="inhoud">
        <OpnameBalk />
        <Suspense fallback={<p className="mini">Even laden…</p>}>
          <Routes>
            <Route path="/" element={<Vandaag />} />
            <Route path="/voorstellen" element={<Voorstellen />} />
            <Route path="/taken" element={<Taken />} />
            <Route path="/projecten" element={<Projecten />} />
            <Route path="/instellingen" element={<Instellingen />} />
            <Route path="/delen" element={<Delen />} />
            <Route path="/notities" element={<Notities />} />
            <Route path="/notities/:id" element={<NotitieDetail />} />
            <Route path="/nascholing" element={<Nascholing />} />
            <Route path="/onderzoek" element={<Onderzoek />} />
            <Route path="/toezeggingen" element={<Toezeggingen />} />
            <Route path="/onderzoek/:id" element={<OnderzoekDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Navigatie />
    </div>
    </OpnameProvider>
  );
}

/* Eén rondje dat door drie standen draait. Het pictogram zegt welke stand
   aanstaat, de titel zegt het in woorden voor wie het rondje niet ziet. */
function ThemaKnop() {
  const [thema, setThema] = useState<Thema>(() => huidigThema());
  const wissel = () => {
    const nieuw = volgendThema(thema);
    zetThema(nieuw);
    setThema(nieuw);
  };
  const teken = thema === "licht" ? Icoon.zon({}) : thema === "donker" ? Icoon.maan({}) : Icoon.autoThema({});
  return (
    <button type="button" className="themaknop" onClick={wissel} title={THEMA_LABEL[thema]} aria-label={THEMA_LABEL[thema]}>
      {teken}
    </button>
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
      {/* Alleen zichtbaar zodra de tabbalk een zijbalk wordt; op een telefoon
          staat het merk al in de kop en zou dit een tweede keer zijn. */}
      <div className="zijmerk" aria-hidden="true">
        <b><img src="/icons/icon-192.png" alt="" width={24} height={24} />BennaAssistent</b>
        <span>secretariaat</span>
      </div>
      {link("/", "Vandaag", Icoon.vandaag({}), tellingen?.vandaag)}
      {link("/notities", "Notities", Icoon.microfoon({}), tellingen?.notities)}
      {link("/voorstellen", "Voorstellen", Icoon.inbox({}), tellingen?.voorstellen)}
      {link("/taken", "Taken", Icoon.taken({}))}
      {link("/projecten", "Projecten", Icoon.projecten({}))}
      {link("/instellingen", "Instellingen", Icoon.instellingen({}))}
    </nav>
  );
}

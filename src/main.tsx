import React from "react";
import { createRoot } from "react-dom/client";
import SiteRoot from "./SiteRoot";
import "./styles.css";
import "./ui-refresh.css";
import "./onboarding-weather.css";
import "./health-refinements.css";
import "./secondary-refinements.css";
import "./landing.css";
const CareApp = React.lazy(() => import("./ClientAccessRoot"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteRoot>
      <CareApp />
    </SiteRoot>
  </React.StrictMode>,
);

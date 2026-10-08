import React from "react";
import { createRoot } from "react-dom/client";
import ClientAccessRoot from "./ClientAccessRoot";
import "./styles.css";
import "./ui-refresh.css";
import "./onboarding-weather.css";
import "./health-refinements.css";
import "./secondary-refinements.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClientAccessRoot />
  </React.StrictMode>,
);

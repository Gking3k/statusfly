import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./visual-refresh.css";
import "./phase7-refinement.css";
import "./phase7-storefront-refinement.css";
import "./phase7-workflow-refinement.css";
import "./phase7-responsive-final.css";
import "./phase7-launch-readiness.css";
import "./phase8-mobile-polish.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

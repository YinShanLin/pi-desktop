import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Global: suppress the default browser context menu so right-click on
// the app surface does nothing. (Shift+Option+click in devtools still
// works because that path doesn't go through the contextmenu event.)
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

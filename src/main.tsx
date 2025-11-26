import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Clear potentially corrupted settings on load
try {
  const stored = localStorage.getItem("loggy-settings");
  if (stored) {
    const parsed = JSON.parse(stored);
    // If version mismatch or data looks wrong, clear it
    if (!parsed.state?.logLevels || !Array.isArray(parsed.state.logLevels)) {
      console.warn("Clearing corrupted loggy-settings");
      localStorage.removeItem("loggy-settings");
    }
  }
} catch {
  localStorage.removeItem("loggy-settings");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

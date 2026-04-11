import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initInstanceRole } from "./stores/instanceRole";

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

// Kick off instance role resolution as early as possible. Store hydration
// awaits the same promise so the race between zustand's first getItem and
// this fetch is closed.
void initInstanceRole();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

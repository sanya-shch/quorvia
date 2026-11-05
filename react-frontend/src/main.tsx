import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { i18nReady } from "./i18n";
import App from "./App.tsx";
import { preloadRouteChunk } from "./routes";

preloadRouteChunk(window.location.pathname);

// The first render waits for the active language bundle; the route chunk
// download started above runs in parallel with it.
void i18nReady.then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});

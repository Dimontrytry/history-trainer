import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { StateProvider } from "./state";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StateProvider>
      <App />
    </StateProvider>
  </React.StrictMode>,
);

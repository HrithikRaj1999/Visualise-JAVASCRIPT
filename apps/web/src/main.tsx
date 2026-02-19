import React from "react";
import { createRoot } from "react-dom/client";
import { toast, Toaster } from "sonner";
import { FontSizeProvider } from "./context/FontSizeContext";
import { App } from "./app/App";
import "./styles.css";

// The Toaster was missing from main.tsx in the viewing, so let's add it here to be safe.
// Wait, main.tsx had `import { toast } from "sonner";` but I didn't see where it was rendered.
// It might have been in a higher level or I missed it.
// Let's add it to the root.

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Toaster position="top-right" theme="dark" />
    <FontSizeProvider>
      <App />
    </FontSizeProvider>
  </React.StrictMode>,
);

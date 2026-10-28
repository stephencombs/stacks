import { ClerkProvider } from "@clerk/react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree, defaultPreload: "intent" });

// The palette follows the system theme; without this, every button would fade into its new color.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const root = document.documentElement;
  root.dataset.themeSwitching = "";
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        // The palette's variables switch with the color scheme, so Clerk follows dark mode too.
        variables: {
          colorPrimary: "var(--color-accent)",
          colorPrimaryForeground: "var(--color-accent-ink)",
          colorBackground: "var(--color-surface)",
          colorForeground: "var(--color-ink)",
          colorMutedForeground: "var(--color-muted)",
          colorNeutral: "var(--color-ink)",
          colorInput: "var(--color-surface)",
          colorInputForeground: "var(--color-ink)",
          colorDanger: "var(--color-danger)",
          borderRadius: "0.75rem",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
        // Padding grows the avatar's hit area to 44px without changing how it looks.
        elements: { userButtonTrigger: "-m-2 p-2" },
      }}
    >
      <RouterProvider router={router} />
    </ClerkProvider>
  </StrictMode>,
);

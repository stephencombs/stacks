import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { Gallery } from "./Gallery";

// `vp dev` serves /design.html; `vp build` only bundles index.html, so this never ships. It has its
// own router because the app's sits behind Clerk, and the links here only need one to exist.
const router = createRouter({
  routeTree: createRootRoute({ component: Gallery }),
  history: createMemoryHistory(),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router as never} />
  </StrictMode>,
);

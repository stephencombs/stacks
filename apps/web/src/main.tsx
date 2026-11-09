import { RecordingProvider } from "@stacks/client-runtime/recordingReact";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import "./lib/offlineShell";
import { AccountProvider } from "./lib/account";
import { recordingStore } from "./lib/recording";
import { captureCaughtError } from "./lib/telemetry";
import { markNavigation } from "./features/PageSkeletons";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree, defaultPreload: "intent" });
// Page skeletons time their reveal from the navigation, not from when they mount.
router.subscribe("onBeforeNavigate", markNavigation);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!, {
  onCaughtError: (error, info) => {
    console.error(error, info.componentStack);
    captureCaughtError(error);
  },
}).render(
  <StrictMode>
    <RecordingProvider store={recordingStore}>
      <AccountProvider>
        <RouterProvider router={router} />
      </AccountProvider>
    </RecordingProvider>
  </StrictMode>,
);

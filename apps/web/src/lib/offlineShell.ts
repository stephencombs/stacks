import { useSyncExternalStore } from "react";

// The worker never takes over a tab on its own, so a new version waits until this page asks for it.
let ready = false;
let apply = () => {};
const listeners = new Set<() => void>();

const offer = (next: () => void) => {
  apply = next;
  ready = true;
  for (const listener of listeners) listener();
};

/** Whether a newer version is installed and waiting for this page to reload into it. */
export const useShellUpdate = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => ready,
  );

/** Switches to the waiting version and reloads. Only ever called from a person's confirmation. */
export const applyShellUpdate = () => apply();

async function registerOfflineShell() {
  const container = navigator.serviceWorker;
  try {
    const registration = await container.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    let requested = false;
    let reloading = false;
    container.addEventListener("controllerchange", () => {
      // Another tab took the update. Reloading here could drop an unsaved recording, so only offer.
      if (!requested) return offer(() => location.reload());
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    const offerWaiting = () => {
      const waiting = registration.waiting;
      // Without a controller this is the first install, which already serves the next load.
      if (!waiting || !container.controller) return;
      offer(() => {
        requested = true;
        // eslint-disable-next-line unicorn/require-post-message-target-origin -- ServiceWorker.postMessage has no targetOrigin argument.
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
    };
    const watchInstallation = () => {
      const installing = registration.installing;
      if (!installing) return;
      const check = () => {
        if (installing.state === "installing" || installing.state === "parsed") return;
        installing.removeEventListener("statechange", check);
        if (installing.state === "redundant") {
          console.error(
            "Color Up could not install its offline app shell. Reopening offline may fail.",
          );
        } else if (installing.state === "installed") {
          offerWaiting();
        }
      };
      installing.addEventListener("statechange", check);
      check();
    };
    registration.addEventListener("updatefound", watchInstallation);
    watchInstallation();
    offerWaiting();
    // Registering checks once on load; a tab or installed app left open checks again on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update().catch(() => {});
    });
  } catch (error) {
    console.error(
      "Color Up could not register its offline app shell. Reopening offline may fail.",
      error,
    );
  }
}

if (
  import.meta.env.PROD &&
  import.meta.env.COLOR_UP_OFFLINE_SHELL === "enabled" &&
  "serviceWorker" in navigator
) {
  void registerOfflineShell();
}

async function registerOfflineShell() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
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
        }
      };
      installing.addEventListener("statechange", check);
      check();
    };
    registration.addEventListener("updatefound", watchInstallation);
    watchInstallation();
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

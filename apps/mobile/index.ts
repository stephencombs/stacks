import { registerRootComponent } from "expo";
import { createElement, useEffect, useState, type ComponentType } from "react";
import { Text, View } from "react-native";

import { StartupBoundary } from "./src/StartupBoundary";

// The rest of the app touches native modules while its imports run. That work
// happens before React paints, so a throw or a hang there is a black screen
// the startup boundary cannot show. Paint first, then load it.
function Boot() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadApp()
      .then((Component) => {
        if (!cancelled) setApp(() => Component);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error : new Error(String(error)));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failure) throw failure;
  if (!App) return createElement(Opening);
  return createElement(App);
}

async function loadApp(): Promise<ComponentType> {
  await import("./src/lib/diagnostics");
  await import("./src/polyfills");
  await import("./global.css");
  const { ObserveRoot } = await import("expo-observe");
  const { default: App } = await import("./src/App");
  return ObserveRoot.wrap(App);
}

function Opening() {
  return createElement(
    View,
    { style: { flex: 1, alignItems: "center", justifyContent: "center" } },
    createElement(Text, { accessibilityRole: "status" }, "Opening Color Up…"),
  );
}

function Root() {
  return createElement(StartupBoundary, null, createElement(Boot));
}

registerRootComponent(Root);

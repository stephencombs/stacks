import "./src/lib/diagnostics";
import "./src/polyfills";
import "./global.css";
import { registerRootComponent } from "expo";
import { createElement } from "react";
import { ObserveRoot } from "expo-observe";

import App from "./src/App";
import { StartupBoundary } from "./src/StartupBoundary";

const ObservedApp = ObserveRoot.wrap(App);

function Root() {
  return createElement(StartupBoundary, null, createElement(ObservedApp));
}

registerRootComponent(Root);

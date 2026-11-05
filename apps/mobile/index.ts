import "./src/polyfills";
import "./src/lib/diagnostics";
import "./global.css";

import { registerRootComponent } from "expo";
import { createElement } from "react";
import App from "./src/App";
import { StartupBoundary } from "./src/StartupBoundary";

function Root() {
  return createElement(StartupBoundary, null, createElement(App));
}

registerRootComponent(Root);

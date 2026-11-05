import "./src/polyfills";
import "./global.css";
import { registerRootComponent } from "expo";
import { createElement } from "react";

import App from "./src/App";
import { StartupBoundary } from "./src/StartupBoundary";

function Root() {
  return createElement(StartupBoundary, null, createElement(App));
}

registerRootComponent(Root);

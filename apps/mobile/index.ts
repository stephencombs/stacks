import "./global.css";
import { getRandomValues } from "expo-crypto";
import { registerRootComponent } from "expo";

import App from "./src/App";

// Hermes has no Web Crypto; IDs are minted on the device (see @stacks/client-runtime/ids).
globalThis.crypto ??= {} as Crypto;
globalThis.crypto.getRandomValues ??= getRandomValues as Crypto["getRandomValues"];

registerRootComponent(App);

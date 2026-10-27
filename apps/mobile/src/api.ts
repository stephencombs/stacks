import { makeStacksClient } from "@stacks/client-runtime/api";
import Constants from "expo-constants";

// In dev the phone reaches the worker on the same machine that serves Metro.
const devApiUrl = () => {
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return metroHost ? `http://${metroHost}:8787` : "http://localhost:8787";
};

export const Stacks = makeStacksClient(process.env.EXPO_PUBLIC_API_URL ?? devApiUrl());

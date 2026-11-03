import Constants from "expo-constants";

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

// In dev the phone reaches the worker on the same machine that serves Metro.
const devApiUrl = () => {
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return metroHost ? `http://${metroHost}:8787` : "http://localhost:8787";
};

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? devApiUrl();

/** Invite and claim links open the web app, which works whether or not Color Up is installed. */
export const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173";

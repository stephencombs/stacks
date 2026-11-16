import Constants from "expo-constants";
import * as Linking from "expo-linking";

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

// In dev the phone reaches the worker on the same machine that serves Metro.
const devApiUrl = () => {
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return metroHost ? `http://${metroHost}:8787` : "http://localhost:8787";
};

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? devApiUrl();

/** Links shared from the app open directly in Color Up's custom URL scheme. */
export const appUrl = (path: string) => Linking.createURL(path.replace(/^\/+/, ""));

// Expo strips android.config from the public manifest; expose availability without the key.
export const googleMapsEnabled = Constants.expoConfig?.extra?.googleMapsEnabled === true;

import Constants from "expo-constants";
import * as Linking from "expo-linking";

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

const devApiUrl = () => {
  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];

  return metroHost ? `http://${metroHost}:8787` : "http://localhost:8787";
};

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? devApiUrl();

const appScheme = () => {
  const scheme = Constants.expoConfig?.scheme;

  return (Array.isArray(scheme) ? scheme[0] : scheme) ?? "stacks";
};

/** The prefixes a link into the app can start with. */
export const appLinkPrefixes = () => [`${appScheme()}://`, Linking.createURL("/")];

/**
 * Links shared from the app open directly in Color Up's custom URL scheme. Built from the scheme
 * rather than `Linking.createURL`, which adds Metro's host on a dev client and breaks the path.
 */
export const appUrl = (path: string) => `${appScheme()}://${path.replace(/^\/+/, "")}`;

export const googleMapsEnabled = Constants.expoConfig?.extra?.googleMapsEnabled === true;

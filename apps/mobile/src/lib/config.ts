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

const linkHost = () => {
  const host = String(Constants.expoConfig?.extra?.linkHost ?? "");

  return host === "" ? null : host;
};

/** The prefixes a link into the app can start with. */
export const appLinkPrefixes = () => {
  const host = linkHost();

  return [`${appScheme()}://`, Linking.createURL("/"), ...(host ? [`https://${host}`] : [])];
};

/**
 * Links shared from the app open directly in Color Up's custom URL scheme. Built from the scheme
 * rather than `Linking.createURL`, which adds Metro's host on a dev client and breaks the path.
 */
export const appUrl = (path: string) => `${appScheme()}://${path.replace(/^\/+/, "")}`;

/**
 * The link a person sends. Where the build has a link host it is an https link, which opens the app
 * when it's installed and a page when it isn't; the token sits in the fragment so no server sees it.
 * Without a host it is the scheme link.
 */
export const inviteUrl = (kind: "t" | "invite" | "join" | "claim", token: string) => {
  const host = linkHost();

  return host ? `https://${host}/${kind}#${token}` : appUrl(`${kind}/${token}`);
};

export const googleMapsEnabled = Constants.expoConfig?.extra?.googleMapsEnabled === true;

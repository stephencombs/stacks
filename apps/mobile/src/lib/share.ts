import * as Clipboard from "expo-clipboard";
import { Platform, Share } from "react-native";

/** Opens the share sheet on a phone; copies the link on the web build. */
export const shareLink = async (url: string, message: string) => {
  if (Platform.OS === "web") {
    await Clipboard.setStringAsync(url);
    return "copied" as const;
  }
  await Share.share({ message: `${message} ${url}` });
  return "shared" as const;
};

export const shareText = async (message: string) => {
  if (Platform.OS === "web") {
    await Clipboard.setStringAsync(message);
    return "copied" as const;
  }
  await Share.share({ message });
  return "shared" as const;
};

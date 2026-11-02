import * as Clipboard from "expo-clipboard";
import { File, Paths } from "expo-file-system";
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

export const shareCsv = async (filename: string, csv: string) => {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (Platform.OS === "ios") {
    const file = new File(Paths.cache, filename);
    await file.write(csv);
    await Share.share({ url: file.uri });
    return;
  }
  await Share.share({ title: filename, message: csv });
};

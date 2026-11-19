import { File, Paths } from "expo-file-system";
import { Platform, Share } from "react-native";

export const shareLink = async (url: string, message: string) => {
  await Share.share({ message: `${message} ${url}` });
};

export const shareCsv = async (filename: string, csv: string) => {
  if (Platform.OS === "ios") {
    const file = new File(Paths.cache, filename);
    await file.write(csv);
    await Share.share({ url: file.uri });
    return;
  }
  await Share.share({ title: filename, message: csv });
};

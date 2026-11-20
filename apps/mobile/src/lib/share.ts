import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

export const shareLink = async (url: string, message: string) => {
  await Share.share({ message: `${message} ${url}` });
};

export const shareCsv = async (filename: string, csv: string) => {
  const file = new File(Paths.cache, filename);
  await file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: filename,
    });
    return;
  }
  await Share.share({ title: filename, message: csv, url: file.uri });
};

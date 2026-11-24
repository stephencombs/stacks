import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { PixelRatio, Share } from "react-native";
import { captureRef } from "react-native-view-shot";

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

/** A share card is 1080×1350 physical pixels, for Stories and Messages. */
const CARD_IMAGE = { width: 1080, height: 1350 } as const;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Captures the mounted card and hands the PNG to the share sheet, then deletes it. The image is
 * made when asked and never kept, so hiding amounts can't be followed by sharing an older capture.
 * `view` must be `collapsable={false}`; its logical size can be anything with the card's 4:5
 * shape, because the capture is scaled to the target size.
 */
export const shareImage = async (view: Parameters<typeof captureRef>[0], title: string) => {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Sharing isn't available on this device.");

  await nextFrame();
  await nextFrame();
  const ratio = PixelRatio.get();

  const uri = await captureRef(view, {
    format: "png",
    quality: 1,
    result: "tmpfile",
    width: CARD_IMAGE.width / ratio,
    height: CARD_IMAGE.height / ratio,
  });

  try {
    await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: title });
  } finally {
    const file = new File(uri);

    if (file.exists) file.delete();
  }
};

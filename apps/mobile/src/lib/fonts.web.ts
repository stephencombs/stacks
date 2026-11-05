import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed/700Bold";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { useFonts } from "expo-font";

export function useAppFonts() {
  useFonts({
    "BarlowCondensed-Bold": BarlowCondensed_700Bold,
    "JetBrainsMono-Medium": JetBrainsMono_500Medium,
  });
}

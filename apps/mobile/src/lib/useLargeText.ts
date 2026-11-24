import { useWindowDimensions } from "react-native";

import { isLargeText } from "./largeText";

export const useLargeText = () => isLargeText(useWindowDimensions().fontScale);

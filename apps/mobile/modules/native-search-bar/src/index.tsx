import { requireNativeView } from "expo";
import type { ComponentType } from "react";
import type { NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";

type NativeSearchBarProps = {
  text: string;
  placeholder: string;
  style?: StyleProp<ViewStyle>;
  onChangeText: (event: NativeSyntheticEvent<{ text: string }>) => void;
};

/** A `UISearchBar` with the system clear button, shown once text is typed. iOS only. */
export const NativeSearchBar: ComponentType<NativeSearchBarProps> = requireNativeView(
  "NativeSearchBar",
  "NativeSearchBarView",
);

import { Alert, Platform } from "react-native";

import { requestConfirmation, type Confirmation } from "./confirmStore";

/**
 * Asks before something destructive. Android shows `ConfirmDialogHost`'s Material dialog. An
 * `onConfirm` that returns a promise can resolve to a sentence when it failed: Android shows it in
 * the dialog, iOS in its system alert.
 */
export function confirmAction(
  title: string,
  message: string,
  label: string,
  onConfirm: Confirmation["onConfirm"],
  options?: { readonly dismissLabel?: string; readonly icon?: "trash" },
) {
  const failed = (error: string | null) => {
    if (error === null) return;
    Alert.alert("Something went wrong", error);
  };

  const confirmed = () => void Promise.resolve(onConfirm()).then((error) => failed(error ?? null));

  if (Platform.OS === "android") {
    requestConfirmation({ title, message, label, onConfirm, ...options });

    return;
  }

  Alert.alert(title, message, [
    { text: options?.dismissLabel ?? "Cancel", style: "cancel" },
    { text: label, style: "destructive", onPress: confirmed },
  ]);
}

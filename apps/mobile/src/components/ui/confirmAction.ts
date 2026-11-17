import { Alert, Platform } from "react-native";

import { requestConfirmation, type Confirmation } from "./confirmStore";

/**
 * Asks before something destructive. Android shows `ConfirmDialogHost`'s Material dialog. An
 * `onConfirm` that returns a promise can resolve to a sentence when it failed: Android shows it in
 * the dialog, iOS and the web in an alert of their own.
 */
export function confirmAction(
  title: string,
  message: string,
  label: string,
  onConfirm: Confirmation["onConfirm"],
) {
  const failed = (error: string | null) => {
    if (error === null) return;
    if (Platform.OS === "web") window.alert(error);
    else Alert.alert("Something went wrong", error);
  };
  const confirmed = () => void Promise.resolve(onConfirm()).then((error) => failed(error ?? null));
  if (Platform.OS === "web") {
    if (window.confirm(title + "\n\n" + message)) confirmed();
    return;
  }
  if (Platform.OS === "android") {
    requestConfirmation({ title, message, label, onConfirm });
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: label, style: "destructive", onPress: confirmed },
  ]);
}

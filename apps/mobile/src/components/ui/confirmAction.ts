import { Alert, Platform } from "react-native";

import { requestConfirmation } from "./confirmStore";

/** Asks before something destructive. Android shows `ConfirmDialogHost`'s Material dialog. */
export function confirmAction(
  title: string,
  message: string,
  label: string,
  onConfirm: () => void,
) {
  if (Platform.OS === "web") {
    if (window.confirm(title + "\n\n" + message)) onConfirm();
    return;
  }
  if (Platform.OS === "android") {
    requestConfirmation({ title, message, label, onConfirm });
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: label, style: "destructive", onPress: onConfirm },
  ]);
}

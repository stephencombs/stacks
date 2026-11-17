import { AlertDialog, Text, TextButton } from "@expo/ui/jetpack-compose";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";
import { dismissConfirmation, useConfirmation } from "./confirmStore";

/**
 * A Material 3 alert dialog: sentence-case text buttons, with the destructive one in loss red.
 * It renders nothing until `confirmAction` asks.
 */
export function ConfirmDialogHost() {
  const confirmation = useConfirmation();
  const loss = String(useCSSVariable("--color-loss"));
  if (!confirmation) return null;
  return (
    <Host style={{ position: "absolute", width: 0, height: 0 }}>
      <AlertDialog onDismissRequest={dismissConfirmation}>
        <AlertDialog.Title>
          <Text>{confirmation.title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>{confirmation.message}</Text>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={dismissConfirmation}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton
            onClick={() => {
              const { onConfirm } = confirmation;
              dismissConfirmation();
              onConfirm();
            }}
            colors={{ contentColor: loss }}
          >
            <Text>{confirmation.label}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}

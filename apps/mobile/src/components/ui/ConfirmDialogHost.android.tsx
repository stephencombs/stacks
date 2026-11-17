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
  const [surface, ink, muted, loss] = useCSSVariable([
    "--color-surface",
    "--color-ink",
    "--color-muted",
    "--color-loss",
  ]).map(String);
  if (!confirmation) return null;
  return (
    <Host style={{ position: "absolute", width: 0, height: 0 }}>
      <AlertDialog
        onDismissRequest={dismissConfirmation}
        colors={{
          containerColor: surface,
          titleContentColor: ink,
          textContentColor: muted,
        }}
      >
        <AlertDialog.Title>
          <Text>{confirmation.title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>{confirmation.message}</Text>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={dismissConfirmation} colors={{ contentColor: ink }}>
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

import { AlertDialog, Column, Text, TextButton } from "@expo/ui/jetpack-compose";
import { useCSSVariable } from "uniwind";

import { ComposeHost as Host } from "./ComposeHost.android";
import { answerConfirmation, dismissConfirmation, useConfirmation } from "./confirmStore";

/**
 * A Material 3 alert dialog: sentence-case text buttons, with the destructive one in loss red.
 * It renders nothing until `confirmAction` asks. While an async action runs it can't be dismissed,
 * and if the action fails it says why.
 */
export function ConfirmDialogHost() {
  const asking = useConfirmation();
  const loss = String(useCSSVariable("--color-loss"));
  if (!asking) return null;
  const { confirmation, pending, error } = asking;
  return (
    <Host style={{ position: "absolute", width: 0, height: 0 }}>
      <AlertDialog onDismissRequest={pending ? () => {} : dismissConfirmation}>
        <AlertDialog.Title>
          <Text>{confirmation.title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Column>
            <Text>{confirmation.message}</Text>
            {error ? <Text color={loss}>{"\n" + error}</Text> : null}
          </Column>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton enabled={!pending} onClick={dismissConfirmation}>
            <Text>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton
            enabled={!pending}
            onClick={answerConfirmation}
            colors={{ contentColor: loss, disabledContentColor: loss }}
          >
            <Text>{pending ? confirmation.label + "…" : confirmation.label}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}

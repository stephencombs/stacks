import type { GroupDetail, Player } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import {
  parsePaymentHandlesForm,
  paymentHandlesList,
  type PaymentHandlesErrors,
} from "@stacks/client-runtime/pay";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { FormError, TextField } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { useAction, useStacks } from "../lib/stacks";

export const playerHandlesMeta = (player: Player): string | undefined => {
  const items = paymentHandlesList(player);
  return items.length > 0 ? items.map((item) => item.value).join(" · ") : undefined;
};

export function PaymentAppsSection({ detail }: { detail: GroupDetail }) {
  const [editing, setEditing] = useState(false);
  const me = detail.players.find((player) => player.id === detail.myPlayerId);
  if (!me) return null;
  const items = paymentHandlesList(me);

  return (
    <View className="gap-2">
      <SectionHeading
        action={
          <Button
            label={items.length > 0 ? "Edit" : "Add"}
            size="sm"
            variant="ghost"
            onPress={() => setEditing(true)}
          />
        }
      >
        Payment apps
      </SectionHeading>
      {items.length === 0 ? (
        <Text className="text-sm text-muted">
          Add your Venmo, Cash App or PayPal so people can pay you straight from settle up.
        </Text>
      ) : (
        <List>
          {items.map((item) => (
            <Row
              key={item.app}
              onPress={() => setEditing(true)}
              accessibilityHint="Edit your payment apps"
            >
              <Text className="flex-1 text-base font-medium text-ink">{item.label}</Text>
              <Text className="text-sm text-muted">{item.value}</Text>
            </Row>
          ))}
        </List>
      )}
      {editing ? (
        <PaymentHandlesSheet detail={detail} player={me} onClose={() => setEditing(false)} />
      ) : null}
    </View>
  );
}

export function GuestPaymentHandlesAction({
  detail,
  player,
}: {
  detail: GroupDetail;
  player: Player;
}) {
  const [editing, setEditing] = useState(false);
  if (!isAdmin(detail)) return null;
  return (
    <>
      <Button label="Payment apps" size="sm" variant="ghost" onPress={() => setEditing(true)} />
      {editing ? (
        <PaymentHandlesSheet detail={detail} player={player} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

function PaymentHandlesSheet({
  detail,
  player,
  onClose,
}: {
  detail: GroupDetail;
  player: Player;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const save = useAction(stacks.Client.mutation("groups", "setPaymentHandles"));
  const [venmo, setVenmo] = useState(player.venmo ? `@${player.venmo}` : "");
  const [cashApp, setCashApp] = useState(player.cashApp ? `$${player.cashApp}` : "");
  const [paypal, setPaypal] = useState(player.paypal ?? "");
  const [errors, setErrors] = useState<PaymentHandlesErrors>({});
  const self = player.id === detail.myPlayerId;
  const usdOnlyHint = detail.group.currency !== "USD" ? "USD groups only." : undefined;

  const submit = async () => {
    const parsed = parsePaymentHandlesForm({ venmo, cashApp, paypal });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    const updated = await save.run({
      params: { groupId: detail.group.id, playerId: player.id },
      payload: parsed.value,
    });
    if (updated) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={self ? "Payment apps" : `${player.displayName}'s payment apps`}
      description={
        self
          ? `People in ${detail.group.name} get payment links on settle up. Stacks never moves money.`
          : `People in ${detail.group.name} get payment links when paying ${player.displayName}.`
      }
      footer={
        <Button
          label="Save payment apps"
          variant="primary"
          size="lg"
          pending={save.pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label="Venmo username"
        value={venmo}
        onChangeText={setVenmo}
        placeholder="@alex"
        maxLength={32}
        autoCapitalize="none"
        autoCorrect={false}
        {...(usdOnlyHint ? { hint: usdOnlyHint } : {})}
        error={errors.venmo ?? null}
      />
      <TextField
        label="Cash App $cashtag"
        value={cashApp}
        onChangeText={setCashApp}
        placeholder="$alex"
        maxLength={22}
        autoCapitalize="none"
        autoCorrect={false}
        {...(usdOnlyHint ? { hint: usdOnlyHint } : {})}
        error={errors.cashApp ?? null}
      />
      <TextField
        label="PayPal.Me username"
        value={paypal}
        onChangeText={setPaypal}
        placeholder="alex"
        maxLength={60}
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.paypal ?? null}
      />
      {save.error ? <FormError>{save.error}</FormError> : null}
    </Sheet>
  );
}

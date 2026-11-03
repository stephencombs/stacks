import type { GroupDetail, Player } from "@stacks/contracts";
import { isAdmin } from "@stacks/client-runtime/format";
import {
  parsePaymentHandlesForm,
  paymentHandlesList,
  type PaymentHandlesErrors,
} from "@stacks/client-runtime/pay";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input } from "~/components/ui/Field";
import { Note, Section } from "~/components/ui/Page";
import { List, Row, RowText } from "~/components/ui/Surface";
import { useAction, useStacks } from "~/lib/stacks";

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
    <Section
      title="Payment apps"
      action={
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {items.length > 0 ? "Edit" : "Add"}
        </Button>
      }
    >
      {items.length === 0 ? (
        <Note>
          Add your Venmo, Cash App or PayPal so people can pay you straight from settle up.
        </Note>
      ) : (
        <List>
          {items.map((item) => (
            <Row key={item.app}>
              <RowText title={item.label} />
              <span className="text-sm text-muted">{item.value}</span>
            </Row>
          ))}
        </List>
      )}
      {editing ? (
        <PaymentHandlesDialog detail={detail} player={me} onClose={() => setEditing(false)} />
      ) : null}
    </Section>
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
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Payment apps
      </Button>
      {editing ? (
        <PaymentHandlesDialog detail={detail} player={player} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

function PaymentHandlesDialog({
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
  const [errors, setErrors] = useState<PaymentHandlesErrors>({});
  const self = player.id === detail.myPlayerId;
  const usdOnlyHint = detail.group.currency !== "USD" ? "USD groups only." : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parsePaymentHandlesForm({
      venmo: String(form.get("venmo") ?? ""),
      cashApp: String(form.get("cashApp") ?? ""),
      paypal: String(form.get("paypal") ?? ""),
    });
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
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={self ? "Payment apps" : `${player.displayName}'s payment apps`}
      description={
        self
          ? `People in ${detail.group.name} get payment links on settle up. Stacks never moves money.`
          : `People in ${detail.group.name} get payment links when paying ${player.displayName}.`
      }
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <Field label="Venmo username" hint={usdOnlyHint} error={errors.venmo ?? null}>
          {(props) => (
            <Input
              {...props}
              name="venmo"
              defaultValue={player.venmo ? `@${player.venmo}` : ""}
              placeholder="@alex"
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label="Cash App $cashtag" hint={usdOnlyHint} error={errors.cashApp ?? null}>
          {(props) => (
            <Input
              {...props}
              name="cashApp"
              defaultValue={player.cashApp ? `$${player.cashApp}` : ""}
              placeholder="$alex"
              maxLength={22}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        <Field label="PayPal.Me username" error={errors.paypal ?? null}>
          {(props) => (
            <Input
              {...props}
              name="paypal"
              defaultValue={player.paypal ?? ""}
              placeholder="alex"
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        {save.error ? <FormError>{save.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" pending={save.pending}>
          Save payment apps
        </Button>
      </form>
    </Dialog>
  );
}

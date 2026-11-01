import { createFileRoute } from "@tanstack/react-router";
import {
  EntryId,
  GroupId,
  PlayerId,
  type Entry,
  type GroupDetail,
  type Transfer,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";
import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { VoidEntryDialog } from "~/features/EntryDialogs";
import { GroupHeader } from "~/features/GroupHeader";
import { isAdmin, playerNames } from "~/features/group";
import { formatDay } from "~/lib/format";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/settle")({ component: SettleUp });

function SettleUp() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(detail) => <SettleUpView detail={detail} />}
    </Loaded>
  );
}

function SettleUpView({ detail }: { detail: GroupDetail }) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const [paying, setPaying] = useState<Transfer | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiding, setVoiding] = useState<Entry | null>(null);

  return (
    <>
      <GroupHeader
        detail={detail}
        current="settle"
        action={<Button onClick={() => setRecording(true)}>Record a payment</Button>}
      />

      <section className="flex flex-col gap-2">
        <SectionHeading>Suggested payments</SectionHeading>
        {detail.transfers.length === 0 ? (
          <EmptyState title="Everyone's square">
            Nobody owes anybody. Debts show up here when someone covers a buy-in or holds someone
            else's cash.
          </EmptyState>
        ) : (
          <>
            <Surface className="divide-y divide-line">
              {detail.transfers.map((transfer) => (
                <div
                  key={`${transfer.from}:${transfer.to}`}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{names.get(transfer.from)}</span>
                    <ArrowRight className="size-4 text-faint" aria-label="pays" />
                    <span className="font-medium">{names.get(transfer.to)}</span>
                  </span>
                  <Money
                    amount={transfer.amount}
                    currency={currency}
                    className="font-serif text-xl"
                  />
                  <Button size="sm" onClick={() => setPaying(transfer)}>
                    Mark paid
                  </Button>
                </div>
              ))}
            </Surface>
            <p className="text-sm text-muted">
              Payments that clear every balance. Pay however you like; Stacks only keeps the record.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Payments</SectionHeading>
        {detail.settlements.length === 0 ? (
          <p className="text-sm text-muted">Payments you record show up here.</p>
        ) : (
          <Surface className="divide-y divide-line">
            {detail.settlements.map((entry) => {
              const voided = entry.voidedAt !== null;
              return (
                <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-24 shrink-0 text-sm text-muted">
                    {formatDay(entry.occurredAt)}
                  </span>
                  <span className={voided ? "flex-1 text-faint line-through" : "flex-1"}>
                    {names.get(entry.playerId)} paid{" "}
                    {entry.counterpartyId ? names.get(entry.counterpartyId) : ""}{" "}
                    <Money amount={entry.amount} currency={currency} className="font-medium" />
                    {entry.note ? <span className="text-muted"> · {entry.note}</span> : null}
                  </span>
                  {!voided && (isAdmin(detail) || entry.playerId === detail.myPlayerId) ? (
                    <Menu label="Payment actions">
                      <MenuItem tone="danger" onClick={() => setVoiding(entry)}>
                        Void
                      </MenuItem>
                    </Menu>
                  ) : null}
                </div>
              );
            })}
          </Surface>
        )}
      </section>

      {paying ? (
        <RecordPaymentDialog
          key={`${paying.from}:${paying.to}`}
          detail={detail}
          transfer={paying}
          onClose={() => setPaying(null)}
        />
      ) : null}
      {recording ? (
        <RecordPaymentDialog detail={detail} transfer={null} onClose={() => setRecording(false)} />
      ) : null}
      <VoidEntryDialog entry={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

function RecordPaymentDialog({
  detail,
  transfer,
  onClose,
}: {
  detail: GroupDetail;
  transfer: Transfer | null;
  onClose: () => void;
}) {
  const stacks = useStacks();
  const record = useAction(stacks.Client.mutation("ledger", "recordSettlement"));
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = transfer?.from ?? PlayerId.make(String(form.get("from")));
    const to = transfer?.to ?? PlayerId.make(String(form.get("to")));
    const amount = transfer
      ? transfer.amount
      : Option.getOrNull(parseMoney(String(form.get("amount")), currency));
    if (from === to) return setProblem("Pick two different people.");
    if (amount === null || amount <= 0) return setProblem("Enter how much was paid.");
    setProblem(null);
    const note = String(form.get("note") ?? "").trim();
    const saved = await record.run({
      params: { groupId: detail.group.id },
      payload: {
        id: EntryId.make(newId()),
        fromPlayerId: from,
        toPlayerId: to,
        amount,
        note: note || null,
      },
    });
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={transfer ? "Mark as paid" : "Record a payment"}
      description={
        transfer ? (
          <>
            {names.get(transfer.from)} paid {names.get(transfer.to)}{" "}
            <Money amount={transfer.amount} currency={currency} />.
          </>
        ) : (
          "For money that changed hands outside a session."
        )
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {transfer ? null : (
          <>
            <Field label="Who paid">
              {(props) => (
                <Select {...props} name="from" defaultValue={detail.myPlayerId}>
                  {detail.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Paid to">
              {(props) => (
                <Select
                  {...props}
                  name="to"
                  defaultValue={detail.players.find((p) => p.id !== detail.myPlayerId)?.id}
                >
                  {detail.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Amount">
              {(props) => (
                <Input
                  {...props}
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                />
              )}
            </Field>
          </>
        )}
        <Field label="Note (optional)" hint="Like “Venmo” or “cash at the airport”.">
          {(props) => <Input {...props} name="note" maxLength={280} autoComplete="off" />}
        </Field>
        {(problem ?? record.error) ? <FormError>{problem ?? record.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={record.pending}>
          {record.pending ? "Saving…" : "Record payment"}
        </Button>
      </form>
    </Dialog>
  );
}

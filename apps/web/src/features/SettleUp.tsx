import {
  pairHistoryRows,
  pairStanding,
  pendingPayments,
  type PairHistoryRow,
} from "@stacks/client-runtime/playerMoney";
import { formatDay } from "@stacks/client-runtime/format";
import {
  usePaymentSync,
  usePlayerBalances,
  usePlayerPair,
  useRecordingSubmit,
} from "@stacks/client-runtime/recordingReact";
import { parseRecordingAmount, RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import type { EntryId, PlayerId, PlayerPair } from "@stacks/contracts";
import { CircleAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, RadioCards } from "~/components/ui/Field";
import { BackLink } from "~/components/ui/Nav";
import { EmptyState, Note, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowLink, RowText, Skeleton } from "~/components/ui/Surface";

const separate =
  "Between you and the people you've played with, outside any trip. A trip's own Settle up is in Groups.";

function Standing({ pair }: { pair: PlayerPair }) {
  const standing = pairStanding(pair);
  return standing.amount === null ? (
    <span className="text-sm text-muted">{standing.text}</span>
  ) : (
    <span className={standing.direction === "owed" ? "text-win" : "text-loss"}>
      <Money amount={standing.amount} currency={RECORDING_CURRENCY} className="font-semibold" />
    </span>
  );
}

/** Refused payments, each to record again or discard, and the payments still on this device. */
function PaymentStatus({ counterpartyId }: { counterpartyId?: PlayerId }) {
  const sync = usePaymentSync();
  return (
    <>
      <p role="status" className="text-sm text-muted">
        {sync.line.text}
      </p>
      {sync.rejected.map((item) => (
        <div
          key={item.operationId}
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2.5"
        >
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {item.sentence}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void sync.discard(item.operationId)}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void sync.recordAgain(item.operationId)}>
              Record again
            </Button>
          </div>
        </div>
      ))}
      {sync.error ? <p className="text-sm text-danger">{sync.error}</p> : null}
      {counterpartyId === undefined ? null : <Waiting counterpartyId={counterpartyId} />}
    </>
  );
}

function Waiting({ counterpartyId }: { counterpartyId: PlayerId }) {
  const { state } = usePlayerPair(counterpartyId);
  const waiting = pendingPayments(state, counterpartyId);
  if (waiting.length === 0) return null;
  return (
    <Section title="Waiting to sync">
      <List as="ul">
        {waiting.map((command) => (
          <li key={command.operationId}>
            <Row>
              <RowText
                title={
                  command.type === "repay"
                    ? "Payment"
                    : command.type === "correct_repayment"
                      ? "Correction"
                      : "Void"
                }
                meta="Saved on this device"
              />
              {command.type === "repay" ? (
                <Money amount={command.amount} currency={RECORDING_CURRENCY} />
              ) : command.type === "correct_repayment" ? (
                <Money amount={command.replacement.amount} currency={RECORDING_CURRENCY} />
              ) : null}
            </Row>
          </li>
        ))}
      </List>
    </Section>
  );
}

const back = <BackLink to="/">Your play</BackLink>;

/** Everyone you've shared a table with, and what's owed between you. */
export function SettleUpList() {
  const { balances, reload } = usePlayerBalances();
  return (
    <>
      <PageHeader back={back} title="Settle up">
        <Note>{separate}</Note>
      </PageHeader>
      <PaymentStatus />
      {balances === undefined ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : balances === null ? (
        <div className="flex flex-col items-start gap-3">
          <EmptyState title="Balances need a connection">
            They're worked out by Color Up from everyone's play. Payments you record still save on
            this device.
          </EmptyState>
          <Button onClick={reload}>Try again</Button>
        </div>
      ) : balances.pairs.length === 0 ? (
        <EmptyState title="No one to settle with yet">
          Once you've shared a table, the people there show up here.
        </EmptyState>
      ) : (
        <List as="ul" label="People">
          {balances.pairs.map((pair) => (
            <li key={`${pair.playerId}-${pair.counterparty.id}`}>
              <RowLink to="/you/settle/$playerId" params={{ playerId: pair.counterparty.id }}>
                <RowText title={pair.counterparty.displayName} meta={pairStanding(pair).text} />
                <Standing pair={pair} />
              </RowLink>
            </li>
          ))}
        </List>
      )}
    </>
  );
}

type Open =
  | { readonly type: "record" }
  | { readonly type: "correct" | "void"; readonly row: PairHistoryRow };

/** One person: what's owed, Record a payment, and every fact between you. */
export function SettleUpPerson({ playerId }: { playerId: PlayerId }) {
  const { history, state } = usePlayerPair(playerId);
  const [open, setOpen] = useState<Open | null>(null);
  const backToList = <BackLink to="/you/settle">Settle up</BackLink>;
  if (history === undefined)
    return (
      <>
        <PageHeader back={backToList} title="Settle up" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </>
    );
  const name = history?.pair.counterparty.displayName ?? "This player";
  const me = history?.pair.playerId ?? state?.self.id ?? null;
  const rows = history ? pairHistoryRows(history, state?.actor.id ?? null) : [];
  const local = new Set(state?.repayments.map((item) => item.id));
  return (
    <>
      <PageHeader back={backToList} title={name}>
        <Note>{separate}</Note>
      </PageHeader>
      {history ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface p-4 shadow-(--elevation-card)">
          <span className="font-medium">{pairStanding(history.pair).text}</span>
          <Standing pair={history.pair} />
        </div>
      ) : (
        <EmptyState title="Can't reach Color Up">
          The balance and history need a connection. A payment you record now saves on this device
          and syncs later.
        </EmptyState>
      )}
      {me ? (
        <Button
          variant="primary"
          size="lg"
          className="self-start"
          onClick={() => setOpen({ type: "record" })}
        >
          Record a payment
        </Button>
      ) : null}
      <PaymentStatus counterpartyId={playerId} />
      {history ? (
        <Section title="History">
          {rows.length === 0 ? (
            <Note>Nothing between you yet.</Note>
          ) : (
            <List as="ol" label="History, newest first">
              {rows.map((row) => (
                <li key={row.id}>
                  <Row className="flex-wrap">
                    <RowText
                      struck={row.voided !== null}
                      title={row.text}
                      meta={[
                        formatDay(row.occurredAt),
                        `Recorded by ${row.recordedBy}`,
                        row.correction ? "Correction" : null,
                        row.voided
                          ? `Voided by ${row.voided.by}${row.voided.reason ? `: ${row.voided.reason}` : ""}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                    <Money
                      amount={row.amount}
                      currency={RECORDING_CURRENCY}
                      className={row.voided ? "text-muted line-through" : "font-semibold"}
                    />
                    {row.kind === "payment" && row.voided === null && local.has(row.id) ? (
                      <span className="flex w-full justify-end gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setOpen({ type: "void", row })}
                        >
                          Void
                        </Button>
                        <Button size="sm" onClick={() => setOpen({ type: "correct", row })}>
                          Correct
                        </Button>
                      </span>
                    ) : null}
                  </Row>
                </li>
              ))}
            </List>
          )}
        </Section>
      ) : null}
      {open?.type === "record" && me ? (
        <RecordPayment me={me} other={playerId} name={name} onClose={() => setOpen(null)} />
      ) : open?.type === "correct" || open?.type === "void" ? (
        <FixPayment row={open.row} kind={open.type} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function PaymentDialog({
  title,
  description,
  submitLabel,
  danger = false,
  save,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  danger?: boolean;
  save: ReturnType<typeof useRecordingSubmit>;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.pending) onClose();
      }}
      title={title}
      {...(description ? { description } : {})}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        {save.error ? <FormError>{save.error} Try again.</FormError> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button size="lg" disabled={save.pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={danger ? "danger" : "primary"}
            size="lg"
            pending={save.pending}
          >
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TextField({
  label,
  value,
  error = null,
  onChange,
  amount = false,
}: {
  label: string;
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
  amount?: boolean;
}) {
  return (
    <Field label={label} error={error}>
      {(props) => (
        <Input
          {...props}
          value={value}
          autoComplete="off"
          maxLength={280}
          onChange={(event) => onChange(event.target.value)}
          {...(amount ? { inputMode: "decimal" as const, className: "text-2xl tabular-nums" } : {})}
        />
      )}
    </Field>
  );
}

function RecordPayment({
  me,
  other,
  name,
  onClose,
}: {
  me: PlayerId;
  other: PlayerId;
  name: string;
  onClose: () => void;
}) {
  const save = useRecordingSubmit();
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <PaymentDialog
      title="Record a payment"
      description="Color Up records it; it never moves money. Part of what's owed is fine."
      submitLabel="Record payment"
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const parsed = parseRecordingAmount(amount, 1);
        if (!("amount" in parsed)) return setAmountError(parsed.error);
        setAmountError(null);
        const receipt = await save.submit({
          type: "repay",
          fromPlayerId: direction === "out" ? me : other,
          toPlayerId: direction === "out" ? other : me,
          amount: parsed.amount,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        if (receipt) onClose();
      }}
    >
      <RadioCards
        label="Who paid"
        className="grid-cols-2"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "out", label: `You paid ${name}` },
          { value: "in", label: `${name} paid you` },
        ]}
      />
      <TextField label="Amount" value={amount} error={amountError} onChange={setAmount} amount />
      <TextField label="Note (optional)" value={note} onChange={setNote} />
    </PaymentDialog>
  );
}

function FixPayment({
  row,
  kind,
  onClose,
}: {
  row: PairHistoryRow;
  kind: "correct" | "void";
  onClose: () => void;
}) {
  const save = useRecordingSubmit();
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const repaymentId: EntryId = row.id;
  return (
    <PaymentDialog
      title={kind === "void" ? "Void payment" : "Correct payment"}
      description="The original stays in the history, with who changed it and why."
      submitLabel={kind === "void" ? "Void payment" : "Save correction"}
      danger={kind === "void"}
      save={save}
      onClose={onClose}
      onSubmit={async () => {
        const why = reason.trim();
        setReasonError(why ? null : "Say what was wrong with it.");
        const parsed = kind === "correct" ? parseRecordingAmount(amount, 1) : null;
        setAmountError(parsed && !("amount" in parsed) ? parsed.error : null);
        if (!why || (parsed !== null && !("amount" in parsed))) return;
        const receipt = await save.submit(
          parsed === null
            ? { type: "void_repayment", repaymentId, reason: why }
            : { type: "correct_repayment", repaymentId, reason: why, amount: parsed.amount },
        );
        if (receipt) onClose();
      }}
    >
      {kind === "correct" ? (
        <TextField
          label="Correct amount"
          value={amount}
          error={amountError}
          onChange={setAmount}
          amount
        />
      ) : null}
      <TextField label="What was wrong" value={reason} error={reasonError} onChange={setReason} />
    </PaymentDialog>
  );
}

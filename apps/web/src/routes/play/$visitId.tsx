import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDay, formatTime } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { useRecordingVisit } from "@stacks/client-runtime/recordingReact";
import {
  RECORDING_CURRENCY,
  visitTitle,
  type RecordingEvent,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";
import { VisitId, type EntryId, type PlayEntry } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useRef, useState } from "react";

import { Money } from "~/components/Money";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { BackLink } from "~/components/ui/Nav";
import { EmptyState, Note, PageHeader, Section } from "~/components/ui/Page";
import { Glow, List, Row, RowText, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { Dock, focusMain, PersonalFrame, SaveStatus, useDialogFocus } from "~/features/Personal";
import {
  CashOutDialog,
  CorrectDialog,
  RebuyDialog,
  ReopenDialog,
  StartDialog,
  VoidDialog,
} from "~/features/RecordingForms";

export const Route = createFileRoute("/play/$visitId")({ component: VisitPage });

function VisitPage() {
  const { visitId } = Route.useParams();
  const id = Option.getOrNull(VisitId.makeOption(visitId));
  return <PersonalFrame>{id ? <Visit visitId={id} /> : <Missing />}</PersonalFrame>;
}

const back = <BackLink to="/">Your play</BackLink>;

function Missing() {
  return (
    <>
      <PageHeader back={back} title="Session" />
      <EmptyState title="This session isn't on this device">
        Sessions are saved on the device they were recorded on.
      </EmptyState>
      <ButtonLink to="/" className="self-start">
        Back to your play
      </ButtonLink>
    </>
  );
}

type Open =
  | { readonly type: "rebuy" | "cash_out" | "reopen" | "start" }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId };

const money = (amount: number) => formatMoney(amount as PlayEntry["amount"], RECORDING_CURRENCY);

function Visit({ visitId }: { visitId: VisitId }) {
  const { visit, status, error, retryLoad } = useRecordingVisit(visitId);
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open | null>(null);
  const [saved, setSaved] = useState<{ entryId: EntryId; text: string } | null>(null);
  const savedButton = useRef<HTMLButtonElement>(null);
  const focus = useDialogFocus(() => savedButton.current);
  if (visit === null) return <Missing />;
  if (visit === undefined)
    return (
      <>
        <PageHeader back={back} title="Session">
          <SaveStatus status={status} error={error} onRetry={retryLoad} />
        </PageHeader>
        {status === "load_failed" ? null : <Skeleton className="h-40 w-full rounded-xl" />}
      </>
    );
  const live = visit.visit.finishedAt === null;
  const close = () => {
    setOpen(null);
    focus.restore();
  };
  const entry = (id: EntryId) => visit.entries.find((item) => item.id === id)!;
  const recorded = (entryId: EntryId, input: RecordingInput) => {
    close();
    setSaved({
      entryId,
      text:
        input.type === "finish"
          ? `Cash-out of ${money(input.amount)} recorded. You've finished this session.`
          : input.type === "correct"
            ? "Correction saved."
            : input.type === "add" && input.kind === "buy_in"
              ? `Rebuy of ${money(input.amount)} recorded.`
              : input.type === "add"
                ? `Cash-out of ${money(input.amount)} recorded. You're still playing.`
                : "Saved.",
    });
  };
  const start = visit.visit.startedAt;
  return (
    <div className="contents" onClickCapture={focus.capture}>
      <PageHeader
        back={back}
        title={visitTitle(visit.table)}
        tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Finished"}</Tag>}
        context={
          live
            ? `Started ${formatDay(start)}, ${formatTime(start)}`
            : `${formatDay(start)} · ${formatTime(start)} to ${formatTime(visit.visit.finishedAt!)}`
        }
      >
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      </PageHeader>
      <VisitHero visit={visit} />
      {saved ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-sunken py-2 pr-2 pl-4"
        >
          <p className="min-w-0 text-sm text-pretty">{saved.text}</p>
          <Button
            key={saved.entryId}
            ref={savedButton}
            size="sm"
            variant="ghost"
            onClick={() => setOpen({ type: "inspect", entryId: saved.entryId })}
          >
            View entry
          </Button>
        </div>
      ) : null}
      {live && visit.finalCashOut && visit.events.at(-1)?.type === "reopened" ? (
        <Surface className="flex flex-col gap-3 p-4">
          <Note>
            Reopened after an accidental finish. Your {money(visit.finalCashOut.amount)} final
            cash-out still counts. Correct or void it if it didn't happen.
          </Note>
          <Button
            className="self-start"
            onClick={() => setOpen({ type: "inspect", entryId: visit.finalCashOut!.id })}
          >
            Review cash-out
          </Button>
        </Surface>
      ) : null}
      <History visit={visit} onInspect={(entryId) => setOpen({ type: "inspect", entryId })} />
      <Dock>
        {live ? (
          <>
            <Button key="rebuy" size="lg" onClick={() => setOpen({ type: "rebuy" })}>
              Rebuy
            </Button>
            <Button
              key="cash-out"
              variant="primary"
              size="lg"
              onClick={() => setOpen({ type: "cash_out" })}
            >
              Cash out
            </Button>
          </>
        ) : (
          <>
            <Button
              key="start"
              variant="primary"
              size="lg"
              onClick={() => setOpen({ type: "start" })}
            >
              Start another session
            </Button>
            <Button
              key="reopen"
              variant="ghost"
              size="lg"
              onClick={() => setOpen({ type: "reopen" })}
            >
              Fix accidental finish
            </Button>
          </>
        )}
      </Dock>
      {open?.type === "rebuy" ? (
        <RebuyDialog visit={visit} onClose={close} onSaved={recorded} />
      ) : open?.type === "cash_out" ? (
        <CashOutDialog visit={visit} onClose={close} onSaved={recorded} />
      ) : open?.type === "reopen" ? (
        <ReopenDialog
          visit={visit}
          onClose={close}
          onReopened={() => {
            close();
            setSaved(null);
          }}
        />
      ) : open?.type === "start" ? (
        <StartDialog
          onClose={close}
          onStarted={(next) => {
            close();
            setSaved(null);
            void navigate({ to: "/play/$visitId", params: { visitId: next } }).then(focusMain);
          }}
        />
      ) : open?.type === "inspect" ? (
        <EntryInspector
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onShow={(entryId) => setOpen({ type: "inspect", entryId })}
          onCorrect={() => setOpen({ type: "correct", entryId: open.entryId })}
          onVoid={() => setOpen({ type: "void", entryId: open.entryId })}
        />
      ) : open?.type === "correct" ? (
        <CorrectDialog
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "void" ? (
        <VoidDialog
          visit={visit}
          entry={entry(open.entryId)}
          onClose={close}
          onVoided={() => {
            close();
            setSaved({ entryId: open.entryId, text: "Entry voided. It stays in the history." });
          }}
        />
      ) : null}
    </div>
  );
}

function VisitHero({ visit }: { visit: RecordingVisitView }) {
  const { totals, finalResult } = visit;
  const amounts = (
    <>
      In <Money amount={totals.buyIn} currency={RECORDING_CURRENCY} /> · Out{" "}
      <Money amount={totals.cashOut} currency={RECORDING_CURRENCY} />
    </>
  );
  if (finalResult === null)
    return (
      <Surface className="relative overflow-hidden p-4">
        <Glow tone="accent" />
        <dl className="relative grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-muted">Total in</dt>
            <dd>
              <Money
                amount={totals.buyIn}
                currency={RECORDING_CURRENCY}
                className="font-display text-5xl"
              />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm font-medium text-muted">Total out</dt>
            <dd>
              <Money
                amount={totals.cashOut}
                currency={RECORDING_CURRENCY}
                className="font-display text-5xl"
              />
            </dd>
          </div>
        </dl>
        <p className="relative mt-3 text-sm text-muted">
          Final result pending until you finish playing.
        </p>
      </Surface>
    );
  return (
    <Surface className="relative overflow-hidden p-4">
      <Glow tone={finalResult > 0 ? "win" : finalResult < 0 ? "loss" : "accent"} />
      <div className="relative flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Final result</p>
        <Money
          amount={finalResult}
          currency={RECORDING_CURRENCY}
          tone="result"
          className="font-display text-5xl sm:text-6xl"
        />
        <p className="text-sm text-muted">{amounts}</p>
      </div>
    </Surface>
  );
}

const entryName = (visit: RecordingVisitView, entry: PlayEntry) =>
  entry.kind === "buy_in"
    ? "Buy-in"
    : visit.finishCashOuts.has(entry.id)
      ? "Final cash-out"
      : "Cash-out";

const eventText = (event: RecordingEvent) =>
  event.type === "finished" ? "Finished playing" : `Reopened: ${event.reason}`;

type Line =
  | { readonly type: "entry"; readonly at: DateTime.Utc; readonly entry: PlayEntry }
  | { readonly type: "event"; readonly at: DateTime.Utc; readonly event: RecordingEvent };

function History({
  visit,
  onInspect,
}: {
  visit: RecordingVisitView;
  onInspect: (entryId: EntryId) => void;
}) {
  const lines: Line[] = [
    ...visit.entries.map((entry) => ({ type: "entry" as const, at: entry.occurredAt, entry })),
    ...visit.events.map((event) => ({ type: "event" as const, at: event.at, event })),
  ].toSorted((a, b) => DateTime.toEpochMillis(b.at) - DateTime.toEpochMillis(a.at));
  return (
    <Section
      title="History"
      aside={visit.entries.length === 1 ? "1 entry" : `${visit.entries.length} entries`}
    >
      <List as="ol" label="History, newest first">
        {lines.map((line) =>
          line.type === "event" ? (
            <li key={`${line.event.type}-${DateTime.toEpochMillis(line.at)}`}>
              <Row>
                <RowText
                  title={eventText(line.event)}
                  meta={
                    line.event.type === "reopened"
                      ? `${formatTime(line.at)} · Fixed an accidental finish`
                      : formatTime(line.at)
                  }
                />
              </Row>
            </li>
          ) : (
            <li key={line.entry.id}>
              <button
                type="button"
                onClick={() => onInspect(line.entry.id)}
                aria-label={`${entryName(visit, line.entry)}, ${money(line.entry.amount)}, ${formatTime(line.entry.occurredAt)}${line.entry.voidedAt ? ", voided" : ""}${line.entry.replacesEntryId ? ", correction" : ""}`}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-sunken active:bg-sunken focus-visible:outline-offset-[-2px]"
              >
                <RowText
                  struck={line.entry.voidedAt !== null}
                  title={entryName(visit, line.entry)}
                  meta={[
                    formatTime(line.entry.occurredAt),
                    line.entry.voidedAt ? "Voided" : null,
                    line.entry.replacesEntryId ? "Correction" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Money
                  amount={line.entry.amount}
                  currency={RECORDING_CURRENCY}
                  className={line.entry.voidedAt ? "text-muted line-through" : "font-semibold"}
                />
              </button>
            </li>
          ),
        )}
      </List>
    </Section>
  );
}

function EntryInspector({
  visit,
  entry,
  onClose,
  onShow,
  onCorrect,
  onVoid,
}: {
  visit: RecordingVisitView;
  entry: PlayEntry;
  onClose: () => void;
  onShow: (entryId: EntryId) => void;
  onCorrect: () => void;
  onVoid: () => void;
}) {
  const replacement = visit.replacedBy.get(entry.id);
  const at = (value: DateTime.Utc) => `${formatDay(value)}, ${formatTime(value)}`;
  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={entryName(visit, entry)}
      description={entry.voidedAt ? "Voided. It no longer counts toward this session." : undefined}
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted">Amount</dt>
          <dd>
            <Money
              amount={entry.amount}
              currency={RECORDING_CURRENCY}
              {...(entry.voidedAt ? { className: "line-through" } : {})}
            />
          </dd>
          <dt className="text-muted">Time</dt>
          <dd>{at(entry.occurredAt)}</dd>
          <dt className="text-muted">Recorded</dt>
          <dd>By you on this device, {at(entry.createdAt)}</dd>
          {entry.note ? (
            <>
              <dt className="text-muted">Note</dt>
              <dd className="wrap-anywhere">{entry.note}</dd>
            </>
          ) : null}
          {entry.voidedAt ? (
            <>
              <dt className="text-muted">Voided</dt>
              <dd className="wrap-anywhere">
                {at(entry.voidedAt)} · {entry.voidReason}
              </dd>
            </>
          ) : null}
          {entry.replacesEntryId ? (
            <>
              <dt className="text-muted">Corrects</dt>
              <dd>
                <Button size="sm" onClick={() => onShow(entry.replacesEntryId!)}>
                  View original
                </Button>
              </dd>
            </>
          ) : null}
          {replacement ? (
            <>
              <dt className="text-muted">Replaced by</dt>
              <dd>
                <Button size="sm" onClick={() => onShow(replacement)}>
                  View correction
                </Button>
              </dd>
            </>
          ) : null}
        </dl>
        {entry.voidedAt === null ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="danger" onClick={onVoid}>
              Void entry
            </Button>
            <Button onClick={onCorrect}>Correct amount</Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

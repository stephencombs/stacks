import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDay, formatDuration, formatTime, gameNames } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Money } from "~/components/Money";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink } from "~/components/ui/Nav";
import { EmptyState, PageHeader, Section } from "~/components/ui/Page";
import { Glow, List, Row, RowText, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { Dock, focusMain, PersonalFrame, SaveStatus, useDialogFocus } from "~/features/Personal";
import { recordingStore } from "~/lib/recording";
import {
  BuyInTotalDialog,
  CashOutDialog,
  CorrectDialog,
  GameDialog,
  type Counterparties,
  RebuyDialog,
  ReopenDialog,
  SitDownDialog,
  StartDialog,
  StartTimeDialog,
  VoidDialog,
} from "~/features/RecordingForms";
import { TableSection } from "~/features/SharedTable";

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
  | {
      readonly type:
        | "rebuy"
        | "cash_out"
        | "reopen"
        | "start"
        | "return"
        | "buy_in"
        | "start_time"
        | "game";
    }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId };

const money = (amount: number) => formatMoney(amount as PlayEntry["amount"], RECORDING_CURRENCY);

function Visit({ visitId }: { visitId: VisitId }) {
  const { visit, status, error, retryLoad } = useRecordingVisit(visitId);
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open | null>(null);
  const [saved, setSaved] = useState<{
    entryId: EntryId;
    text: string;
    undo?: boolean;
  } | null>(null);
  const quick = useRecordingSubmit();
  const savedButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const focus = useDialogFocus(() => savedButton.current);
  const table = useRecordingTable(visit?.visit.tableId ?? null);
  const serverTable = useServerTable(visit?.visit.tableId ?? null);
  const state = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot).state;
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
    setNotice(null);
    setSaved({
      entryId,
      text:
        input.type === "finish"
          ? `Cash-out of ${money(input.amount)} recorded. You've finished this session.`
          : input.type === "correct"
            ? "Correction saved."
            : input.type === "add" && input.kind === "buy_in"
              ? `Rebuy of ${money(input.amount)} recorded.`
              : "Saved.",
    });
  };
  const start = visit.visit.startedAt;
  const player = table?.visits.find((item) => item.visit.id === visitId);
  const own = player?.isSelf ?? true;
  const counterparties: Counterparties = {
    owner: own ? "Me" : (player?.player.displayName ?? "Their own"),
    people: counterpartiesAt(state, visit.visit.tableId, visit.visit.playerId, serverTable ?? null),
  };
  const names = new Map(counterparties.people.map((item) => [item.id, item.displayName]));
  // Back at the table: a new visit for whoever this was, once they aren't playing here.
  const canReturn =
    !live &&
    table !== undefined &&
    table !== null &&
    player !== undefined &&
    !table.visits.some(
      (item) => item.player.id === player.player.id && item.visit.finishedAt === null,
    );
  // Whoever records for everyone at the table changes its game; a player who joined it can't.
  const canEditTable = table?.role !== "participant";
  const rebuy = async (amount: number) => {
    const receipt = await quick.submit({
      type: "add",
      visitId,
      kind: "buy_in",
      amount,
    });
    if (receipt?.command.type === "add")
      setSaved({
        entryId: receipt.command.entryId,
        text: `Rebuy of ${money(amount)} recorded.`,
        undo: true,
      });
  };
  const undo = async (entryId: EntryId) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId,
      entryId,
      reason: "Undone",
      replacement: null,
    });
    if (receipt) setSaved({ entryId, text: "Rebuy undone. It stays in the history, voided." });
  };
  const edited = (text: string) => {
    close();
    setSaved(null);
    setNotice(text);
  };
  const seated = (next: VisitId) => {
    close();
    setSaved(null);
    void navigate({ to: "/play/$visitId", params: { visitId: next } }).then(focusMain);
  };
  return (
    <div className="contents" onClickCapture={focus.capture}>
      <PageHeader
        back={back}
        title={
          own
            ? visitTitle(visit.table)
            : `${player!.player.displayName} · ${visitTitle(visit.table)}`
        }
        tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Finished"}</Tag>}
        context={
          live
            ? `Started ${formatDay(start)}, ${formatTime(start)}`
            : `${formatDay(start)} · ${formatTime(start)} to ${formatTime(visit.visit.finishedAt!)}`
        }
      >
        <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visitId} />
      </PageHeader>
      {live ? (
        <LiveHero visit={visit} canEditTable={canEditTable} onEdit={(type) => setOpen({ type })} />
      ) : (
        <VisitHero visit={visit} />
      )}
      {live ? (
        <Section title="Rebuy">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Rebuy amounts">
            {visit.presets.map((preset) => (
              <Button
                key={preset}
                size="lg"
                disabled={quick.pending}
                className="min-w-24 flex-1 tabular-nums sm:flex-none"
                onClick={() => void rebuy(preset)}
              >
                + {money(preset)}
              </Button>
            ))}
            <Button
              size="lg"
              variant="ghost"
              className="flex-1 sm:flex-none"
              onClick={() => setOpen({ type: "rebuy" })}
            >
              Other amount
            </Button>
          </div>
          {quick.error ? <FormError>{quick.error}</FormError> : null}
        </Section>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-sunken px-4 py-2.5 text-sm">
          {notice}
        </p>
      ) : null}
      {saved ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-sunken py-2 pr-2 pl-4"
        >
          <p className="min-w-0 text-sm text-pretty">{saved.text}</p>
          <div className="flex shrink-0 gap-1">
            {saved.undo ? (
              <Button
                size="sm"
                variant="ghost"
                pending={quick.pending}
                onClick={() => void undo(saved.entryId)}
              >
                Undo
              </Button>
            ) : null}
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
        </div>
      ) : null}
      <TableSection
        tableId={visit.visit.tableId}
        visitId={visitId}
        onAdded={(next) => {
          setSaved(null);
          void navigate({ to: "/play/$visitId", params: { visitId: next } }).then(focusMain);
        }}
      />
      <History
        visit={visit}
        names={names}
        onInspect={(entryId) => setOpen({ type: "inspect", entryId })}
      />
      <Dock>
        {live ? (
          <Button
            key="cash-out"
            variant="primary"
            size="lg"
            onClick={() => setOpen({ type: "cash_out" })}
          >
            Cash out
          </Button>
        ) : !own || table?.role === "participant" ? (
          <>
            {canReturn ? (
              <Button
                key="return"
                variant="primary"
                size="lg"
                onClick={() => setOpen({ type: "return" })}
              >
                Back at the table
              </Button>
            ) : null}
            <Button
              key="reopen"
              variant={canReturn ? "ghost" : "secondary"}
              size="lg"
              onClick={() => setOpen({ type: "reopen" })}
            >
              Fix accidental finish
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
        <RebuyDialog
          visit={visit}
          counterparties={counterparties}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "cash_out" ? (
        <CashOutDialog
          visit={visit}
          counterparties={counterparties}
          onClose={close}
          onSaved={recorded}
        />
      ) : open?.type === "buy_in" ? (
        <BuyInTotalDialog visit={visit} onClose={close} onSaved={() => edited("Buy-in saved.")} />
      ) : open?.type === "start_time" ? (
        <StartTimeDialog
          visit={visit}
          onClose={close}
          onSaved={() => edited("Start time saved.")}
        />
      ) : open?.type === "game" ? (
        <GameDialog visit={visit} onClose={close} onSaved={() => edited("Game saved.")} />
      ) : open?.type === "reopen" ? (
        <ReopenDialog
          visit={visit}
          onClose={close}
          onReopened={() => {
            close();
            setSaved(null);
          }}
        />
      ) : open?.type === "return" && player ? (
        <SitDownDialog
          tableId={visit.visit.tableId}
          player={player.player}
          returning
          onClose={close}
          onSeated={seated}
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
          names={names}
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
          counterparties={counterparties}
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

/** Now, ticking once a minute, for a live session's clock. */
function useMinuteClock() {
  const [now, setNow] = useState(() => DateTime.nowUnsafe());
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** A live session at a glance: how long, how much in, what game, and a way to fix any of it. */
function LiveHero({
  visit,
  canEditTable,
  onEdit,
}: {
  visit: RecordingVisitView;
  canEditTable: boolean;
  onEdit: (field: "buy_in" | "start_time" | "game") => void;
}) {
  const now = useMinuteClock();
  const game = visit.table.game ? gameNames[visit.table.game] : null;
  return (
    <Surface className="relative overflow-hidden p-4">
      <Glow tone="accent" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <dl className="grid flex-1 grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-medium text-muted">Playing for</dt>
              <dd className="font-display text-5xl tabular-nums">
                {formatDuration(visit.visit.startedAt, now)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm font-medium text-muted">In</dt>
              <dd>
                <Money
                  amount={visit.totals.buyIn}
                  currency={RECORDING_CURRENCY}
                  className="font-display text-5xl"
                />
              </dd>
            </div>
          </dl>
          <Menu label="Edit session">
            <MenuItem onClick={() => onEdit("buy_in")}>Buy-in</MenuItem>
            <MenuItem onClick={() => onEdit("start_time")}>Start time</MenuItem>
            {canEditTable ? <MenuItem onClick={() => onEdit("game")}>Game</MenuItem> : null}
          </Menu>
        </div>
        <p className="text-sm text-muted">
          {[
            game ?? "Game not set",
            visit.table.highLimit ? "High limit" : null,
            `since ${formatTime(visit.visit.startedAt)}`,
            visit.totals.cashOut > 0 ? `${money(visit.totals.cashOut)} out` : null,
            "result pending",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Surface>
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

/** "Paid by Bea" or "Paid to Bea", when someone else's money was in the entry. */
const paidText = (entry: PlayEntry, names: ReadonlyMap<string, string>) =>
  entry.counterpartyId === null
    ? null
    : `${entry.kind === "buy_in" ? "Paid by" : "Paid to"} ${names.get(entry.counterpartyId) ?? "another player"}`;

function History({
  visit,
  names,
  onInspect,
}: {
  visit: RecordingVisitView;
  names: ReadonlyMap<string, string>;
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
                    paidText(line.entry, names),
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
  names,
  entry,
  onClose,
  onShow,
  onCorrect,
  onVoid,
}: {
  visit: RecordingVisitView;
  names: ReadonlyMap<string, string>;
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
          {entry.counterpartyId ? (
            <>
              <dt className="text-muted">{entry.kind === "buy_in" ? "Paid by" : "Paid to"}</dt>
              <dd>{names.get(entry.counterpartyId) ?? "Another player"}</dd>
            </>
          ) : null}
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

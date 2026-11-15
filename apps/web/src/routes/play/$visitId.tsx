import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDay, formatDuration, formatTime } from "@stacks/client-runtime/format";
import type { RecordingInput } from "@stacks/client-runtime/recording";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  useRecordingClock,
  useRecordingSubmit,
  useRecordingTable,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  LIVE_REBUY_AMOUNTS,
  sessionReadout,
  sessionEditFields,
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

import { ArrowLeft, Pencil, Users, List as ListIcon, ChevronRight } from "lucide-react";

import { Money } from "~/components/Money";
import { Button, ButtonLink, IconButton, IconLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { BackLink } from "~/components/ui/Nav";
import { EmptyState, PageHeader, Section } from "~/components/ui/Page";
import { List, Row, RowText, Skeleton, Surface } from "~/components/ui/Surface";
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
  StartTimeDialog,
  VenueDialog,
  VoidDialog,
} from "~/features/RecordingForms";
import { TableSection } from "~/features/SharedTable";

export const Route = createFileRoute("/play/$visitId")({ component: VisitPage });

function VisitPage() {
  const { visitId } = Route.useParams();
  const id = Option.getOrNull(VisitId.makeOption(visitId));
  return id ? (
    // Keyed so moving to another player's visit starts with no sheet open.
    <Visit key={id} visitId={id} />
  ) : (
    <PersonalFrame>
      <Missing />
    </PersonalFrame>
  );
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
        | "edit"
        | "table"
        | "history"
        | "rebuy"
        | "cash_out"
        | "reopen"
        | "return"
        | "buy_in"
        | "start_time"
        | "game"
        | "venue";
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
  useEffect(() => {
    if (visit)
      document.title = `${visit.visit.finishedAt === null ? "Live" : "Finished"} · Color Up`;
  }, [visit]);
  if (visit === null)
    return (
      <PersonalFrame>
        <Missing />
      </PersonalFrame>
    );
  if (visit === undefined)
    return (
      <PersonalFrame>
        <PageHeader back={back} title="Session">
          <SaveStatus status={status} error={error} onRetry={retryLoad} />
        </PageHeader>
        {status === "load_failed" ? null : <Skeleton className="h-40 w-full rounded-xl" />}
      </PersonalFrame>
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
      undo: input.type === "add" && input.kind === "buy_in",
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
  // Whoever records for everyone at the table changes its game and casino; a player who joined it
  // can't.
  const canEditTable = table?.role !== "participant";
  const rebuy = async (amount: number) => {
    const receipt = await quick.submit({
      type: "add",
      visitId,
      kind: "buy_in",
      amount,
    });
    if (receipt?.command.type === "add") {
      setNotice(null);
      setSaved({
        entryId: receipt.command.entryId,
        text: `Rebuy of ${money(amount)} recorded.`,
        undo: true,
      });
    }
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
    <PersonalFrame session felt={live} onClickCapture={focus.capture}>
      <header className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
        <IconLink to="/" aria-label="Back to your play">
          <ArrowLeft className="size-5" aria-hidden />
        </IconLink>
        {live ? (
          <LiveClock visit={visit} />
        ) : (
          <h1 className="text-center text-lg font-semibold">Finished</h1>
        )}
        {live && (table?.visits.length ?? 1) === 1 ? (
          <IconButton aria-label="Edit my session" onClick={() => setOpen({ type: "edit" })}>
            <Pencil className="size-5" aria-hidden />
          </IconButton>
        ) : (
          <div className="glass flex size-11 items-center justify-center rounded-full">
            <Menu label="Session actions">
              <MenuItem onClick={() => setOpen({ type: "edit" })}>
                <span className="flex items-center gap-3">
                  <Pencil className="size-4" aria-hidden />
                  Edit my session
                </span>
              </MenuItem>
              <MenuItem onClick={() => setOpen({ type: "table" })}>
                <span className="flex items-center gap-3">
                  <Users className="size-4" aria-hidden />
                  At this table
                </span>
              </MenuItem>
              <MenuItem onClick={() => setOpen({ type: "history" })}>
                <span className="flex items-center gap-3">
                  <ListIcon className="size-4" aria-hidden />
                  Your history
                </span>
              </MenuItem>
            </Menu>
          </div>
        )}
      </header>
      {live ? (
        <LiveHero visit={visit} name={own ? undefined : player?.player.displayName} />
      ) : (
        <>
          <PageHeader
            title={
              own
                ? visitTitle(visit.table)
                : `${player!.player.displayName} · ${visitTitle(visit.table)}`
            }
            context={[
              visit.venue?.name,
              formatDay(start),
              `${formatTime(start)}–${formatTime(visit.visit.finishedAt!)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <VisitHero visit={visit} />
          <TableSection tableId={visit.visit.tableId} visitId={visitId} onAdded={seated} />
          <History
            visit={visit}
            names={names}
            onInspect={(entryId) => setOpen({ type: "inspect", entryId })}
          />
        </>
      )}
      {live ? <div className="mt-auto h-52 shrink-0" aria-hidden /> : null}
      <div
        className={
          live
            ? "fixed inset-x-0 bottom-0 z-10 bg-felt px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "contents"
        }
      >
        <div className={live ? "mx-auto flex max-w-2xl flex-col gap-3 pt-3" : "contents"}>
          {notice ? (
            <p role="status" className="rounded-xl bg-fill px-4 py-2.5 text-sm text-ink">
              {notice}
            </p>
          ) : null}
          {saved ? (
            <div
              role="status"
              key={saved.entryId}
              className="flex items-center justify-between gap-3 rounded-xl bg-ink py-2 pr-2 pl-4 text-ink-inverse shadow-(--elevation-float) transition-[translate,opacity] duration-(--duration-toast-in) ease-enter starting:translate-y-2 starting:opacity-0"
            >
              <p className="min-w-0 text-sm text-pretty">{saved.text}</p>
              <div className="flex shrink-0 gap-1">
                {saved.undo ? (
                  <button
                    className="pressable min-h-11 rounded-lg px-3 text-sm font-semibold"
                    disabled={quick.pending}
                    onClick={() => void undo(saved.entryId)}
                  >
                    Undo
                  </button>
                ) : null}
                <button
                  ref={savedButton}
                  className="pressable min-h-11 rounded-lg px-3 text-sm font-semibold"
                  onClick={() => setOpen({ type: "inspect", entryId: saved.entryId })}
                >
                  View entry
                </button>
              </div>
            </div>
          ) : null}
          {quick.error ? <FormError>{quick.error}</FormError> : null}
          {live ? (
            <>
              <p className="text-sm font-medium text-felt-soft">Rebuy</p>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Rebuy amounts">
                {LIVE_REBUY_AMOUNTS.map((preset) => (
                  <Button
                    key={preset}
                    size="lg"
                    disabled={quick.pending}
                    onClick={() => void rebuy(preset)}
                  >
                    + {money(preset)}
                  </Button>
                ))}
                <Button
                  size="lg"
                  disabled={quick.pending}
                  onClick={() => setOpen({ type: "rebuy" })}
                >
                  Other
                </Button>
              </div>
              <Button
                variant="primary"
                size="lg"
                disabled={quick.pending}
                onClick={() => setOpen({ type: "cash_out" })}
              >
                Cash out
              </Button>
            </>
          ) : (
            <Dock>
              <Button variant="secondary" size="lg" onClick={() => setOpen({ type: "reopen" })}>
                Undo cash-out
              </Button>
              {canReturn ? (
                <Button variant="primary" size="lg" onClick={() => setOpen({ type: "return" })}>
                  Back at the table
                </Button>
              ) : null}
            </Dock>
          )}
        </div>
      </div>
      {open?.type === "edit" ? (
        <Dialog
          open
          title="Edit my session"
          onOpenChange={(value) => {
            if (!value) close();
          }}
          footer={<Button onClick={close}>Done</Button>}
        >
          <div className="flex flex-col gap-1">
            {sessionEditFields(visit, canEditTable).map(({ field: type, label, value }) => (
              <button
                key={type}
                className="pressable flex min-h-14 items-center justify-between gap-3 rounded-lg px-3 text-left hover:bg-fill"
                onClick={() => setOpen({ type })}
              >
                <span>{label}</span>
                <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
                  <span className="truncate">{value}</span>
                  <ChevronRight className="size-4 shrink-0" aria-hidden />
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setOpen({ type: "table" })}>
              At this table
            </Button>
            <Button variant="ghost" onClick={() => setOpen({ type: "history" })}>
              Your history
            </Button>
          </div>
        </Dialog>
      ) : open?.type === "table" ? (
        <Dialog
          open
          title="At this table"
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <TableSection tableId={visit.visit.tableId} visitId={visitId} onAdded={seated} />
        </Dialog>
      ) : open?.type === "history" ? (
        <Dialog
          open
          title="Your history"
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <History
            visit={visit}
            names={names}
            onInspect={(entryId) => setOpen({ type: "inspect", entryId })}
          />
        </Dialog>
      ) : null}
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
      ) : open?.type === "venue" ? (
        <VenueDialog visit={visit} onClose={close} onSaved={() => edited("Casino saved.")} />
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
    </PersonalFrame>
  );
}

function LiveClock({ visit }: { visit: RecordingVisitView }) {
  const now = useRecordingClock();
  return (
    <div className="glass mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink tabular-nums">
      <span className="size-2 rounded-full bg-live" aria-hidden />
      <span className="tracking-wide">LIVE</span>
      <span>{sessionReadout(visit, now).clock}</span>
    </div>
  );
}

function LiveHero({ visit, name }: { visit: RecordingVisitView; name?: string | undefined }) {
  const summary = sessionReadout(visit, visit.visit.startedAt);
  return (
    <section className="flex flex-col items-center gap-3 pt-[clamp(3rem,12dvh,8rem)] text-center">
      <h1 className="text-base font-medium text-felt-soft">
        {name ? `${name} · Bought in` : "Bought in"}
      </h1>
      <Money
        amount={visit.totals.buyIn}
        currency={RECORDING_CURRENCY}
        className="max-w-full font-display text-[clamp(3rem,16vw,6rem)] leading-none tracking-tight break-all"
      />
      <p className="mt-3 text-lg font-medium">
        {[visitTitle(visit.table), visit.venue?.name].filter(Boolean).join(" · ")}
      </p>
      <p className="text-sm text-felt-soft">
        Started {formatTime(visit.visit.startedAt)} ·{" "}
        {summary.corrected
          ? "buy-in corrected"
          : `${summary.buyIns} ${summary.buyIns === 1 ? "buy-in" : "buy-ins"}`}
      </p>
      <div className="mt-3 text-left">
        <SaveStatusForVisit visit={visit} felt />
      </div>
    </section>
  );
}

function SaveStatusForVisit({
  visit,
  felt = false,
}: {
  visit: RecordingVisitView;
  felt?: boolean;
}) {
  const { status, error, retryLoad } = useRecordingVisit(visit.visit.id);
  return (
    <div className={felt && status !== "save_failed" ? "[&>p]:text-felt-soft" : undefined}>
      <SaveStatus status={status} error={error} onRetry={retryLoad} visitId={visit.visit.id} />
    </div>
  );
}

function VisitHero({ visit }: { visit: RecordingVisitView }) {
  const summary = sessionReadout(visit, visit.visit.finishedAt!);
  return (
    <Surface className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Your result</p>
        <Money
          amount={visit.finalResult!}
          currency={RECORDING_CURRENCY}
          tone="result"
          className="font-display text-6xl"
        />
      </div>
      <dl className="grid grid-cols-2 gap-5">
        <div>
          <dt className="text-sm text-muted">Bought in</dt>
          <dd>
            <Money amount={visit.totals.buyIn} currency={RECORDING_CURRENCY} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Cashed out</dt>
          <dd>
            <Money amount={visit.totals.cashOut} currency={RECORDING_CURRENCY} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Duration</dt>
          <dd className="tabular-nums">
            {formatDuration(visit.visit.startedAt, visit.visit.finishedAt!)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Hourly result</dt>
          <dd>
            {summary.hourly === null ? (
              "—"
            ) : (
              <>
                <Money amount={summary.hourly} currency={RECORDING_CURRENCY} tone="result" />
                /hr
              </>
            )}
          </dd>
        </div>
      </dl>
      <SaveStatusForVisit visit={visit} />
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
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-fill active:bg-fill focus-visible:outline-offset-[-2px]"
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

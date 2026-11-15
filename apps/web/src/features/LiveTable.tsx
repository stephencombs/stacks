import { Link, useNavigate } from "@tanstack/react-router";
import { counterpartiesAt } from "@stacks/client-runtime/counterparties";
import {
  cashOutNote,
  type LiveTable,
  type TableAction,
  type TableSeat,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingClock,
  useRecordingSubmit,
  useRecordingVisit,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import {
  elapsedClock,
  LIVE_REBUY_AMOUNTS,
  RECORDING_CURRENCY,
  type RecordingTableView,
} from "@stacks/client-runtime/recordingView";
import {
  MinorUnits,
  PlayerIdentity,
  type EntryId,
  type TableId,
  type VisitId,
} from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type * as DateTime from "effect/DateTime";
import { ChevronRight, Pencil, Settings, Share2, Trash2, UserPlus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Money } from "~/components/Money";
import { Button, IconButton } from "~/components/ui/Button";
import { cn } from "~/components/ui/cn";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Menu, MenuItem } from "~/components/ui/Menu";
import { recordingStore } from "~/lib/recording";
import {
  AddPlayerDialog,
  CashOutDialog,
  RebuyDialog,
  ReopenDialog,
  SitDownDialog,
} from "./RecordingForms";
import { ShareDialog, TableSettingsDialog } from "./SharedTable";

const money = (amount: number) => formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY);

/** The LIVE pill, timing the table from its first visit. With nobody there yet, it has no time. */
export function LiveClock({ since }: { since: DateTime.Utc | null }) {
  const now = useRecordingClock();
  return (
    <div className="glass mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink tabular-nums">
      <span className="size-2 rounded-full bg-live" aria-hidden />
      <span className="tracking-wide">LIVE</span>
      {since ? <span>{elapsedClock(since, now)}</span> : null}
    </div>
  );
}

/** What a write from the table did, for the page's toast. */
export type TableRecorded = {
  readonly visitId: VisitId;
  readonly entryId?: EntryId;
  readonly text: string;
  /** A rebuy, which the toast can undo. */
  readonly undo?: boolean;
};

/**
 * Everyone at the table on the felt, under your own session: who's playing first, then who cashed
 * out, faded. A row opens that player's sheet when this device records for them, and your own
 * opens your session when it isn't the one on screen.
 */
export function TableSeats({
  table,
  current,
  felt = true,
  count = true,
  onSeat,
}: {
  table: LiveTable;
  current?: VisitId;
  /** Says how many are playing, unless the page already does. */
  count?: boolean;
  /** On the felt while the table is live; plain once it closed. */
  felt?: boolean;
  onSeat: (seat: TableSeat) => void;
}) {
  if (table.seats.length === 0) return null;
  const soft = felt ? "text-felt-soft" : "text-muted";
  return (
    <section aria-labelledby="table-seats" className="flex flex-col gap-2">
      <h2 id="table-seats" className={cn("flex justify-between text-sm font-medium", soft)}>
        <span>At this table</span>
        {count ? (
          <span>{table.playing === 1 ? "1 playing" : `${table.playing} playing`}</span>
        ) : null}
      </h2>
      <ul
        className={cn(
          "divide-y overflow-hidden rounded-xl",
          felt ? "divide-felt-ink/10 bg-felt-deep" : "divide-line bg-surface",
        )}
      >
        {table.seats.map((seat) => {
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{seat.name}</span>
                <span className={cn("text-sm", soft)}>{seat.status}</span>
              </span>
              <Money
                amount={seat.amount}
                currency={RECORDING_CURRENCY}
                tone={seat.playing ? "plain" : "result"}
                className={cn("font-semibold", felt && "text-felt-ink")}
              />
            </>
          );
          const row = cn(
            "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left",
            !seat.playing && "opacity-60",
          );
          const pressable = cn(
            row,
            "pressable transition-colors duration-150 focus-visible:outline-offset-[-2px]",
            felt ? "hover:bg-felt-ink/5" : "hover:bg-fill",
          );
          return (
            <li key={seat.visitId}>
              {seat.isSelf && seat.visitId !== current ? (
                <Link
                  to="/play/$visitId"
                  params={{ visitId: seat.visitId }}
                  aria-label={`Your session, ${seat.status}`}
                  className={pressable}
                >
                  {body}
                  <ChevronRight className={cn("size-4 shrink-0", soft)} aria-hidden />
                </Link>
              ) : seat.recordable ? (
                <button
                  type="button"
                  className={pressable}
                  aria-label={`${seat.name}, ${seat.status}`}
                  onClick={() => onSeat(seat)}
                >
                  {body}
                  <ChevronRight className={cn("size-4 shrink-0", soft)} aria-hidden />
                </button>
              ) : (
                <div
                  className={row}
                  {...(seat.visitId === current ? { "aria-current": "page" as const } : {})}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const actionLabels: Record<TableAction, string> = {
  edit: "Edit my session",
  add_player: "Add player",
  share: "Share table",
  settings: "Table settings",
  delete_table: "Delete table",
};
const actionIcons: Record<TableAction, typeof Pencil> = {
  edit: Pencil,
  add_player: UserPlus,
  share: Share2,
  settings: Settings,
  delete_table: Trash2,
};

/** The top-right slot: nothing, the one thing you can do, or a menu of several. */
export function ActionSlot({
  actions,
  onAction,
}: {
  actions: ReadonlyArray<TableAction>;
  onAction: (action: TableAction) => void;
}) {
  const [only] = actions;
  if (!only) return <div className="size-11" aria-hidden />;
  if (actions.length === 1) {
    const Icon = actionIcons[only];
    return (
      <IconButton aria-label={actionLabels[only]} onClick={() => onAction(only)}>
        <Icon className="size-5" aria-hidden />
      </IconButton>
    );
  }
  return (
    <div className="glass flex size-11 items-center justify-center rounded-full">
      <Menu label="Table actions">
        {actions.map((action) => {
          const Icon = actionIcons[action];
          return (
            <MenuItem key={action} onClick={() => onAction(action)}>
              <span
                className={cn("flex items-center gap-3", action === "delete_table" && "text-loss")}
              >
                <Icon className="size-4" aria-hidden />
                {actionLabels[action]}
              </span>
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
}

/** The table's own dialogs behind the action slot: everything but editing your session. */
export function TableActionDialog({
  action,
  table,
  onClose,
  onAdded,
}: {
  action: Exclude<TableAction, "edit">;
  table: RecordingTableView;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const tableId = table.table.id;
  switch (action) {
    case "add_player":
      return (
        <AddPlayerDialog
          tableId={tableId}
          saved={table.addable}
          onClose={onClose}
          onAdded={(_, name) => onAdded(name)}
        />
      );
    case "share":
      return <ShareDialog tableId={tableId} onClose={onClose} />;
    case "settings":
      return <TableSettingsDialog tableId={tableId} onClose={onClose} />;
    case "delete_table":
      return <DeleteTableDialog tableId={tableId} onClose={onClose} />;
  }
}

function DeleteTableDialog({ tableId, onClose }: { tableId: TableId; onClose: () => void }) {
  const save = useRecordingSubmit();
  const navigate = useNavigate();
  return (
    <Dialog
      open
      onOpenChange={(next) => (next || save.pending ? undefined : onClose())}
      title="Delete this table?"
      description="Nobody has played here, so no play is lost. Its link stops working."
      footer={
        <div className="flex flex-col gap-3">
          {save.error ? <FormError>{save.error}</FormError> : null}
          <div className="flex gap-2">
            <Button size="lg" disabled={save.pending} onClick={onClose}>
              Keep table
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              pending={save.pending}
              onClick={async () => {
                if (await save.submit({ type: "delete_table", tableId }))
                  void navigate({ to: "/" });
              }}
            >
              Delete table
            </Button>
          </div>
        </div>
      }
    >
      {null}
    </Dialog>
  );
}

type SeatStep = "menu" | "rebuy" | "cash_out" | "reopen" | "return";

/**
 * Another player's sheet, for whoever records for everyone here: a rebuy or cash-out while they
 * play, or, once they've cashed out, undoing it or sitting them back down.
 */
export function SeatSheet({
  seat,
  table,
  onClose,
  onRecorded,
  onSeated,
}: {
  seat: TableSeat;
  table: LiveTable;
  onClose: () => void;
  onRecorded: (recorded: TableRecorded) => void;
  onSeated: (visitId: VisitId, name: string) => void;
}) {
  const { visit } = useRecordingVisit(seat.visitId);
  const state = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot).state;
  const server = useServerTable(visit?.visit.tableId ?? null);
  const quick = useRecordingSubmit();
  const [step, setStep] = useState<SeatStep>("menu");
  if (!visit) return null;
  const counterparties = {
    owner: seat.name,
    people: counterpartiesAt(state, visit.visit.tableId, seat.playerId, server ?? null),
  };
  const back = () => setStep("menu");
  if (step === "rebuy")
    return (
      <RebuyDialog
        visit={visit}
        who={seat.name}
        counterparties={counterparties}
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            undo: true,
            text: `Rebuy of ${money(input.type === "add" ? input.amount : 0)} for ${seat.name} recorded.`,
          })
        }
      />
    );
  if (step === "cash_out")
    return (
      <CashOutDialog
        visit={visit}
        who={seat.name}
        note={cashOutNote(table.seats, seat.visitId)}
        counterparties={counterparties}
        onClose={back}
        onSaved={(entryId, input) =>
          onRecorded({
            visitId: seat.visitId,
            entryId,
            text: `${seat.name} cashed out ${money(input.type === "finish" ? input.amount : 0)}.`,
          })
        }
      />
    );
  if (step === "reopen")
    return (
      <ReopenDialog
        visit={visit}
        onClose={back}
        onReopened={() =>
          onRecorded({ visitId: seat.visitId, text: `${seat.name} is playing again.` })
        }
      />
    );
  if (step === "return")
    return (
      <SitDownDialog
        tableId={visit.visit.tableId}
        player={PlayerIdentity.make({ id: seat.playerId, displayName: seat.name })}
        returning
        onClose={back}
        onSeated={(next) => onSeated(next, seat.name)}
      />
    );
  const rebuy = async (amount: number) => {
    const receipt = await quick.submit({
      type: "add",
      visitId: seat.visitId,
      kind: "buy_in",
      amount,
    });
    if (receipt?.command.type === "add")
      onRecorded({
        visitId: seat.visitId,
        entryId: receipt.command.entryId,
        undo: true,
        text: `Rebuy of ${money(amount)} for ${seat.name} recorded.`,
      });
  };
  const playingAgain = table.seats.some(
    (item) => item.playerId === seat.playerId && item.playing && item.visitId !== seat.visitId,
  );
  return (
    <Dialog
      open
      onOpenChange={(next) => (next || quick.pending ? undefined : onClose())}
      title={seat.name}
      description={seat.status}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface p-4">
          <span className="text-sm text-muted">{seat.playing ? "Bought in" : "Result"}</span>
          <Money
            amount={seat.amount}
            currency={RECORDING_CURRENCY}
            tone={seat.playing ? "plain" : "result"}
            className="text-2xl font-semibold"
          />
        </div>
        {seat.playing ? (
          <>
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label={`Rebuy for ${seat.name}`}
            >
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
              <Button size="lg" disabled={quick.pending} onClick={() => setStep("rebuy")}>
                Other
              </Button>
            </div>
            <Button
              variant="primary"
              size="lg"
              disabled={quick.pending}
              onClick={() => setStep("cash_out")}
            >
              Cash out {seat.name}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="sm:flex-1" onClick={() => setStep("reopen")}>
              Undo cash-out
            </Button>
            {playingAgain ? null : (
              <Button
                variant="primary"
                size="lg"
                className="sm:flex-1"
                onClick={() => setStep("return")}
              >
                Back at the table
              </Button>
            )}
          </div>
        )}
        {quick.error ? <FormError>{quick.error}</FormError> : null}
        <Link
          to="/play/$visitId"
          params={{ visitId: seat.visitId }}
          className="self-center py-2 text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {seat.name}'s history
        </Link>
      </div>
    </Dialog>
  );
}

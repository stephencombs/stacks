import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  liveTable,
  tableActions,
  type TableAction,
  type TableSeat,
} from "@stacks/client-runtime/liveTable";
import {
  useRecordingSubmit,
  useRecordingTable,
  useServerTable,
} from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY, tableTitle } from "@stacks/client-runtime/recordingView";
import { TableId, type EntryId, type VisitId } from "@stacks/contracts";
import * as Option from "effect/Option";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Money } from "~/components/Money";
import { Button, ButtonLink, IconLink } from "~/components/ui/Button";
import { FormError } from "~/components/ui/Field";
import { EmptyState, PageHeader } from "~/components/ui/Page";
import { LiveSessionsBar, useLiveSessions } from "~/features/LiveBar";
import {
  ActionSlot,
  LiveClock,
  SeatSheet,
  TableActionDialog,
  TableSeats,
  type TableRecorded,
} from "~/features/LiveTable";
import { focusMain, PersonalFrame } from "~/features/Personal";
import { SitDownDialog } from "~/features/RecordingForms";
import { recordingStore } from "~/lib/recording";

export const Route = createFileRoute("/tables/$tableId")({ component: TablePage });

function TablePage() {
  const { tableId } = Route.useParams();
  const id = Option.getOrNull(TableId.makeOption(tableId));
  return id ? <Table key={id} tableId={id} /> : <Missing />;
}

function Missing() {
  return (
    <PersonalFrame>
      <PageHeader title="Table" />
      <EmptyState title="This table isn't on this device">
        Tables are saved on the devices that record them.
      </EmptyState>
      <ButtonLink to="/" className="self-start">
        Back to your play
      </ButtonLink>
    </PersonalFrame>
  );
}

type Open =
  | { readonly type: "sit" }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit"> }
  | { readonly type: "seat"; readonly seat: TableSeat };

/**
 * A table you record at without a visit in play: one you opened without playing, or one you cashed
 * out of while others play. What's in play leads, then everyone at the table.
 */
function Table({ tableId }: { tableId: TableId }) {
  const table = useRecordingTable(tableId);
  const server = useServerTable(tableId);
  const loaded = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot).state;
  const navigate = useNavigate();
  const quick = useRecordingSubmit();
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<(TableRecorded & { entryId: EntryId }) | null>(null);
  const live = useLiveSessions(tableId);
  useEffect(() => {
    document.title = "Table · Color Up";
  }, []);
  if (loaded === null) return <PersonalFrame session>{null}</PersonalFrame>;
  if (!table) return <Missing />;
  const view = liveTable(table, server);
  const close = () => setOpen(null);
  const seated = (visitId: VisitId) => {
    close();
    void navigate({ to: "/play/$visitId", params: { visitId } }).then(focusMain);
  };
  const recorded = ({ entryId, ...rest }: TableRecorded) => {
    close();
    if (entryId) setSaved({ entryId, ...rest });
    else {
      setSaved(null);
      setNotice(rest.text);
    }
  };
  const undo = async ({ entryId, visitId }: { entryId: EntryId; visitId: VisitId }) => {
    const receipt = await quick.submit({
      type: "correct",
      visitId,
      entryId,
      reason: "Undone",
      replacement: null,
    });
    if (receipt) {
      setSaved(null);
      setNotice("Rebuy undone. It stays in the history, voided.");
    }
  };
  const actions = tableActions(table.role, {
    playing: false,
    closed: view.closed,
    empty: view.seats.length === 0,
  });
  const played = table.visits.some((item) => item.isSelf);
  const venue = loaded.venues.find((item) => item.id === table.table.venueId);
  const title = [tableTitle(table.table), venue?.name].filter(Boolean).join(" · ");
  return (
    <PersonalFrame session felt={!view.closed}>
      <header className="grid grid-cols-[44px_1fr_44px] items-center gap-3">
        <IconLink to="/" aria-label="Back to your play">
          <ArrowLeft className="size-5" aria-hidden />
        </IconLink>
        {view.closed ? (
          <h1 className="text-center text-lg font-semibold">Finished</h1>
        ) : (
          <LiveClock since={view.startedAt} />
        )}
        <ActionSlot
          actions={actions}
          onAction={(action) =>
            action === "edit" ? undefined : setOpen({ type: "action", action })
          }
        />
      </header>
      <section className="flex flex-col items-center gap-3 pt-[clamp(2rem,8dvh,6rem)] text-center">
        <h1
          className={
            view.closed
              ? "text-base font-medium text-muted"
              : "text-base font-medium text-felt-soft"
          }
        >
          In play at the table
        </h1>
        <Money
          amount={view.inPlay}
          currency={RECORDING_CURRENCY}
          className="max-w-full font-display text-[clamp(3rem,16vw,6rem)] leading-none tracking-tight break-all"
        />
        <p className="mt-3 text-lg font-medium">{title}</p>
        <p className={view.closed ? "text-sm text-muted" : "text-sm text-felt-soft"}>
          {view.seats.length === 0
            ? "Nobody's playing yet"
            : view.closed
              ? "Everyone has cashed out"
              : `${view.playing} playing`}
        </p>
      </section>
      {view.seats.length === 0 ? (
        <p className="rounded-xl bg-felt-deep px-4 py-3 text-sm text-felt-soft">
          {table.role === "participant"
            ? "Nobody has bought in here yet."
            : "Add the players here from the menu, or share the table so they record their own."}
        </p>
      ) : (
        <TableSeats
          table={view}
          felt={!view.closed}
          count={false}
          onSeat={(seat) => setOpen({ type: "seat", seat })}
        />
      )}
      <div className="mt-auto h-40 shrink-0" aria-hidden />
      <div
        className={
          view.closed
            ? "fixed inset-x-0 bottom-0 z-10 bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "fixed inset-x-0 bottom-0 z-10 bg-felt px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3 pt-3">
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
                    onClick={() => void undo(saved)}
                  >
                    Undo
                  </button>
                ) : null}
                <button
                  className="pressable min-h-11 rounded-lg px-3 text-sm font-semibold"
                  onClick={() => setSaved(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {quick.error ? <FormError>{quick.error}</FormError> : null}
          {live.length > 0 ? <LiveSessionsBar live={live} /> : null}
          {table.you.playing ? (
            <ButtonLink
              variant="primary"
              size="lg"
              to="/play/$visitId"
              params={{ visitId: table.you.playing }}
            >
              Back to your session
            </ButtonLink>
          ) : view.closed ? null : (
            <Button variant="primary" size="lg" onClick={() => setOpen({ type: "sit" })}>
              Sit down and play
            </Button>
          )}
        </div>
      </div>
      {open?.type === "sit" ? (
        <SitDownDialog
          tableId={tableId}
          player={table.you.player}
          returning={played}
          onClose={close}
          onSeated={seated}
        />
      ) : open?.type === "action" ? (
        <TableActionDialog
          action={open.action}
          table={table}
          onClose={close}
          onAdded={(name) => {
            close();
            setSaved(null);
            setNotice(`${name} is at the table.`);
          }}
        />
      ) : open?.type === "seat" ? (
        <SeatSheet
          seat={open.seat}
          table={view}
          onClose={close}
          onRecorded={recorded}
          onSeated={(_, name) =>
            recorded({ visitId: open.seat.visitId, text: `${name} is back at the table.` })
          }
        />
      ) : null}
    </PersonalFrame>
  );
}

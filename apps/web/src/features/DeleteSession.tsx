import { formatDay, formatTime } from "@stacks/client-runtime/format";
import {
  RECORDING_CURRENCY,
  visitTitle,
  type RecordingVisitView,
} from "@stacks/client-runtime/recordingView";

import { Money } from "~/components/Money";
import { Button, ButtonLink } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";

export function DeleteSessionDialog({
  visit,
  pending,
  error,
  onClose,
  onDelete,
}: {
  visit: RecordingVisitView;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  return (
    <Dialog
      open
      title="Delete this session?"
      description="Your entries will be voided and this session will stop counting. Other players at the table keep their sessions. You can restore yours later."
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Keep session
          </Button>
          <Button variant="danger" pending={pending} onClick={() => void onDelete()}>
            Delete session
          </Button>
        </div>
      }
    >
      <p className="font-medium">{visitTitle(visit.table)}</p>
      <p className="text-sm text-muted">
        {visit.venue?.name ?? "No casino set"} · {formatDay(visit.visit.startedAt)},{" "}
        {formatTime(visit.visit.startedAt)}
      </p>
      <p className="mt-3">
        Buy-in <Money amount={visit.totals.buyIn} currency={RECORDING_CURRENCY} />
      </p>
      {error ? <FormError>{error}</FormError> : null}
    </Dialog>
  );
}

export function DeletedSession({
  canRestore,
  undo,
  pending,
  onRestore,
  onDismiss,
}: {
  canRestore: boolean;
  undo: boolean;
  pending: boolean;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <p className="text-muted">
        This session no longer counts. You can restore it from All sessions.
      </p>
      <div className="flex gap-2">
        <ButtonLink to="/history">All sessions</ButtonLink>
        {canRestore ? (
          <Button variant="secondary" pending={pending} onClick={onRestore}>
            Restore
          </Button>
        ) : null}
      </div>
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 px-4 pb-2 lg:bottom-0 lg:pr-10 lg:pb-6 lg:pl-70"
      >
        {canRestore && undo ? (
          <div className="pointer-events-auto mx-auto flex min-h-14 w-full max-w-[40rem] items-center gap-3 rounded-xl bg-surface py-2 pr-2 pl-4 shadow-(--elevation-float)">
            <span className="min-w-0 flex-1 font-medium">Session deleted</span>
            <Button variant="ghost" pending={pending} onClick={onRestore}>
              Undo
            </Button>
            <Button variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

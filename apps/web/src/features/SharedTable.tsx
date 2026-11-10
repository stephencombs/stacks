import { formatTime } from "@stacks/client-runtime/format";
import {
  useRecordingTable,
  useServerTable,
  useTableSharing,
} from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import type { TableId, VisitId } from "@stacks/contracts";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { CopyButton } from "~/components/CopyButton";
import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { FormError } from "~/components/ui/Field";
import { Note, Section } from "~/components/ui/Page";
import { List, Row, RowLink, RowText, Tag } from "~/components/ui/Surface";
import { useAccount } from "~/lib/account";

import { AddPlayerDialog } from "./RecordingForms";

/**
 * Everyone recorded at this visit's table, each linking to their own visit. Whoever started the
 * table records for all of them, and shares it.
 */
export function TableSection({
  tableId,
  visitId,
  onAdded,
}: {
  tableId: TableId;
  visitId: VisitId;
  onAdded: (visitId: VisitId) => void;
}) {
  const table = useRecordingTable(tableId);
  const account = useAccount();
  const [open, setOpen] = useState<"add" | "share" | null>(null);
  if (!table) return null;
  if (table.role === "participant")
    return <JoinedTableSection tableId={tableId} visitId={visitId} />;
  const others = table.visits.some((item) => !item.isSelf);
  const signedOut = account.available && account.isLoaded && !account.isSignedIn;
  return (
    <Section
      title="At this table"
      aside={table.visits.length === 1 ? "1 player" : `${table.visits.length} players`}
    >
      <List as="ul" label="Players at this table">
        {table.visits.map((item) => (
          <li key={item.visit.id}>
            <RowLink
              to="/play/$visitId"
              params={{ visitId: item.visit.id }}
              {...(item.visit.id === visitId ? { "aria-current": "page" as const } : {})}
            >
              <RowText
                title={item.isSelf ? "You" : item.player.displayName}
                meta={
                  item.finalResult === null
                    ? `Playing since ${formatTime(item.visit.startedAt)}`
                    : `Finished ${formatTime(item.visit.finishedAt!)}`
                }
              />
              {item.finalResult === null ? (
                <span className="flex items-center gap-2 text-sm text-muted">
                  In <Money amount={item.totals.buyIn} currency={RECORDING_CURRENCY} />
                  <Tag tone="live">Live</Tag>
                </span>
              ) : (
                <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
              )}
            </RowLink>
          </li>
        ))}
      </List>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen("add")}>Add player</Button>
        <Button variant="ghost" onClick={() => setOpen("share")}>
          Share
        </Button>
      </div>
      {signedOut && others ? (
        <Note>
          This table is on this device and syncs from it.{" "}
          <Link to="/" className="font-medium text-accent-text underline">
            Sign in to keep this table
          </Link>{" "}
          if you lose the device.
        </Note>
      ) : null}
      {open === "add" ? (
        <AddPlayerDialog
          tableId={tableId}
          saved={table.addable}
          onClose={() => setOpen(null)}
          onAdded={(next) => {
            setOpen(null);
            onAdded(next);
          }}
        />
      ) : open === "share" ? (
        <ShareDialog tableId={tableId} onClose={() => setOpen(null)} />
      ) : null}
    </Section>
  );
}

/**
 * A table this device joined. Its own visits are here; everyone else's come from the server, so
 * they show only online, and only to read: a participant records just their own play.
 */
function JoinedTableSection({ tableId, visitId }: { tableId: TableId; visitId: VisitId }) {
  const table = useRecordingTable(tableId)!;
  const server = useServerTable(tableId);
  const names = new Map(server?.players.map((player) => [player.id, player.displayName]));
  const others = (server?.visits ?? []).filter(
    (item) => item.visit.playerId !== table.you.player.id,
  );
  const count = table.visits.length + others.length;
  return (
    <Section title="At this table" aside={count === 1 ? "1 player" : `${count} players`}>
      <List as="ul" label="Players at this table">
        {table.visits.map((item) => (
          <li key={item.visit.id}>
            <RowLink
              to="/play/$visitId"
              params={{ visitId: item.visit.id }}
              {...(item.visit.id === visitId ? { "aria-current": "page" as const } : {})}
            >
              <RowText
                title="You"
                meta={
                  item.finalResult === null
                    ? `Playing since ${formatTime(item.visit.startedAt)}`
                    : `Finished ${formatTime(item.visit.finishedAt!)}`
                }
              />
              {item.finalResult === null ? (
                <Tag tone="live">Live</Tag>
              ) : (
                <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
              )}
            </RowLink>
          </li>
        ))}
        {others.map((item) => (
          <li key={item.visit.id}>
            <Row>
              <RowText
                title={names.get(item.visit.playerId) ?? "Player"}
                meta={
                  item.finalResult === null
                    ? `Playing since ${formatTime(item.visit.startedAt)}`
                    : `Finished ${formatTime(item.visit.finishedAt!)}`
                }
              />
              {item.finalResult === null ? (
                <Tag tone="live">Live</Tag>
              ) : (
                <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
              )}
            </Row>
          </li>
        ))}
      </List>
      {server === null ? (
        <Note>The others at this table show when Color Up can be reached.</Note>
      ) : (
        <Note>You record your own play here. Whoever started the table records for everyone.</Note>
      )}
    </Section>
  );
}

/** Creates, copies and revokes the table's read-only link. Only the starter sees this. */
function ShareDialog({ tableId, onClose }: { tableId: TableId; onClose: () => void }) {
  const sharing = useTableSharing(tableId);
  const url = sharing.token ? `${location.origin}/t/${sharing.token}` : null;
  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Share this table"
      description="Anyone with the link can see everyone's buy-ins, cash-outs and results here. They can't change anything, and they don't need an account."
    >
      <div className="flex flex-col gap-4">
        {!sharing.ready ? (
          <>
            <Note>This table has to sync before it can be shared.</Note>
            <Button variant="primary" size="lg" onClick={() => void sharing.prepare()}>
              Sync this table
            </Button>
          </>
        ) : url ? (
          <>
            <p className="rounded-lg bg-sunken px-3 py-2 font-mono text-sm wrap-anywhere">{url}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={url} />
              <Button
                size="sm"
                variant="danger"
                pending={sharing.pending}
                onClick={() => void sharing.revoke()}
              >
                Stop sharing
              </Button>
            </div>
            <Note>A new link stops this one working.</Note>
          </>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="danger"
              pending={sharing.pending}
              onClick={() => void sharing.revoke()}
            >
              Stop sharing
            </Button>
            <Button
              variant="primary"
              pending={sharing.pending}
              onClick={() => void sharing.share()}
            >
              Create link
            </Button>
          </div>
        )}
        {sharing.error ? <FormError>{sharing.error}</FormError> : null}
      </div>
    </Dialog>
  );
}

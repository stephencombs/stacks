import { formatTime } from "@stacks/client-runtime/format";
import {
  usePlayerInvite,
  useRecordingSubmit,
  useRecordingTable,
  useServerTable,
  useTableSharing,
} from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import type { PlayerId, PlayerIdentity, TableId, VisitId } from "@stacks/contracts";
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
 * table, and the recorders it appointed, record for all of them; only the starter shares it and
 * changes its settings.
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
  const [open, setOpen] = useState<"add" | "share" | "settings" | null>(null);
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
        {table.role === "starter" ? (
          <>
            <Button variant="ghost" onClick={() => setOpen("share")}>
              Share
            </Button>
            <Button variant="ghost" onClick={() => setOpen("settings")}>
              Table settings
            </Button>
          </>
        ) : null}
      </div>
      {table.role === "recorder" ? (
        <Note>The player who started this table asked you to record for everyone here.</Note>
      ) : null}
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
      ) : open === "settings" ? (
        <TableSettingsDialog tableId={tableId} onClose={() => setOpen(null)} />
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

/**
 * The starter's settings for a table: an invite for each player, who records for everyone, and
 * the share link. Recorders need an account, so only players with one are listed.
 */
function TableSettingsDialog({ tableId, onClose }: { tableId: TableId; onClose: () => void }) {
  const table = useRecordingTable(tableId)!;
  const server = useServerTable(tableId);
  const sharing = useTableSharing(tableId);
  const recording = useRecordingSubmit();
  const [inviting, setInviting] = useState<PlayerIdentity | null>(null);
  const [stopped, setStopped] = useState(false);
  const players = [
    ...new Map(
      table.visits.filter((item) => !item.isSelf).map((item) => [item.player.id, item.player]),
    ).values(),
  ];
  const recorders = new Set(table.recorders.map((player) => player.id));
  const names = new Map(server?.players.map((player) => [player.id, player.displayName]));
  const toggle = (playerId: PlayerId) =>
    void recording.submit({
      type: recorders.has(playerId) ? "revoke_recorder" : "appoint_recorder",
      tableId,
      playerId,
    });
  if (inviting) return <InviteDialog player={inviting} onClose={() => setInviting(null)} />;
  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Table settings"
      description="Only you see these: you started this table."
    >
      <div className="flex flex-col gap-6">
        {!sharing.ready ? (
          <>
            <Note>This table has to sync before you can invite players or appoint recorders.</Note>
            <Button variant="primary" size="lg" onClick={() => void sharing.prepare()}>
              Sync this table
            </Button>
          </>
        ) : (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Players</h3>
              {players.length === 0 ? (
                <Note>Add a player, then invite them to record their own play on their phone.</Note>
              ) : (
                <List as="ul" label="Players to invite">
                  {players.map((player) => (
                    <li key={player.id}>
                      <Row>
                        <RowText title={player.displayName} />
                        <Button size="sm" variant="ghost" onClick={() => setInviting(player)}>
                          Invite this player
                        </Button>
                      </Row>
                    </li>
                  ))}
                </List>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Recorders</h3>
              <Note>
                A recorder records and corrects everyone's play here. They can't share the table or
                appoint anyone. Only players signed in to an account can record.
              </Note>
              {server === undefined ? null : server === null ? (
                <Note>Recorders show when Color Up can be reached.</Note>
              ) : server.appointable.length === 0 ? (
                <Note>Nobody here has an account yet.</Note>
              ) : (
                <List as="ul" label="Players who can record">
                  {server.appointable.map((playerId) => (
                    <li key={playerId}>
                      <Row>
                        <RowText
                          title={names.get(playerId) ?? "Player"}
                          meta={recorders.has(playerId) ? "Records for everyone" : undefined}
                        />
                        <Button
                          size="sm"
                          variant={recorders.has(playerId) ? "danger" : "secondary"}
                          pending={recording.pending}
                          onClick={() => toggle(playerId)}
                        >
                          {recorders.has(playerId) ? "Stop" : "Make recorder"}
                        </Button>
                      </Row>
                    </li>
                  ))}
                </List>
              )}
              {recording.error ? <FormError>{recording.error}</FormError> : null}
            </section>
            {server?.shared && !stopped ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Sharing</h3>
                <Note>Anyone with the table's link can watch it and join it.</Note>
                <Button
                  variant="danger"
                  className="self-start"
                  pending={sharing.pending}
                  onClick={() => void sharing.revoke().then(() => setStopped(true))}
                >
                  Stop sharing
                </Button>
                {sharing.error ? <FormError>{sharing.error}</FormError> : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * A single-use link that lets one more device record as this player, and the devices that already
 * do. Only the starter, or a device recording as the player, can make one.
 */
function InviteDialog({ player, onClose }: { player: PlayerIdentity; onClose: () => void }) {
  const invite = usePlayerInvite(player.id);
  const url = invite.link ? `${location.origin}/invite/${invite.link.token}` : null;
  const devices = invite.access?.devices ?? [];
  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={`Invite ${player.displayName}`}
      description={`Send this link to ${player.displayName} only. Opening it lets their phone record their own play here, and nobody else's. It works once.`}
    >
      <div className="flex flex-col gap-4">
        {url ? (
          <>
            <p className="rounded-lg bg-sunken px-3 py-2 font-mono text-sm wrap-anywhere">{url}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={url} />
              <Button
                size="sm"
                variant="danger"
                pending={invite.pending}
                onClick={() => void invite.cancel()}
              >
                Cancel link
              </Button>
            </div>
            <Note>A new link stops this one working.</Note>
          </>
        ) : (
          <>
            {invite.access?.invite ? (
              <Note>An earlier link hasn't been used yet. A new one cancels it.</Note>
            ) : null}
            <Button
              variant="primary"
              className="self-start"
              pending={invite.pending}
              onClick={() => void invite.issue()}
            >
              Create invite link
            </Button>
          </>
        )}
        {devices.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Recording as {player.displayName}</h3>
            <List as="ul" label={`Devices recording as ${player.displayName}`}>
              {devices.map((device, index) => (
                <li key={device.actorId}>
                  <Row>
                    <RowText
                      title={`Device ${index + 1}`}
                      meta={device.boundVia === "invite" ? "Joined by invite" : "Joined by link"}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      pending={invite.pending}
                      onClick={() => void invite.stopDevice(device.actorId)}
                    >
                      Stop
                    </Button>
                  </Row>
                </li>
              ))}
            </List>
          </section>
        ) : null}
        {invite.error ? <FormError>{invite.error}</FormError> : null}
      </div>
    </Dialog>
  );
}

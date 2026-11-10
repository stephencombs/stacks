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
import { useState } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FormError } from "../components/ui/Field";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading, Tag } from "../components/ui/Surface";
import { useAccount } from "../lib/account";
import { webUrl } from "../lib/config";
import { shareLink } from "../lib/share";
import { AddPlayerSheet } from "./RecordingForms";

/**
 * Everyone recorded at this visit's table, each opening their own visit. Whoever started the
 * table, and the recorders it appointed, record for all of them; only the starter shares it and
 * changes its settings.
 */
export function TableSection({
  tableId,
  onOpen,
}: {
  tableId: TableId;
  onOpen: (visitId: VisitId) => void;
}) {
  const table = useRecordingTable(tableId);
  const account = useAccount();
  const [open, setOpen] = useState<"add" | "share" | "settings" | null>(null);
  if (!table) return null;
  if (table.role === "participant") return <JoinedTableSection tableId={tableId} onOpen={onOpen} />;
  const others = table.visits.some((item) => !item.isSelf);
  const signedOut = account.available && account.isLoaded && !account.isSignedIn;
  return (
    <View className="gap-2">
      <SectionHeading>At this table</SectionHeading>
      <List>
        {table.visits.map((item) => (
          <Row
            key={item.visit.id}
            onPress={() => onOpen(item.visit.id)}
            accessibilityHint="Opens their session"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-medium text-ink">
                {item.isSelf ? "You" : item.player.displayName}
              </Text>
              <Text className="text-sm text-muted">
                {item.finalResult === null
                  ? `Playing since ${formatTime(item.visit.startedAt)}`
                  : `Finished ${formatTime(item.visit.finishedAt!)}`}
              </Text>
            </View>
            {item.finalResult === null ? (
              <Tag tone="live">Live</Tag>
            ) : (
              <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
            )}
          </Row>
        ))}
      </List>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Add player" onPress={() => setOpen("add")} />
        {table.role === "starter" ? (
          <>
            <Button label="Share" variant="ghost" onPress={() => setOpen("share")} />
            <Button label="Table settings" variant="ghost" onPress={() => setOpen("settings")} />
          </>
        ) : null}
      </View>
      {table.role === "recorder" ? (
        <Text className="text-sm text-muted">
          The player who started this table asked you to record for everyone here.
        </Text>
      ) : null}
      {signedOut && others ? (
        <Text className="text-sm text-muted">
          This table syncs from this device. Sign in to keep this table if you lose the device.
        </Text>
      ) : null}
      {open === "add" ? (
        <AddPlayerSheet
          tableId={tableId}
          saved={table.addable}
          onClose={() => setOpen(null)}
          onAdded={(next) => {
            setOpen(null);
            onOpen(next);
          }}
        />
      ) : open === "share" ? (
        <ShareSheet tableId={tableId} onClose={() => setOpen(null)} />
      ) : open === "settings" ? (
        <TableSettingsSheet tableId={tableId} onClose={() => setOpen(null)} />
      ) : null}
    </View>
  );
}

/** Creates, shares and revokes the table's read-only link. Only the starter sees this. */
function ShareSheet({ tableId, onClose }: { tableId: TableId; onClose: () => void }) {
  const sharing = useTableSharing(tableId);
  const url = sharing.token ? `${webUrl}/t/${sharing.token}` : null;
  return (
    <Sheet
      open
      busy={sharing.pending}
      onClose={onClose}
      title="Share this table"
      description="Anyone with the link can see everyone's buy-ins, cash-outs and results here. They can't change anything, and they don't need an account."
    >
      <View className="gap-3">
        {!sharing.ready ? (
          <>
            <Text className="text-sm text-muted">
              This table has to sync before it can be shared.
            </Text>
            <Button
              label="Sync this table"
              variant="primary"
              size="lg"
              onPress={() => void sharing.prepare()}
            />
          </>
        ) : url ? (
          <>
            <Text selectable className="rounded-lg bg-sunken px-3 py-2 font-mono text-sm text-ink">
              {url}
            </Text>
            <Button
              label="Send link"
              variant="primary"
              size="lg"
              onPress={() => void shareLink(url, "Follow our table on Color Up:")}
            />
            <Button
              label="Stop sharing"
              variant="danger"
              pending={sharing.pending}
              onPress={() => void sharing.revoke()}
            />
            <Text className="text-sm text-muted">A new link stops this one working.</Text>
          </>
        ) : (
          <>
            <Button
              label="Create link"
              variant="primary"
              size="lg"
              pending={sharing.pending}
              onPress={() => void sharing.share()}
            />
            <Button
              label="Stop sharing"
              variant="danger"
              pending={sharing.pending}
              onPress={() => void sharing.revoke()}
            />
          </>
        )}
        {sharing.error ? <FormError>{sharing.error}</FormError> : null}
      </View>
    </Sheet>
  );
}

/**
 * A table this device joined. Its own visits are here; everyone else's come from the server, so
 * they show only online, and only to read: a participant records just their own play.
 */
function JoinedTableSection({
  tableId,
  onOpen,
}: {
  tableId: TableId;
  onOpen: (visitId: VisitId) => void;
}) {
  const table = useRecordingTable(tableId)!;
  const server = useServerTable(tableId);
  const names = new Map(server?.players.map((player) => [player.id, player.displayName]));
  const rows = [
    ...table.visits.map((item) => ({ ...item, name: "You", mine: true })),
    ...(server?.visits ?? [])
      .filter((item) => item.visit.playerId !== table.you.player.id)
      .map((item) => ({ ...item, name: names.get(item.visit.playerId) ?? "Player", mine: false })),
  ];
  return (
    <View className="gap-2">
      <SectionHeading>At this table</SectionHeading>
      <List>
        {rows.map((item) => (
          <Row
            key={item.visit.id}
            {...(item.mine
              ? { onPress: () => onOpen(item.visit.id), accessibilityHint: "Opens your session" }
              : {})}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-medium text-ink">{item.name}</Text>
              <Text className="text-sm text-muted">
                {item.finalResult === null
                  ? `Playing since ${formatTime(item.visit.startedAt)}`
                  : `Finished ${formatTime(item.visit.finishedAt!)}`}
              </Text>
            </View>
            {item.finalResult === null ? (
              <Tag tone="live">Live</Tag>
            ) : (
              <Money amount={item.finalResult} currency={RECORDING_CURRENCY} tone="result" />
            )}
          </Row>
        ))}
      </List>
      <Text className="text-sm text-muted">
        {server === null
          ? "The others at this table show when Color Up can be reached."
          : "You record your own play here. Whoever started the table records for everyone."}
      </Text>
    </View>
  );
}

/**
 * The starter's settings for a table: an invite for each player, who records for everyone, and
 * the share link. Recorders need an account, so only players with one are listed.
 */
function TableSettingsSheet({ tableId, onClose }: { tableId: TableId; onClose: () => void }) {
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
  if (inviting) return <InviteSheet player={inviting} onClose={() => setInviting(null)} />;
  return (
    <Sheet
      open
      busy={recording.pending || sharing.pending}
      onClose={onClose}
      title="Table settings"
      description="Only you see these: you started this table."
    >
      <View className="gap-4">
        {!sharing.ready ? (
          <>
            <Text className="text-sm text-muted">
              This table has to sync before you can invite players or appoint recorders.
            </Text>
            <Button
              label="Sync this table"
              variant="primary"
              size="lg"
              onPress={() => void sharing.prepare()}
            />
          </>
        ) : (
          <>
            <View className="gap-2">
              <SectionHeading>Players</SectionHeading>
              {players.length === 0 ? (
                <Text className="text-sm text-muted">
                  Add a player, then invite them to record their own play on their phone.
                </Text>
              ) : (
                <List>
                  {players.map((player) => (
                    <Row key={player.id}>
                      <Text className="min-w-0 flex-1 font-medium text-ink">
                        {player.displayName}
                      </Text>
                      <Button
                        label="Invite this player"
                        size="sm"
                        variant="ghost"
                        onPress={() => setInviting(player)}
                      />
                    </Row>
                  ))}
                </List>
              )}
            </View>
            <View className="gap-2">
              <SectionHeading>Recorders</SectionHeading>
              <Text className="text-sm text-muted">
                A recorder records and corrects everyone's play here. They can't share the table or
                appoint anyone. Only players signed in to an account can record.
              </Text>
              {server === undefined ? null : server === null ? (
                <Text className="text-sm text-muted">
                  Recorders show when Color Up can be reached.
                </Text>
              ) : server.appointable.length === 0 ? (
                <Text className="text-sm text-muted">Nobody here has an account yet.</Text>
              ) : (
                <List>
                  {server.appointable.map((playerId) => (
                    <Row key={playerId}>
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="font-medium text-ink">
                          {names.get(playerId) ?? "Player"}
                        </Text>
                        {recorders.has(playerId) ? (
                          <Text className="text-sm text-muted">Records for everyone</Text>
                        ) : null}
                      </View>
                      <Button
                        label={recorders.has(playerId) ? "Stop" : "Make recorder"}
                        size="sm"
                        variant={recorders.has(playerId) ? "danger" : "secondary"}
                        pending={recording.pending}
                        onPress={() => toggle(playerId)}
                      />
                    </Row>
                  ))}
                </List>
              )}
              {recording.error ? <FormError>{recording.error}</FormError> : null}
            </View>
            {server?.shared && !stopped ? (
              <View className="gap-2">
                <SectionHeading>Sharing</SectionHeading>
                <Text className="text-sm text-muted">
                  Anyone with the table's link can watch it and join it.
                </Text>
                <Button
                  label="Stop sharing"
                  variant="danger"
                  pending={sharing.pending}
                  onPress={() => void sharing.revoke().then(() => setStopped(true))}
                />
                {sharing.error ? <FormError>{sharing.error}</FormError> : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}

/**
 * A single-use link that lets one more device record as this player, and the devices that already
 * do. The link opens on the web, so it works for people without the app.
 */
function InviteSheet({ player, onClose }: { player: PlayerIdentity; onClose: () => void }) {
  const invite = usePlayerInvite(player.id);
  const url = invite.link ? `${webUrl}/invite/${invite.link.token}` : null;
  const devices = invite.access?.devices ?? [];
  return (
    <Sheet
      open
      busy={invite.pending}
      onClose={onClose}
      title={`Invite ${player.displayName}`}
      description={`Send this link to ${player.displayName} only. Opening it lets their phone record their own play here, and nobody else's. It works once.`}
    >
      <View className="gap-3">
        {url ? (
          <>
            <Text selectable className="rounded-lg bg-sunken px-3 py-2 font-mono text-sm text-ink">
              {url}
            </Text>
            <Button
              label="Send link"
              variant="primary"
              size="lg"
              onPress={() => void shareLink(url, "Record your play at our table on Color Up:")}
            />
            <Button
              label="Cancel link"
              variant="danger"
              pending={invite.pending}
              onPress={() => void invite.cancel()}
            />
            <Text className="text-sm text-muted">A new link stops this one working.</Text>
          </>
        ) : (
          <>
            {invite.access?.invite ? (
              <Text className="text-sm text-muted">
                An earlier link hasn't been used yet. A new one cancels it.
              </Text>
            ) : null}
            <Button
              label="Create invite link"
              variant="primary"
              size="lg"
              pending={invite.pending}
              onPress={() => void invite.issue()}
            />
          </>
        )}
        {devices.length > 0 ? (
          <View className="gap-2">
            <SectionHeading>{`Recording as ${player.displayName}`}</SectionHeading>
            <List>
              {devices.map((device, index) => (
                <Row key={device.actorId}>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-medium text-ink">Device {index + 1}</Text>
                    <Text className="text-sm text-muted">
                      {device.boundVia === "invite" ? "Joined by invite" : "Joined by link"}
                    </Text>
                  </View>
                  <Button
                    label="Stop"
                    size="sm"
                    variant="danger"
                    pending={invite.pending}
                    onPress={() => void invite.stopDevice(device.actorId)}
                  />
                </Row>
              ))}
            </List>
          </View>
        ) : null}
        {invite.error ? <FormError>{invite.error}</FormError> : null}
      </View>
    </Sheet>
  );
}

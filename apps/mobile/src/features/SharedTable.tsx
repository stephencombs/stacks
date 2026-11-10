import { formatTime } from "@stacks/client-runtime/format";
import {
  useRecordingTable,
  useServerTable,
  useTableSharing,
} from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import type { TableId, VisitId } from "@stacks/contracts";
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
 * table records for all of them, and shares it.
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
  const [open, setOpen] = useState<"add" | "share" | null>(null);
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
      <View className="flex-row gap-2">
        <Button label="Add player" onPress={() => setOpen("add")} />
        <Button label="Share" variant="ghost" onPress={() => setOpen("share")} />
      </View>
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

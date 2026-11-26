import {
  StackActions,
  useIsFocused,
  useNavigation,
  type StaticScreenProps,
} from "@react-navigation/native";
import { makeSharedWatchable } from "@stacks/client-runtime/api";
import { ScopeHubProvider } from "@stacks/client-runtime/realtimeReact";
import { distinctPlayerNames, formatDay, formatTime } from "@stacks/client-runtime/format";
import {
  useJoinTable,
  useRecordingTable,
  useSharedTable,
} from "@stacks/client-runtime/recordingReact";
import {
  formatSeatLabel,
  RECORDING_CURRENCY,
  visitTitle,
} from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import { seatCount, sortSeatings, tableLiveSeats, visitSeatOutcome } from "@stacks/shared/seats";
import { useCallback, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "../components/ui/Text";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import {
  EmptyState,
  List,
  PageTitle,
  Row,
  SectionHeading,
  Skeleton,
  Tag,
} from "../components/ui/Surface";
import { BlackjackTableArc, type ArcOccupant } from "../features/BlackjackTableArc";
import { PersonalScreen } from "../features/Personal";
import { JoinSheet, SitDownSheet } from "../features/RecordingForms";
import { apiUrl } from "../lib/config";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { createHub } from "../lib/scopeHub";

type Props = StaticScreenProps<{ token: string }>;

/**
 * A table someone shared: anyone can watch it, and join it to record their own play. It watches
 * with the link itself, which needs no account, so what's recorded at the table shows as it happens.
 */
export function SharedTableScreen({ route }: Props) {
  const { token } = route.params;

  const makeHub = useCallback(
    () =>
      createHub({
        authorization: async () => `Share ${token}`,
        watchable: makeSharedWatchable({ baseUrl: apiUrl }, token),
      }),
    [token],
  );

  return (
    <ScopeHubProvider make={makeHub}>
      <SharedTableView token={token} />
    </ScopeHubProvider>
  );
}

function SharedTableView({ token }: { token: string }) {
  const navigation = useNavigation();
  const view = useSharedTable(apiUrl, token, useIsFocused());

  return (
    <PersonalScreen>
      {Platform.OS === "android" && view == null ? (
        <PageTitle inContent>Shared table</PageTitle>
      ) : null}
      {view === undefined ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : view === null ? (
        <>
          <EmptyState title="This link doesn't work anymore">
            Whoever shared it may have stopped sharing or made a new link. Ask them for the current
            one. If you already joined this table, your sessions there are in your play.
          </EmptyState>
          <Button
            label="Open Color Up"
            className="self-start"
            onPress={() =>
              navigation.navigate("Tabs", { screen: "PlayTab", params: { screen: "Home" } })
            }
          />
        </>
      ) : (
        <SharedTable view={view} token={token} />
      )}
    </PersonalScreen>
  );
}

function SharedTable({ view, token }: { view: TableView; token: string }) {
  const prefs = usePreferences();
  const local = useRecordingTable(view.table.id);
  const join = useJoinTable(token);
  const navigation = useNavigation();
  const [open, setOpen] = useState<"join" | "sit" | null>(null);
  const you = local?.you.player ?? null;

  const names = distinctPlayerNames(
    view.players.map((player) => [player.id, player.id === you?.id ? "You" : player.displayName]),
  );

  const visits = view.visits;
  const first = visits[0]?.visit;
  const live = visits.some((item) => item.finalResult === null);
  const played = local?.visits.some((item) => item.isSelf) ?? false;
  const totalSeats = seatCount(view.table);
  const seatings = view.seatings ?? [];

  const occupied =
    totalSeats === null
      ? new Map<number, VisitId>()
      : tableLiveSeats(
          visits.map((item) => item.visit),
          seatings,
        );

  const liveSeatByVisit = new Map<VisitId, number>();

  for (const [seatNumber, visitId] of occupied) liveSeatByVisit.set(visitId, seatNumber);

  const visitById = new Map(visits.map((item) => [item.visit.id, item]));
  const occupants = new Map<number, ArcOccupant>();

  for (const [seatNumber, visitId] of occupied) {
    const item = visitById.get(visitId);

    if (!item) continue;

    occupants.set(seatNumber, {
      playerId: item.visit.playerId,
      name: names.get(item.visit.playerId) ?? "Player",
      isSelf: item.visit.playerId === you?.id,
      visitId: item.visit.id,
    });
  }

  const seatNoteFor = (visitId: VisitId, isLive: boolean) => {
    if (totalSeats === null) return null;

    if (isLive) {
      const seat = liveSeatByVisit.get(visitId);

      return seat === undefined ? null : formatSeatLabel(seat, totalSeats);
    }

    const outcome = visitSeatOutcome(
      sortSeatings(seatings.filter((seating) => seating.visitId === visitId)),
    );

    if (outcome.kind === "seat") return formatSeatLabel(outcome.seat, totalSeats);

    if (outcome.kind === "multiple") return "Multiple seats";

    return null;
  };

  const openVisit = (visitId: VisitId) =>
    navigation.dispatch(StackActions.replace("Play", { visitId }));

  return (
    <>
      <PageTitle
        inContent={Platform.OS === "android"}
        tag={<Tag tone={live ? "live" : "neutral"}>{live ? "Live" : "Finished"}</Tag>}
        context={
          first
            ? `Started ${formatDay(first.startedAt)}, ${formatTime(first.startedAt)}`
            : undefined
        }
      >
        {visitTitle(view.table)}
      </PageTitle>
      {totalSeats !== null && occupants.size > 0 ? (
        <BlackjackTableArc seats={totalSeats} surface="sheet" occupants={occupants} />
      ) : null}
      <View className="gap-2">
        <SectionHeading
          action={local ? undefined : <Text className="text-sm text-muted">Read-only</Text>}
        >
          Players
        </SectionHeading>
        {visits.length === 0 ? (
          <Text className="text-sm text-muted">Nobody has bought in yet.</Text>
        ) : (
          <List>
            {visits.map((item) => {
              const isLive = item.finalResult === null;
              const seatText = seatNoteFor(item.visit.id, isLive);

              const statusText = isLive
                ? `Playing · in ${formatDisplayMoney(item.totals.buyIn, RECORDING_CURRENCY, prefs)}`
                : `Finished ${formatTime(item.visit.finishedAt!)}`;

              return (
                <Row key={item.visit.id}>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="type-heading text-ink">
                      {names.get(item.visit.playerId) ?? "Player"}
                    </Text>
                    <Text className="type-footnote text-muted">
                      {seatText ? `${seatText} · ${statusText}` : statusText}
                    </Text>
                  </View>
                  {isLive ? (
                    <Tag tone="live">Live</Tag>
                  ) : (
                    <Money amount={item.finalResult!} currency={RECORDING_CURRENCY} tone="result" />
                  )}
                </Row>
              );
            })}
          </List>
        )}
      </View>
      {local && local.role !== "participant" ? (
        <>
          <Text className="text-sm text-muted">You record for everyone at this table.</Text>
          {local.you.playing ? (
            <Button
              label="Open your session"
              variant="primary"
              size="lg"
              onPress={() => openVisit(local.you.playing!)}
            />
          ) : (
            <Button
              label="Open the table"
              variant="primary"
              size="lg"
              onPress={() =>
                navigation.dispatch(StackActions.replace("Table", { tableId: view.table.id }))
              }
            />
          )}
        </>
      ) : local ? (
        local.you.playing ? (
          <Button
            label="Open your session"
            variant="primary"
            className="self-start"
            onPress={() => openVisit(local.you.playing!)}
          />
        ) : (
          <Button
            label={played ? "Back at the table" : "Buy in"}
            variant="primary"
            className="self-start"
            onPress={() => setOpen("sit")}
          />
        )
      ) : (
        <>
          <Text className="text-sm text-muted">
            Playing here? Join to record your own buy-ins and cash-outs. You don't need an account.
          </Text>
          <Button
            label="Join this table"
            variant="primary"
            className="self-start"
            onPress={() => setOpen("join")}
          />
        </>
      )}
      {open === "join" ? (
        <JoinSheet join={join} onClose={() => setOpen(null)} onJoined={() => setOpen("sit")} />
      ) : open === "sit" && local && you ? (
        <SitDownSheet
          tableId={view.table.id}
          player={you}
          returning={played}
          onClose={() => setOpen(null)}
          onSeated={(visitId) => {
            setOpen(null);
            openVisit(visitId);
          }}
        />
      ) : null}
    </>
  );
}

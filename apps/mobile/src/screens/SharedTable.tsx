import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { fetchSharedTable } from "@stacks/client-runtime/api";
import { distinctPlayerNames, formatDay, formatTime } from "@stacks/client-runtime/format";
import { useJoinTable, useRecordingTable } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY, visitTitle } from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

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
import { PersonalScreen } from "../features/Personal";
import { JoinSheet, SitDownSheet } from "../features/RecordingForms";
import { apiUrl } from "../lib/config";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";

type Props = StaticScreenProps<{ token: string }>;

/** A table someone shared: anyone can watch it, and join it to record their own play. */
export function SharedTableScreen({ route }: Props) {
  const { token } = route.params;
  const navigation = useNavigation();
  const [view, setView] = useState<TableView | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void Effect.runPromiseExit(fetchSharedTable({ baseUrl: apiUrl }, token)).then((exit) => {
      if (current) setView(Exit.isSuccess(exit) ? exit.value : null);
    });
    return () => {
      current = false;
    };
  }, [token]);
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
            {visits.map((item) => (
              <Row key={item.visit.id}>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="type-heading text-ink">
                    {names.get(item.visit.playerId) ?? "Player"}
                  </Text>
                  <Text className="type-footnote text-muted">
                    {item.finalResult === null
                      ? `Playing · in ${formatDisplayMoney(item.totals.buyIn, RECORDING_CURRENCY, prefs)}`
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

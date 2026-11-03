import { type GroupDetail, type TripDetail, type UserLimits } from "@stacks/contracts";
import { reconcileLimitSessions } from "@stacks/client-runtime/limits";
import { useAllOutboxEntries } from "@stacks/client-runtime/react";
import {
  editableLimitAmount,
  evaluateLimits,
  formatPlayedMinutes,
  type LocalSessionOverride,
} from "@stacks/shared/limits";
import { parseMoney } from "@stacks/shared/money";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { Button } from "../components/ui/Button";
import { Money } from "../components/Money";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Loaded, useAction, useStacks } from "../lib/stacks";

export function PersonalLimits({
  group,
  trip,
  local,
  settings = false,
  showNotices = true,
}: {
  group: GroupDetail;
  trip: TripDetail;
  local?: LocalSessionOverride;
  settings?: boolean;
  showNotices?: boolean;
}) {
  const stacks = useStacks();
  return (
    <Loaded query={stacks.limits(trip.trip.id)} skeleton={<></>}>
      {(limits) => (
        <LimitsContent
          group={group}
          trip={trip}
          limits={limits}
          {...(local ? { local } : {})}
          settings={settings}
          showNotices={showNotices}
        />
      )}
    </Loaded>
  );
}

function LimitsContent({
  group,
  trip,
  limits,
  local,
  settings,
  showNotices,
}: {
  group: GroupDetail;
  trip: TripDetail;
  limits: UserLimits;
  local?: LocalSessionOverride;
  settings: boolean;
  showNotices: boolean;
}) {
  const [now, setNow] = useState(() => DateTime.nowUnsafe());
  const { pending, sent } = useAllOutboxEntries();
  const sessions = reconcileLimitSessions(trip.sessions, group.myPlayerId, pending, sent);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(DateTime.nowUnsafe());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  const notices = evaluateLimits({
    limits,
    currency: group.group.currency,
    playerId: group.myPlayerId,
    sessions: sessions ?? trip.sessions,
    now,
    ...(local ? { local } : {}),
  });
  return (
    <View className="gap-3 px-4">
      {showNotices && !sessions && limits.lossLimit !== null ? (
        <Text>Loss limit progress is unavailable until this trip refreshes.</Text>
      ) : null}
      {showNotices && sessions && notices.lossLimit ? (
        <Text accessibilityLiveRegion="polite" className="rounded-xl bg-sunken p-3 text-ink">
          {notices.lossLimit.level === "reached"
            ? "You’ve reached your loss limit"
            : "You’re approaching your loss limit"}
          : <Money amount={notices.lossLimit.loss} currency={group.group.currency} /> of{" "}
          <Money amount={notices.lossLimit.limit} currency={group.group.currency} />. Live buy-ins
          count as money at risk until cashed out.
        </Text>
      ) : null}
      {showNotices && notices.sessionReminder ? (
        <Text accessibilityLiveRegion="polite" className="rounded-xl bg-sunken p-3 text-ink">
          You’ve been playing for {formatPlayedMinutes(notices.sessionReminder.minutesPlayed)}.
          Consider taking a break.
        </Text>
      ) : null}
      {settings ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: editing }}
            onPress={() => setEditing(!editing)}
            className="min-h-11 justify-center"
          >
            <Text className="font-semibold text-ink">Private play limits</Text>
          </Pressable>
          {editing ? (
            <LimitsForm
              key={`${limits.lossLimit}-${limits.currency}-${limits.sessionReminderMinutes}`}
              group={group}
              trip={trip}
              limits={limits}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function LimitsForm({
  group,
  trip,
  limits,
}: {
  group: GroupDetail;
  trip: TripDetail;
  limits: UserLimits;
}) {
  const stacks = useStacks();
  const save = useAction(stacks.Client.mutation("limits", "update"));
  const currency = group.group.currency;
  const [amount, setAmount] = useState(
    limits.lossLimit === null ? "" : editableLimitAmount(limits.lossLimit, limits.currency),
  );
  const [reminder, setReminder] = useState(String(limits.sessionReminderMinutes ?? 0));
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const parsed = amount.trim() ? Option.getOrNull(parseMoney(amount, currency)) : null;
    if (amount.trim() && (parsed === null || parsed <= 0))
      return setError("Enter a positive amount or leave it blank to turn the limit off.");
    setError(null);
    const sessionReminderMinutes =
      reminder === "120" ? 120 : reminder === "180" ? 180 : reminder === "240" ? 240 : null;
    await save.run({
      params: { tripId: trip.trip.id },
      payload: { lossLimit: parsed, sessionReminderMinutes },
    });
  };
  return (
    <View className="gap-3">
      <Text className="text-muted">
        Only you can see these settings. The loss limit applies to this trip; the session reminder
        applies to all trips.
      </Text>
      <TextField
        label={`Loss limit (${currency})`}
        hint="Leave blank to turn off."
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <Choice
        label="Session reminder"
        options={[
          { value: "0", label: "Off" },
          { value: "120", label: "2 hours" },
          { value: "180", label: "3 hours" },
          { value: "240", label: "4 hours" },
        ]}
        value={reminder}
        onChange={setReminder}
      />
      {error || save.error ? <FormError>{error ?? save.error}</FormError> : null}
      <Button label="Save limits" onPress={() => void submit()} pending={save.pending} />
      {limits.lossLimit !== null ? (
        <Button
          label="Remove loss limit"
          disabled={save.pending}
          onPress={() =>
            void save.run({
              params: { tripId: trip.trip.id },
              payload: { lossLimit: null, sessionReminderMinutes: limits.sessionReminderMinutes },
            })
          }
        />
      ) : null}
    </View>
  );
}

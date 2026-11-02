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
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Money } from "~/components/Money";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

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
  useEffect(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), 60_000);
    return () => clearInterval(timer);
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
    <div className="flex flex-col gap-3">
      {showNotices && !sessions && limits.lossLimit !== null ? (
        <p>Loss limit progress is unavailable until this trip refreshes.</p>
      ) : null}
      {showNotices && sessions && notices.lossLimit ? (
        <p role="status" className="rounded-lg bg-sunken p-3 text-sm">
          {notices.lossLimit.level === "reached"
            ? "You’ve reached your loss limit"
            : "You’re approaching your loss limit"}
          : <Money amount={notices.lossLimit.loss} currency={group.group.currency} /> of{" "}
          <Money amount={notices.lossLimit.limit} currency={group.group.currency} />. Live buy-ins
          count as money at risk until cashed out.
        </p>
      ) : null}
      {showNotices && notices.sessionReminder ? (
        <p role="status" className="rounded-lg bg-sunken p-3 text-sm">
          You’ve been playing for {formatPlayedMinutes(notices.sessionReminder.minutesPlayed)}.
          Consider taking a break.
        </p>
      ) : null}
      {settings ? (
        <LimitsForm
          key={`${limits.lossLimit}-${limits.currency}-${limits.sessionReminderMinutes}`}
          limits={limits}
          group={group}
          trip={trip}
        />
      ) : null}
    </div>
  );
}

function LimitsForm({
  limits,
  group,
  trip,
}: {
  limits: UserLimits;
  group: GroupDetail;
  trip: TripDetail;
}) {
  const stacks = useStacks();
  const save = useAction(stacks.Client.mutation("limits", "update"));
  const currency = group.group.currency;
  const [amount, setAmount] = useState(
    limits.lossLimit === null ? "" : editableLimitAmount(limits.lossLimit, limits.currency),
  );
  const [reminder, setReminder] = useState(String(limits.sessionReminderMinutes ?? 0));
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <details className="rounded-lg bg-sunken p-3">
      <summary className="cursor-pointer font-medium">Private play limits</summary>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          Only you can see these settings. The loss limit applies to this trip; the session reminder
          applies to all trips.
        </p>
        <Field label={`Loss limit (${currency})`} hint="Leave blank to turn off.">
          {(props) => (
            <Input
              {...props}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
        </Field>
        <Field label="Session reminder">
          {(props) => (
            <Select
              {...props}
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
            >
              <option value="0">Off</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
              <option value="240">4 hours</option>
            </Select>
          )}
        </Field>
        {error || save.error ? <FormError>{error ?? save.error}</FormError> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" pending={save.pending}>
            Save limits
          </Button>
          {limits.lossLimit !== null ? (
            <Button
              disabled={save.pending}
              onClick={() =>
                void save.run({
                  params: { tripId: trip.trip.id },
                  payload: {
                    lossLimit: null,
                    sessionReminderMinutes: limits.sessionReminderMinutes,
                  },
                })
              }
            >
              Remove loss limit
            </Button>
          ) : null}
        </div>
      </form>
    </details>
  );
}

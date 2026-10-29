import { Link } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { playerNames } from "@stacks/client-runtime/format";
import {
  boardMoney,
  chipOf,
  currentTrip,
  localClock,
  tripDates,
} from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { ChevronRight, Plane } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input } from "~/components/ui/Field";
import { SectionHeading, Surface } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";
import { Chip } from "./Chip";

/** `date` inputs want a local calendar day. */
const localDay = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** The group's trips: the one going now as a jump onto its board, then past trips. */
export function TripsSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const [starting, setStarting] = useState(false);
  const current = currentTrip(detail);
  const past = detail.trips.filter((trip) => trip.endedAt !== null);
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading
        action={
          current ? null : (
            <Button size="sm" variant="ghost" onClick={() => setStarting(true)}>
              <Plane className="size-4" aria-hidden />
              Start a trip
            </Button>
          )
        }
      >
        Trips
      </SectionHeading>
      {current ? (
        <Link
          to="/trips/$tripId"
          params={{ tripId: current.id }}
          className="flex flex-col gap-3 rounded-2xl bg-board p-4 text-board-ink transition-[scale] duration-150 active:scale-[0.99]"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-board-amber uppercase">
                Live board · {tripDates(current)}
              </span>
              <span className="truncate text-2xl font-black tracking-tight uppercase">
                {current.name}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-board-muted" aria-hidden />
          </span>
          <Loaded query={stacks.trip(current.id)} skeleton={<span className="h-6" />}>
            {(trip) => <Leaders detail={detail} trip={trip} />}
          </Loaded>
        </Link>
      ) : past.length === 0 ? (
        <p className="text-sm text-pretty text-muted">
          Going somewhere? Start a trip and every session until you end it lands on its own
          leaderboard, with awards for the best and worst of it.
        </p>
      ) : null}
      {past.length > 0 ? (
        <Surface className="divide-y divide-line">
          {past.map((trip) => (
            <Link
              key={trip.id}
              to="/trips/$tripId"
              params={{ tripId: trip.id }}
              className="flex min-h-12 items-center justify-between gap-3 px-5 py-3 first:rounded-t-2xl last:rounded-b-2xl hover:bg-sunken/50"
            >
              <span className="truncate">{trip.name}</span>
              <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
                {tripDates(trip)}
                <ChevronRight className="size-4" aria-hidden />
              </span>
            </Link>
          ))}
        </Surface>
      ) : null}
      {starting ? <StartTripDialog detail={detail} onClose={() => setStarting(false)} /> : null}
    </section>
  );
}

/** The top three on the trip's board so far. */
function Leaders({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const top = tripStandings(closed, localClock).slice(0, 3);
  if (top.length === 0)
    return <span className="text-sm text-board-muted">The board fills in as sessions close.</span>;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-2">
      {top.map((s) => (
        <span key={s.playerId} className="flex items-center gap-2">
          <span className="font-mono text-sm text-board-amber">{s.rank}</span>
          <Chip chip={chipOf(detail, s.playerId)} name={names.get(s.playerId) ?? ""} size={22} />
          <span
            className={`font-mono text-sm tabular-nums ${s.net >= 0 ? "text-board-win" : "text-board-loss"}`}
          >
            {boardMoney(s.net, detail.group.currency)}
          </span>
        </span>
      ))}
    </span>
  );
}

function StartTripDialog({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("trips", "create"));
  const [problem, setProblem] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const today = localDay(now);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const day = String(form.get("startedOn") ?? today);
    if (!name) return setProblem("Give the trip a name.");
    setProblem(null);
    // A trip starts at midnight of its first day, so whatever was played that day counts.
    const startedAt = DateTime.makeUnsafe(new Date(`${day}T00:00`).getTime());
    const saved = await create.run({
      params: { groupId: detail.group.id },
      payload: { id: TripId.make(newId()), name, startedAt },
    });
    if (saved) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Start a trip"
      description="Every session from the start day until you end the trip goes on its board."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Trip name">
          {(props) => (
            <Input
              {...props}
              name="name"
              maxLength={60}
              autoComplete="off"
              placeholder={`Vegas ${now.getFullYear()}`}
            />
          )}
        </Field>
        <Field label="Started on" hint="Pick an earlier day to include sessions already played.">
          {(props) => (
            <Input {...props} type="date" name="startedOn" defaultValue={today} max={today} />
          )}
        </Field>
        {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={create.pending}>
          {create.pending ? "Starting…" : "Start trip"}
        </Button>
      </form>
    </Dialog>
  );
}

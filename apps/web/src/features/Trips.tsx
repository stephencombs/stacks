import { useNavigate } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import { playerNames } from "@stacks/client-runtime/format";
import { chipOf, localClock, tripDates } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { Plane } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input } from "~/components/ui/Field";
import { EmptyState, Section } from "~/components/ui/Page";
import { List, RowLink, RowText } from "~/components/ui/Surface";
import { Loaded, useAction, useStacks } from "~/lib/stacks";
import { Chip } from "./Chip";

/** `date` inputs want a local calendar day. */
const localDay = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** The group's trips: the ones going now, with who's leading, then past trips. */
export function TripsSection({ detail }: { detail: GroupDetail }) {
  const stacks = useStacks();
  const going = detail.trips.filter((trip) => trip.endedAt === null);
  const past = detail.trips.filter((trip) => trip.endedAt !== null);

  if (detail.trips.length === 0) {
    return (
      <EmptyState title="No trips yet">
        Every session is part of a trip, like a weekend in Vegas or this month's home games. Each
        trip keeps its own leaderboard and settle-up.
      </EmptyState>
    );
  }

  return (
    <>
      {going.length > 0 ? (
        <Section
          title="Going now"
          action={<StartTripButton detail={detail} variant="ghost" size="sm" />}
        >
          <List>
            {going.map((trip) => (
              <RowLink key={trip.id} to="/trips/$tripId" params={{ tripId: trip.id }}>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <RowText title={trip.name} meta={tripDates(trip)} />
                  <Loaded query={stacks.trip(trip.id)} skeleton={<span className="h-6" />}>
                    {(detailed) => <Leaders detail={detail} trip={detailed} />}
                  </Loaded>
                </span>
              </RowLink>
            ))}
          </List>
        </Section>
      ) : null}
      {past.length > 0 ? (
        <Section title="Past trips">
          <List>
            {past.map((trip) => (
              <RowLink key={trip.id} to="/trips/$tripId" params={{ tripId: trip.id }}>
                <RowText title={trip.name} meta={tripDates(trip)} />
              </RowLink>
            ))}
          </List>
        </Section>
      ) : null}
    </>
  );
}

/** Opens the dialog that starts a trip, and goes to its board once it's saved. */
export function StartTripButton({
  detail,
  variant = "primary",
  size = "md",
}: {
  detail: GroupDetail;
  variant?: "primary" | "ghost";
  size?: "sm" | "md";
}) {
  const [starting, setStarting] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setStarting(true)}>
        <Plane className="size-4" aria-hidden />
        Start a trip
      </Button>
      {starting ? <StartTripDialog detail={detail} onClose={() => setStarting(false)} /> : null}
    </>
  );
}

/** The top three on the trip's board so far. */
function Leaders({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const top = tripStandings(closed, localClock).slice(0, 3);
  if (top.length === 0)
    return <span className="text-sm text-muted">Close a session to put it on the board.</span>;
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {top.map((s) => (
        <span key={s.playerId} className="flex items-center gap-1.5">
          <Chip chip={chipOf(detail, s.playerId)} name={names.get(s.playerId) ?? ""} size={22} />
          <span className="text-muted">{names.get(s.playerId)}</span>
          <Money amount={s.net} currency={detail.group.currency} tone="result" />
        </span>
      ))}
    </span>
  );
}

function StartTripDialog({ detail, onClose }: { detail: GroupDetail; onClose: () => void }) {
  const stacks = useStacks();
  const navigate = useNavigate();
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
    // A trip starts at midnight of its first day.
    const startedAt = DateTime.makeUnsafe(new Date(`${day}T00:00`).getTime());
    const saved = await create.run({
      params: { groupId: detail.group.id },
      payload: { id: TripId.make(newId()), name, startedAt },
    });
    if (!saved) return;
    onClose();
    void navigate({ to: "/trips/$tripId", params: { tripId: saved.id } });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Start a trip"
      description="Sessions you start in it go on its board and settle up on their own."
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
        <Field label="Started on" hint="Shown with the trip, in its dates.">
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

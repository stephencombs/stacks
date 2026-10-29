import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  SessionId,
  TripId,
  type Game,
  type GroupDetail,
  type TripDetail,
  type PlayerId,
  type Venue,
} from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import * as DateTime from "effect/DateTime";
import { UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { FormError, Input } from "~/components/ui/Field";
import { PageTitle, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { AddGuestDialog } from "~/features/AddGuestDialog";
import { Chip } from "~/features/Chip";
import { VenuePicker } from "~/features/VenuePicker";
import { gameNames } from "@stacks/client-runtime/format";
import { chipOf } from "@stacks/client-runtime/trip";
import { Loaded, useAction, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/sessions/new")({ component: NewSession });

function NewSession() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="mt-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(detail) => <NewSessionForm detail={detail} trip={trip} />}
        </Loaded>
      )}
    </Loaded>
  );
}

const GAMES = Object.keys(gameNames) as ReadonlyArray<Game>;

/** `datetime-local` wants local wall time without a zone. */
const localInputValue = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function NewSessionForm({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const create = useAction(stacks.Client.mutation("sessions", "create"));
  const [venue, setVenue] = useState<Venue | null>(null);
  const [game, setGame] = useState<Game>("blackjack");
  const [playerIds, setPlayerIds] = useState<ReadonlySet<PlayerId>>(
    () => new Set([detail.myPlayerId]),
  );
  // The start-time field opens two hours back, capped at the moment it was opened.
  const [earlier, setEarlier] = useState<{ readonly value: string; readonly max: string } | null>(
    null,
  );
  const [addingGuest, setAddingGuest] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const players = detail.players.filter((player) => player.role !== null || player.userId === null);

  const toggle = (id: PlayerId) =>
    setPlayerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [first, ...rest] = players
      .filter((player) => playerIds.has(player.id))
      .map((player) => player.id);
    if (!venue) return setProblem("Pick where you're playing.");
    if (!first) return setProblem("Pick at least one player.");
    setProblem(null);
    const startedAtInput = String(new FormData(event.currentTarget).get("startedAt") ?? "");
    const startedAt =
      earlier && startedAtInput ? DateTime.makeUnsafe(new Date(startedAtInput)) : undefined;
    const session = await create.run({
      params: { tripId: trip.trip.id },
      payload: {
        id: SessionId.make(newId()),
        venueId: venue.id,
        game,
        playerIds: [first, ...rest],
        notes: null,
        ...(startedAt ? { startedAt } : {}),
      },
    });
    if (session)
      void navigate({ to: "/sessions/$sessionId", params: { sessionId: session.session.id } });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8 pt-4">
      <PageTitle eyebrow={`${detail.group.name} · ${trip.trip.name}`}>Start a session</PageTitle>

      <section className="flex flex-col gap-2">
        <SectionHeading>Where</SectionHeading>
        <Surface className="p-4">
          <VenuePicker groupId={detail.group.id} selected={venue} onSelect={setVenue} />
        </Surface>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          Game
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GAMES.map((option) => (
            <label
              key={option}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-lg outline-offset-2 outline-accent-text has-[:focus-visible]:outline-2 px-2 text-center text-sm shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors duration-150",
                game === option
                  ? "bg-accent font-semibold text-accent-ink shadow-none"
                  : "bg-surface hover:bg-sunken",
              )}
            >
              <input
                type="radio"
                name="game"
                className="sr-only"
                checked={game === option}
                onChange={() => setGame(option)}
              />
              {gameNames[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            Who's playing
          </legend>
          <Button size="sm" variant="ghost" onClick={() => setAddingGuest(true)}>
            <UserPlus className="size-4" aria-hidden />
            Add a guest
          </Button>
        </div>
        <Surface className="divide-y divide-line">
          {players.map((player) => (
            <label
              key={player.id}
              className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-sunken"
            >
              <input
                type="checkbox"
                checked={playerIds.has(player.id)}
                onChange={() => toggle(player.id)}
                className="size-5 accent-[var(--color-accent)]"
              />
              <Chip chip={chipOf(detail, player.id)} name={player.displayName} size={26} />
              <span>
                {player.displayName}
                {player.id === detail.myPlayerId ? (
                  <span className="text-muted"> (you)</span>
                ) : null}
                {player.userId === null ? <span className="text-muted"> · guest</span> : null}
              </span>
            </label>
          ))}
        </Surface>
        <p className="text-sm text-muted">Anyone else can join the session later.</p>
      </fieldset>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={earlier !== null}
            onChange={(event) => {
              const now = Date.now();
              setEarlier(
                event.target.checked
                  ? {
                      value: localInputValue(new Date(now - 2 * 3_600_000)),
                      max: localInputValue(new Date(now)),
                    }
                  : null,
              );
            }}
            className="size-5 accent-[var(--color-accent)]"
          />
          We started earlier
        </label>
        {earlier ? (
          <Input
            type="datetime-local"
            name="startedAt"
            aria-label="Start time"
            defaultValue={earlier.value}
            max={earlier.max}
            className="max-w-64"
          />
        ) : null}
      </div>

      {(problem ?? create.error) ? <FormError>{problem ?? create.error}</FormError> : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={create.pending}
        className="w-full sm:w-auto sm:self-start"
      >
        {create.pending ? "Starting…" : "Start session"}
      </Button>

      <AddGuestDialog
        detail={detail}
        open={addingGuest}
        onOpenChange={setAddingGuest}
        onAdded={(id) => setPlayerIds((current) => new Set([...current, id]))}
      />
    </form>
  );
}

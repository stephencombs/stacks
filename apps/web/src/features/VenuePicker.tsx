import { useAtomValue } from "@effect/atom-react";
import { VenueId, type GroupId, type Venue } from "@stacks/contracts";
import { newId } from "@stacks/client-runtime/ids";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { Check, Home, Laptop, LocateFixed, MapPin, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input } from "~/components/ui/Field";
import { cn } from "~/components/ui/cn";
import { useDebounced } from "~/lib/useDebounced";
import { useAction, useStacks } from "~/lib/stacks";

const kindIcon = { casino: MapPin, online: Laptop, home: Home } as const;

function VenueOption({
  venue,
  selected,
  onSelect,
}: {
  venue: Venue;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = kindIcon[venue.kind];
  const place = [venue.city, venue.region].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150",
        selected ? "bg-accent text-accent-ink" : "hover:bg-sunken",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", selected ? "text-accent-ink" : "text-muted")}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{venue.name}</span>
        <span className={cn("truncate text-sm", selected ? "text-accent-ink/70" : "text-muted")}>
          {[
            place ||
              (venue.kind === "online" ? "Online" : venue.kind === "home" ? "Home game" : ""),
            venue.verified ? "" : "Unverified",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
    </button>
  );
}

function VenueResults({
  groupId,
  search,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  search: { q: string; near?: { lat: number; lng: number } };
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const result = useAtomValue(stacks.venueSearch(groupId, search));
  const venues = AsyncResult.getOrElse(result, () => []);
  if (AsyncResult.isInitial(result) || (result.waiting && venues.length === 0)) {
    return <p className="px-3 py-2 text-sm text-muted">Searching…</p>;
  }
  if (venues.length === 0)
    return <p className="px-3 py-2 text-sm text-muted">No venues match “{search.q}”.</p>;
  return (
    <div className="flex flex-col">
      {venues.map((venue) => (
        <VenueOption
          key={venue.id}
          venue={venue}
          selected={selected?.id === venue.id}
          onSelect={() => onSelect(venue)}
        />
      ))}
    </div>
  );
}

export function VenuePicker({
  groupId,
  selected,
  onSelect,
}: {
  groupId: GroupId;
  selected: Venue | null;
  onSelect: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const recent = AsyncResult.getOrElse(useAtomValue(stacks.recentVenues(groupId)), () => []);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "failed">("idle");
  const [adding, setAdding] = useState(false);

  const locate = () => {
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating("idle");
      },
      () => setLocating("failed"),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const searching = q !== "" || near !== null;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          aria-label="Search venues"
          placeholder="Search casinos"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="pl-9"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={locate} disabled={locating === "busy"}>
          <LocateFixed className="size-4" aria-hidden />
          {locating === "busy" ? "Finding you…" : near ? "Near you" : "Near me"}
        </Button>
        <Button size="sm" onClick={() => setAdding(true)}>
          Add a venue
        </Button>
      </div>
      {locating === "failed" ? (
        <p className="text-sm text-muted">Couldn't get your location. Search by name instead.</p>
      ) : null}

      <div className="-mx-3 flex flex-col">
        {searching ? (
          <VenueResults
            groupId={groupId}
            search={near && q === "" ? { q, near } : { q }}
            selected={selected}
            onSelect={onSelect}
          />
        ) : recent.length > 0 ? (
          <>
            <p className="px-3 pb-1 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              Recent
            </p>
            {recent.map((venue) => (
              <VenueOption
                key={venue.id}
                venue={venue}
                selected={selected?.id === venue.id}
                onSelect={() => onSelect(venue)}
              />
            ))}
          </>
        ) : (
          <p className="px-3 text-sm text-muted">Search for where you're playing, or add it.</p>
        )}
        {selected && !searching && !recent.some((venue) => venue.id === selected.id) ? (
          <VenueOption venue={selected} selected onSelect={() => onSelect(selected)} />
        ) : null}
      </div>

      <AddVenueDialog
        groupId={groupId}
        open={adding}
        onOpenChange={setAdding}
        initialName={text.trim()}
        onAdded={(venue) => {
          onSelect(venue);
          setText("");
        }}
      />
    </div>
  );
}

function AddVenueDialog({
  groupId,
  open,
  onOpenChange,
  initialName,
  onAdded,
}: {
  groupId: GroupId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onAdded: (venue: Venue) => void;
}) {
  const stacks = useStacks();
  const create = useAction(stacks.Client.mutation("venues", "create"));
  const [kind, setKind] = useState<Venue["kind"]>("casino");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const city = String(form.get("city") ?? "").trim();
    if (!name) return setNameError("Enter the venue's name.");
    setNameError(null);
    const venue = await create.run({
      payload: {
        id: VenueId.make(newId()),
        name,
        kind,
        city: kind === "casino" && city ? city : null,
        region: null,
        country: null,
        groupId: kind === "home" ? groupId : null,
      },
    });
    if (venue) {
      onAdded(venue);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a venue"
      description="Casinos you add are shared with everyone on Stacks. Home games stay private to this group."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Kind</legend>
          <div className="grid grid-cols-3 gap-2">
            {(["casino", "online", "home"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "flex h-11 cursor-pointer items-center justify-center rounded-lg text-sm shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors duration-150",
                  kind === option
                    ? "bg-accent font-medium text-accent-ink shadow-none"
                    : "hover:bg-sunken",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {option === "casino" ? "Casino" : option === "online" ? "Online" : "Home game"}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Name" error={nameError}>
          {(props) => (
            <Input
              {...props}
              name="name"
              defaultValue={initialName}
              maxLength={80}
              autoComplete="off"
            />
          )}
        </Field>
        {kind === "casino" ? (
          <Field label="City">
            {(props) => (
              <Input {...props} name="city" maxLength={80} autoComplete="address-level2" />
            )}
          </Field>
        ) : null}
        {create.error ? <FormError>{create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" disabled={create.pending}>
          {create.pending ? "Adding…" : "Add venue"}
        </Button>
      </form>
    </Dialog>
  );
}

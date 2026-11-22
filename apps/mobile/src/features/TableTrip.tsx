import { useRecordingSubmit } from "@stacks/client-runtime/recordingReact";
import {
  filterTripOptions,
  tableTripOptions,
  tripFieldValue,
} from "@stacks/client-runtime/recordingView";
import { TripId, type GroupListItem, type Table } from "@stacks/contracts";
import { useRef, useState, type ReactNode } from "react";

import { Icon } from "../components/ui/Icon";
import { PickerRows } from "../components/ui/PickerRows";
import { SearchablePickerSheet } from "../components/ui/SearchablePickerSheet";
import { Row } from "../components/ui/Surface";
import { Text } from "../components/ui/Text";
import { useAccount } from "../lib/account";
import { Loaded, StacksProvider, useStacks } from "../lib/stacks";

type Status = "loading" | "failed" | "ready";

const noGroups: ReadonlyArray<GroupListItem> = [];

const saveFailed = "Couldn't save that trip right now. Check your connection and try again.";

function Groups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>, status: Status) => ReactNode;
}) {
  const account = useAccount();

  if (!account.available || !account.isSignedIn) return children(noGroups, "ready");

  return (
    <StacksProvider>
      <SignedInGroups>{children}</SignedInGroups>
    </StacksProvider>
  );
}

function SignedInGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>, status: Status) => ReactNode;
}) {
  const stacks = useStacks();

  return (
    <Loaded
      query={stacks.groups}
      skeleton={children(noGroups, "loading")}
      renderError={() => children(noGroups, "failed")}
    >
      {(groups) => children(groups, "ready")}
    </Loaded>
  );
}

/** Whether a table can be put in a trip: you're signed in, or it's already in one to take out. */
export function useTripPickable(attached: boolean) {
  const account = useAccount();

  return attached || (account.available && account.isSignedIn === true);
}

/** A row of a `List`: the table's trip, opening the picker. */
export function TripRow({ value, onPress }: { value: TripId | null; onPress: () => void }) {
  return (
    <Groups>
      {(groups) => (
        <Row onPress={onPress}>
          <Text className="flex-1 type-body text-ink">Trip</Text>
          <Text numberOfLines={1} className="max-w-[60%] shrink type-callout text-muted">
            {tripFieldValue(tableTripOptions(groups, value), value)}
          </Text>
          <Icon name="chevron-right" color="muted" size={18} />
        </Row>
      )}
    </Groups>
  );
}

function TripPicker({
  groups,
  status,
  value,
  error,
  onSelect,
  onClose,
}: {
  groups: ReadonlyArray<GroupListItem>;
  status: Status;
  value: TripId | null;
  error: string | null | undefined;
  onSelect: (tripId: TripId | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const choosing = useRef(false);
  const q = text.trim();

  const options = filterTripOptions(tableTripOptions(groups, value), q).map((option) => ({
    ...option,
    selected: option.key === (value ?? ""),
  }));

  const choose = async (key: string) => {
    if (choosing.current) return;
    choosing.current = true;
    setPendingKey(key);
    setFailure(null);

    try {
      await onSelect(key ? TripId.make(key) : null);
    } catch {
      setFailure(saveFailed);
    } finally {
      choosing.current = false;
      setPendingKey(null);
    }
  };

  const notice =
    status === "failed"
      ? "Trips couldn't load. Check your connection and try again."
      : options.length === 0
        ? `No trips match “${q}”`
        : null;

  return (
    <SearchablePickerSheet
      open
      title="Trip"
      placeholder="Search trips"
      query={text}
      onQueryChange={setText}
      loading={status === "loading"}
      busy={pendingKey !== null}
      error={failure ?? error ?? null}
      onClose={onClose}
    >
      {notice ? (
        <Text accessibilityLiveRegion="polite" className="px-1 pb-3 type-footnote text-muted">
          {notice}
        </Text>
      ) : null}
      <PickerRows options={options} pendingKey={pendingKey} onChoose={(o) => void choose(o.key)} />
    </SearchablePickerSheet>
  );
}

/**
 * Picks the trip a table belongs to, or none. Choosing a row finishes the pick: `onSelect` runs
 * with a spinner on that row and nothing can dismiss the sheet, and the caller closes it by
 * returning. A throw, or `error`, leaves the sheet open for another try.
 */
export function TripPickerSheet({
  value,
  error,
  onSelect,
  onClose,
}: {
  value: TripId | null;
  onSelect: (tripId: TripId | null) => void | Promise<void>;
  onClose: () => void;
  /** A failure the caller met while saving, shown beside any the picker meets itself. */
  error?: string | null;
}) {
  return (
    <Groups>
      {(groups, status) => (
        <TripPicker
          groups={groups}
          status={status}
          value={value}
          error={error}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </Groups>
  );
}

/** The table's trip. Choosing one saves it and returns, so there is no Save button. */
export function TableTripSheet({
  table,
  onClose,
  onSaved,
}: {
  table: Table;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useRecordingSubmit();

  return (
    <TripPickerSheet
      value={table.tripId}
      error={save.error}
      onClose={onClose}
      onSelect={async (tripId) => {
        if (tripId === table.tripId) return onSaved();

        if (await save.submit({ type: "set_table_trip", tableId: table.id, tripId })) onSaved();
      }}
    />
  );
}

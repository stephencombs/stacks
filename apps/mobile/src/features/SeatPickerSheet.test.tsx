import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingVisit } from "@stacks/client-runtime/recordingView";
import { PlayerId, VisitId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { ArcOccupant } from "./BlackjackTableArc";

const setup = async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let documentState: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => documentState,
    commit: async (revision, payload) => {
      documentState = { revision: revision + 1, payload };

      return documentState.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;

  const Container = ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>;

  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    View: Container,
    Text: Container,
    Pressable: ({
      accessibilityLabel,
      disabled,
      onPress,
      children,
    }: {
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress?: () => void;
      children?: ReactNode;
    }) => (
      <button type="button" aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
        {children}
      </button>
    ),
  }));

  vi.doMock("react-native-svg", () => ({
    default: Container,
    Circle: Container,
    Defs: Container,
    Ellipse: Container,
    G: Container,
    Line: Container,
    LinearGradient: Container,
    Path: Container,
    RadialGradient: Container,
    Rect: Container,
    Stop: Container,
    Text: Container,
  }));

  vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
  vi.doMock("../components/ui/motion", () => ({ useReducedMotion: () => false }));
  vi.doMock("../lib/useLargeText", () => ({ useLargeText: () => false }));
  vi.doMock("./PlayerAvatar", () => ({
    PlayerAvatar: ({ name }: { name: string }) => <span>{name}</span>,
  }));

  vi.doMock("../components/ui/Button", () => ({
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => (
      <button type="button" disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
  }));

  vi.doMock("../components/ui/Field", () => ({
    FormError: ({ children }: { children?: ReactNode }) => <div role="alert">{children}</div>,
    Choice: ({
      label,
      options,
      onChange,
    }: {
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      onChange: (value: string) => void;
    }) => (
      <div role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    ),
  }));

  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      title,
      children,
      onClose,
    }: {
      title: string;
      children?: ReactNode;
      onClose: () => void;
    }) => (
      <section aria-label={title}>
        {children}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </section>
    ),
  }));

  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { SeatPickerSheet } = await import("./SeatPickerSheet");
  const element = document.createElement("div");
  const root = createRoot(element);

  const click = async (text: string) => {
    const button = [...element.querySelectorAll("button")].find(
      (node) => node.textContent === text || node.getAttribute("aria-label")?.startsWith(text),
    );

    expect(button, text).toBeDefined();
    await act(async () => button!.click());
  };

  return { store, RecordingProvider, SeatPickerSheet, element, root, click };
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("picks a draft seat instantly, enforces occupied-seat shrink guard, and clears draft seat", async () => {
  const { store, RecordingProvider, SeatPickerSheet, element, root, click } = await setup();
  const onSelect = vi.fn();
  const onTableSeats = vi.fn();
  const onClose = vi.fn();

  const occupants = new Map<number, ArcOccupant>([
    [
      6,
      {
        playerId: PlayerId.make("0192e7a0-0000-7000-8000-000000000002"),
        name: "Bea",
        visitId: VisitId.make("0192e7a0-0000-7000-8000-000000000012"),
      },
    ],
  ]);

  try {
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <SeatPickerSheet
            mode="draft"
            seats={[1]}
            tableSeats={6}
            canEditTable
            occupants={occupants}
            onSelect={onSelect}
            onTableSeats={onTableSeats}
            onClose={onClose}
          />
        </RecordingProvider>,
      ),
    );

    await click("5 seats");
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("Seat 6 is occupied");
    expect(onTableSeats).not.toHaveBeenCalled();

    await click("7 seats");
    expect(onTableSeats).toHaveBeenCalledWith(7);

    await click("Seat 3, open");
    await click("Use Seats 1 & 3");
    expect(onSelect).toHaveBeenCalledWith([1, 3]);
    expect(onClose).toHaveBeenCalled();

    await click("Clear seats");
    expect(onSelect).toHaveBeenCalledWith([]);
  } finally {
    await act(async () => root.unmount());
    await store.close();
  }
});

it("saves live set_seat and Leave seat with undo, and handles unseated/single/multi-seat finished visits", async () => {
  const { store, RecordingProvider, SeatPickerSheet, element, root, click } = await setup();
  const onSaved = vi.fn();
  const onOpenHistory = vi.fn();

  try {
    await store.execute(store.prepare({ type: "start", game: "blackjack", buyIn: 20000 }));
    const liveVisitId = store.getSnapshot().state!.visits[0]!.id;

    const renderVisit = (visitId: VisitId) =>
      act(async () =>
        root.render(
          <RecordingProvider store={store}>
            <SeatPickerSheet
              mode="visit"
              visit={recordingVisit(store.getSnapshot().state!, visitId)!}
              tableSeats={5}
              canEditTable
              onClose={() => {}}
              onSaved={onSaved}
              onOpenHistory={onOpenHistory}
            />
          </RecordingProvider>,
        ),
      );

    await renderVisit(liveVisitId);
    await click("Seat 1, first base, open");
    await click("Save Seat 1");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: liveVisitId,
        text: "Sat at Seat 1 · First base.",
        undo: true,
      }),
    );
    await click("Seat 2, open");
    await click("Save Seats 1 & 2");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: liveVisitId,
        text: "Playing Seats 1 & 2.",
        undo: true,
      }),
    );

    await renderVisit(liveVisitId);
    await click("Leave seats");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: liveVisitId,
        text: "Left seats.",
        undo: true,
      }),
    );

    await store.execute(store.prepare({ type: "finish", visitId: liveVisitId, amount: 25000 }));
    await renderVisit(liveVisitId);
    expect(element.textContent).toContain("Seat 1 → Seats 1 & 2 → Left seat");
    expect(element.textContent).toContain("Multiple seat changes were recorded");
    await click("Open history");
    expect(onOpenHistory).toHaveBeenCalled();

    await store.execute(
      store.prepare({
        type: "record_completed",
        game: "blackjack",
        buyIn: 10000,
        cashOut: 15000,
        startedAt: store.getSnapshot().state!.visits[0]!.startedAt,
        finishedAt: store.getSnapshot().state!.visits[0]!.finishedAt!,
      }),
    );

    const finishedUnseatedId = store.getSnapshot().state!.visits[1]!.id;
    onSaved.mockClear();
    await renderVisit(finishedUnseatedId);
    await click("Seat 4, open");
    await click("Save Seat 4");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: finishedUnseatedId,
        text: "Seat set to Seat 4.",
        undo: false,
      }),
    );

    const firstSeating = store
      .getSnapshot()
      .state!.seatings.find((s) => s.visitId === finishedUnseatedId && s.voidedAt === null)!;

    await renderVisit(finishedUnseatedId);
    await click("Seat 2, open");
    await click("Save Seats 2 & 4");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: finishedUnseatedId,
        text: "Seats updated to Seats 2 & 4.",
        undo: false,
      }),
    );

    const seatingsAfterReplace = store
      .getSnapshot()
      .state!.seatings.filter((s) => s.visitId === finishedUnseatedId);

    const voidedFirst = seatingsAfterReplace.find((s) => s.id === firstSeating.id);
    expect(voidedFirst?.voidedAt).not.toBeNull();
    expect(voidedFirst?.voidReason).toBe("Seat corrected");

    const activeSeating = seatingsAfterReplace.find((s) => s.voidedAt === null);
    expect(activeSeating?.seat).toBeNull();
    expect(activeSeating?.seats).toEqual([2, 4]);

    await renderVisit(finishedUnseatedId);
    await click("Remove seats");
    expect(onSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visitId: finishedUnseatedId,
        text: "Seats removed.",
        undo: false,
      }),
    );
  } finally {
    await act(async () => root.unmount());
    await store.close();
  }
});

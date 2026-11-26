import { PlayerId, VisitId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const Container = vi.hoisted(
  () =>
    ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) => (
      <div aria-label={accessibilityLabel}>{children}</div>
    ),
);

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  View: Container,
  Text: Container,
  Pressable: ({
    accessibilityLabel,
    accessibilityState,
    disabled,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean; disabled?: boolean };
    disabled?: boolean;
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-selected={accessibilityState?.selected}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));

vi.mock("react-native-svg", () => ({
  default: Container,
  Line: Container,
  Path: ({ d, children }: { d?: string; children?: ReactNode }) => <div data-d={d}>{children}</div>,
  Text: Container,
}));

vi.mock("uniwind", () => ({
  useCSSVariable: () => [
    "oklch(0.515 0.113 155.3)",
    "oklch(0.435 0.095 155.9)",
    "oklch(1 0 0)",
    "oklch(1 0 0 / 0.76)",
    "oklch(0.179 0.006 285.8 / 0.08)",
  ],
}));

vi.mock("./PlayerAvatar", () => ({
  PlayerAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../components/ui/motion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("../lib/useLargeText", () => ({
  useLargeText: () => false,
}));

import { BlackjackTableArc, blackjackArcGeometry, type ArcOccupant } from "./BlackjackTableArc";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blackjackArcGeometry", () => {
  it("orders 5, 6, and 7 spots right-to-left with non-overlapping 44pt targets", () => {
    for (const count of [5, 6, 7]) {
      const geometry = blackjackArcGeometry(count, 328, { compact: true });
      expect(geometry.positions).toHaveLength(count);
      expect(geometry.positions[0]!.x).toBeGreaterThan(geometry.cx);
      expect(geometry.positions.at(-1)!.x).toBeLessThan(geometry.cx);

      for (let i = 1; i < geometry.positions.length; i++) {
        const prev = geometry.positions[i - 1]!;
        const next = geometry.positions[i]!;
        expect(next.x).toBeLessThan(prev.x);
        const distance = Math.hypot(next.x - prev.x, next.y - prev.y);
        expect(distance).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

describe("BlackjackTableArc", () => {
  it("renders accessible labels for open, occupied, and selected seats on felt and sheet", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onSelect = vi.fn();
    const priyaId = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
    const priyaVisit = VisitId.make("0192e7a0-0000-7000-8000-000000000011");

    const occupants = new Map<number, ArcOccupant>([
      [1, { playerId: priyaId, name: "Priya", isSelf: false, visitId: priyaVisit }],
    ]);

    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <BlackjackTableArc
          seats={6}
          surface="felt"
          selectedSeat={6}
          occupants={occupants}
          onSelectSpot={onSelect}
        />,
      );
    });

    const paths = [...host.querySelectorAll("[data-d]")].map(
      (el) => el.getAttribute("data-d") ?? "",
    );

    expect(paths).toHaveLength(2);
    expect(paths[0]).toContain(" 0 0 1 ");
    expect(paths[1]).toContain(" 0 0 0 ");
    expect(paths[1]).not.toContain(" 0 0 1 ");

    const buttons = [...host.querySelectorAll("button")];
    expect(buttons).toHaveLength(6);
    expect(buttons[0]!.getAttribute("aria-label")).toBe("Seat 1, first base, occupied by Priya");
    expect(buttons[2]!.getAttribute("aria-label")).toBe("Seat 3, open");
    expect(buttons[5]!.getAttribute("aria-label")).toBe("Seat 6, third base, selected");

    await act(async () => buttons[2]!.click());
    expect(onSelect).toHaveBeenCalledWith(3);

    await act(async () => {
      root.render(<BlackjackTableArc seats={5} surface="sheet" occupants={occupants} />);
    });

    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(
      host.querySelector('[aria-label="Seat 1, first base, occupied by Priya"]'),
    ).not.toBeNull();
    expect(host.querySelector('[aria-label="Seat 5, third base, open"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});

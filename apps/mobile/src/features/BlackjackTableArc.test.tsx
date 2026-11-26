import { PlayerId, VisitId } from "@stacks/contracts";
import { act, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { Container, dimensions } = vi.hoisted(() => ({
  dimensions: { width: 390, height: 844, scale: 3, fontScale: 1 },
  Container: ({
    children,
    accessibilityLabel,
    accessibilityElementsHidden,
    style,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityElementsHidden?: boolean;
    style?: CSSProperties;
  }) => (
    <div aria-label={accessibilityLabel} aria-hidden={accessibilityElementsHidden} style={style}>
      {children}
    </div>
  ),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  useWindowDimensions: () => dimensions,
  View: Container,
  Text: ({ children, numberOfLines }: { children?: ReactNode; numberOfLines?: number }) => (
    <span data-lines={numberOfLines}>{children}</span>
  ),
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
  Circle: Container,
  G: Container,
  Path: Container,
  Text: Container,
}));

vi.mock("uniwind", () => ({
  useCSSVariable: (names: ReadonlyArray<string>) => names.map((name) => `var(${name})`),
}));

vi.mock("./PlayerAvatar", () => ({
  PlayerAvatar: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../components/ui/motion", () => ({
  useReducedMotion: () => false,
}));

import { BlackjackTableArc, blackjackArcGeometry, type ArcOccupant } from "./BlackjackTableArc";

afterEach(() => {
  dimensions.fontScale = 1;
  vi.unstubAllGlobals();
});

describe("blackjackArcGeometry", () => {
  it.each([280, 328, 360])("fits 5, 6, and 7 right-to-left 44pt targets at width %i", (width) => {
    for (const count of [5, 6, 7]) {
      const geometry = blackjackArcGeometry(count, width, { compact: true });
      expect(geometry.positions).toHaveLength(count);
      expect(geometry.positions[0]!.x).toBeGreaterThan(geometry.cx);
      expect(geometry.positions.at(-1)!.x).toBeLessThan(geometry.cx);

      for (const [index, spot] of geometry.positions.entries()) {
        expect(spot.x - 22).toBeGreaterThanOrEqual(0);
        expect(spot.x + 22).toBeLessThanOrEqual(width);
        expect(spot.y - 22).toBeGreaterThanOrEqual(0);
        expect(spot.y + 22).toBeLessThanOrEqual(geometry.height);

        for (const next of geometry.positions.slice(index + 1)) {
          expect(next.x).toBeLessThan(spot.x);
          expect(Math.max(spot.x - next.x, Math.abs(spot.y - next.y))).toBeGreaterThanOrEqual(44);
        }
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
          selectedSeats={[6]}
          occupants={occupants}
          onSelectSpot={onSelect}
        />,
      );
    });

    expect(host.textContent).toContain("Dealer");
    expect(host.textContent).not.toContain("PAYS");

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

  it("keeps occupant captions outside disabled hit targets at large text sizes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    dimensions.fontScale = 1.6;
    const onSelect = vi.fn();
    const playerId = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");

    const occupants = new Map<number, ArcOccupant>([
      [1, { playerId, name: "Alexandria Worthington" }],
      [4, { playerId, name: "Priya", isSelf: true }],
    ]);

    const host = document.createElement("div");
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <BlackjackTableArc
          seats={7}
          surface="sheet"
          selectedSeats={[4]}
          occupants={occupants}
          onSelectSpot={onSelect}
          disabled
        />,
      );
    });

    const buttons = [...host.querySelectorAll("button")];
    expect(buttons[3]?.getAttribute("aria-label")).toBe("Seat 4, occupied by Priya, selected");
    expect(buttons.every((button) => button.disabled)).toBe(true);
    await act(async () => buttons[3]?.click());
    expect(onSelect).not.toHaveBeenCalled();

    const captions = [...host.querySelectorAll("[data-lines='1']")];
    expect(captions.map((caption) => caption.textContent)).toEqual(["Alexandria Wort…", "You"]);

    for (const caption of captions) {
      expect(caption.closest("button")).toBeNull();
      const wrapper = caption.closest<HTMLElement>("[aria-hidden='true']")!;
      expect(wrapper.parentElement).toBe(host.firstElementChild);
      expect(Number.parseFloat(wrapper.style.left)).toBeGreaterThanOrEqual(0);
      expect(
        Number.parseFloat(wrapper.style.left) + Number.parseFloat(wrapper.style.width),
      ).toBeLessThanOrEqual(328);
    }

    await act(async () => {
      root.render(
        <BlackjackTableArc
          seats={7}
          surface="sheet"
          selectedSeats={[6]}
          occupants={occupants}
          onSelectSpot={onSelect}
          disabled
        />,
      );
    });

    const singleUnoccupiedCaptions = [...host.querySelectorAll("[data-lines='1']")];
    expect(singleUnoccupiedCaptions.map((caption) => caption.textContent)).toEqual([
      "Alexandria Wort…",
      "You",
    ]);

    for (const caption of singleUnoccupiedCaptions) {
      expect(caption.closest("button")).toBeNull();
      const wrapper = caption.closest<HTMLElement>("[aria-hidden='true']")!;
      expect(wrapper.parentElement).toBe(host.firstElementChild);
      expect(Number.parseFloat(wrapper.style.left)).toBeGreaterThanOrEqual(0);
      expect(
        Number.parseFloat(wrapper.style.left) + Number.parseFloat(wrapper.style.width),
      ).toBeLessThanOrEqual(328);
    }

    await act(async () => {
      root.render(
        <BlackjackTableArc
          seats={6}
          surface="sheet"
          selectedSeats={[1, 2, 4]}
          occupants={
            new Map<number, ArcOccupant>([
              [1, { playerId, name: "Priya", isSelf: true }],
              [2, { playerId, name: "Priya", isSelf: true }],
            ])
          }
          onSelectSpot={onSelect}
        />,
      );
    });

    const multiCaptions = [...host.querySelectorAll("[data-lines='1']")];
    expect(multiCaptions.map((caption) => caption.textContent)).toEqual(["You", "You"]);

    await act(async () => root.unmount());
  });
});

// @vitest-environment happy-dom
import type { CurrencyCode, PlayerId, SessionDetail } from "@stacks/contracts";
import type { TableView } from "@stacks/client-runtime/table";
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const view = (seats: number[]): TableView => ({
  closed: false,
  seats: seats.map((seat) => ({
    seat,
    playerId: `p${seat}` as PlayerId,
    inPlay: 0 as never,
    out: null,
  })),
});

it("says how many seats are taken now, not how many the animated table has caught up to", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  class Value {
    interpolate() {
      return new Value();
    }
    setValue() {}
    stopAnimation() {}
  }
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Laid = ({
    children,
    onLayout,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void;
    accessibilityLabel?: string;
  }) => {
    useEffect(() => onLayout?.({ nativeEvent: { layout: { width: 400 } } }), [onLayout]);
    return <div aria-label={accessibilityLabel}>{children}</div>;
  };
  vi.doMock("react-native", () => ({
    Animated: {
      Value,
      ValueXY: Value,
      View: Plain,
      Image: Plain,
      add: () => new Value(),
      timing: () => ({ start: () => {} }),
      parallel: () => ({ start: () => {} }),
    },
    Easing: { inOut: () => () => 0, out: () => () => 0, cubic: 0, bezier: () => () => 0 },
    PixelRatio: { get: () => 1 },
    Pressable: Plain,
    Text: Plain,
    View: Laid,
  }));
  const images = {
    0: 1,
    2: 1,
    4: 1,
    6: 1,
    8: 1,
    10: 1,
    12: 1,
    14: 1,
    16: 1,
    18: 1,
    20: 1,
    22: 1,
    24: 1,
    26: 1,
    28: 1,
    30: 1,
  };
  vi.doMock("./tableImages", () => ({
    frameImages: { 5: images, 6: images, 7: images },
    railImages: { 5: images, 6: images, 7: images },
    chipImages: new Proxy({}, { get: () => [1, 1, 1, 1, 1, 1, 1] }),
  }));
  // The director is what makes the drawn table lag, so it never catches up here.
  vi.doMock("@stacks/client-runtime/table", async (original) => ({
    ...(await original<typeof import("@stacks/client-runtime/table")>()),
    makeDirector: () => ({ update: async () => {}, stop: () => {} }),
  }));
  vi.doMock("../components/ui/motion", () => ({ animate: () => {}, isReducedMotion: () => true }));
  vi.doMock("../components/ui/Button", () => ({ Button: Plain }));
  vi.doMock("../components/ui/Field", () => ({ Choice: Plain, FormError: Plain }));
  vi.doMock("../components/ui/Sheet", () => ({ Sheet: Plain }));
  vi.doMock("../components/ui/Surface", () => ({ List: Plain, Row: Plain }));
  vi.doMock("./Chip", () => ({ Chip: Plain }));
  vi.doMock("../lib/stacks", () => ({
    useStacks: () => ({ Client: { mutation: () => ({}) } }),
    useAction: () => ({ clearError() {}, attempt: async () => ({ error: null }) }),
  }));
  const { TableMap } = await import("./TableMap");
  const props = {
    detail: {
      session: { game: "blackjack", status: "live" },
      playerIds: [],
    } as unknown as SessionDetail,
    seats: 5,
    currency: "USD" as CurrencyCode,
    names: new Map(),
    chipOf: () => 1,
  };
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () => root.render(<TableMap {...props} view={view([])} />));
  await act(async () => root.render(<TableMap {...props} view={view([1, 3])} />));
  expect(element.querySelector("[aria-label^='Blackjack table']")?.getAttribute("aria-label")).toBe(
    "Blackjack table, 2 of 5 seats taken",
  );
});

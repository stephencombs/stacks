import type { CardModel } from "@stacks/client-runtime/shareCard";
import type { shareImage as ShareImage } from "../lib/share";
import { CurrencyCode } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const usd = CurrencyCode.make("USD");

const mounted = async ({
  privacyMode,
  shareImage,
}: {
  privacyMode: boolean;
  shareImage: typeof ShareImage;
}) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.doMock("react-native", () => ({
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    useWindowDimensions: () => ({ width: 390 }),
  }));
  vi.doMock("../lib/preferences", () => ({ usePreferences: () => ({ privacyMode }) }));
  vi.doMock("../lib/share", () => ({ shareImage }));
  vi.doMock("../components/ui/Text", () => ({
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: ({ children }: { children?: ReactNode }) => <p role="alert">{children}</p>,
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      title,
      footer,
      children,
    }: {
      title: string;
      footer?: ReactNode;
      children?: ReactNode;
    }) => (
      <section aria-label={title}>
        {children}
        {footer}
      </section>
    ),
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({
      label,
      pending,
      onPress,
    }: {
      label: string;
      pending?: boolean;
      onPress: () => void;
    }) => (
      <button disabled={pending} onClick={onPress}>
        {label}
      </button>
    ),
  }));
  vi.doMock("../components/ui/Switch", () => ({
    Switch: ({
      value,
      disabled,
      onValueChange,
      accessibilityLabel,
    }: {
      value: boolean;
      disabled?: boolean;
      onValueChange: (next: boolean) => void;
      accessibilityLabel: string;
    }) => (
      <input
        type="checkbox"
        aria-label={accessibilityLabel}
        checked={value}
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.checked)}
      />
    ),
  }));
  vi.doMock("./TripCard", () => ({
    TripCard: ({ model }: { model: CardModel }) => <div data-card={String(model.hidden)} />,
  }));
  vi.doMock("./SessionCard", () => ({ SessionCard: () => null }));
  vi.doMock("./CardTilt", () => ({
    CardTilt: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  }));
  vi.doMock("./ShareCardFrame", () => ({ CARD_WIDTH: 360, CARD_HEIGHT: 450 }));

  const { ShareCardSheet } = await import("./ShareCardSheet");
  const host = document.createElement("div");
  const root = createRoot(host);
  const hiddenStates: Array<boolean> = [];

  await act(async () =>
    root.render(
      <ShareCardSheet
        title="Vegas weekend"
        onClose={() => {}}
        card={(hidden) => {
          hiddenStates.push(hidden);

          return {
            kind: "trip",
            hidden,
            name: "Vegas weekend",
            dates: "",
            venues: [],
            currency: usd,
            rows: [],
            more: 0,
            you: null,
          };
        }}
      />,
    ),
  );

  const toggle = () => host.querySelector<HTMLInputElement>('input[aria-label="Hide amounts"]')!;
  const share = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Share")!;

  return {
    host,
    toggle,
    share,
    hiddenStates,
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("shows amounts by default and hides them, in the preview, when Hide amounts is on", async () => {
  const view = await mounted({ privacyMode: false, shareImage: async () => {} });

  try {
    expect(view.toggle().checked).toBe(false);
    expect(view.host.querySelector("[data-card]")?.getAttribute("data-card")).toBe("false");

    await act(async () => view.toggle().click());
    expect(view.toggle().checked).toBe(true);
    expect(view.host.querySelector("[data-card]")?.getAttribute("data-card")).toBe("true");
  } finally {
    await view.unmount();
  }
});

it("starts hidden, and locked there, in privacy mode", async () => {
  const view = await mounted({ privacyMode: true, shareImage: async () => {} });

  try {
    expect(view.toggle().checked).toBe(true);
    expect(view.toggle().disabled).toBe(true);
    expect(view.hiddenStates.every(Boolean)).toBe(true);
  } finally {
    await view.unmount();
  }
});

it("captures the card as it is now when Share is pressed, never an earlier image", async () => {
  const shareImage = vi.fn(async () => {});
  const view = await mounted({ privacyMode: false, shareImage });

  try {
    await act(async () => view.share().click());
    expect(shareImage).toHaveBeenCalledTimes(1);
    expect(view.host.querySelector("[data-card]")?.getAttribute("data-card")).toBe("false");

    await act(async () => view.toggle().click());
    await act(async () => view.share().click());
    expect(shareImage).toHaveBeenCalledTimes(2);
    expect(view.host.querySelector("[data-card]")?.getAttribute("data-card")).toBe("true");
  } finally {
    await view.unmount();
  }
});

it("shows a retryable error when the card can't be made, and the next try clears it", async () => {
  let calls = 0;

  const shareImage: typeof ShareImage = async () => {
    calls += 1;

    if (calls === 1) throw new Error("capture failed");
  };

  const view = await mounted({ privacyMode: false, shareImage });

  try {
    await act(async () => view.share().click());
    expect(view.host.querySelector('[role="alert"]')?.textContent).toBe(
      "Couldn't make the card. Try again.",
    );
    expect(view.share().disabled).toBe(false);

    await act(async () => view.share().click());
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
    expect(calls).toBe(2);
  } finally {
    await view.unmount();
  }
});

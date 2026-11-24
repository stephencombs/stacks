import { HttpClientError, TransportError } from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  type AccountDeletionPreview,
} from "@stacks/contracts";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const usd = CurrencyCode.make("USD");
const group = (id: string, name: string) => ({ id: GroupId.make(id), name });

const preview = (overrides: Partial<AccountDeletionPreview> = {}) =>
  ({
    soloGroups: [group("00000000-0000-4000-8000-000000000001", "Solo notes")],
    ownershipMoves: [
      {
        group: group("00000000-0000-4000-8000-000000000002", "Vegas crew"),
        newOwner: {
          playerId: PlayerId.make("00000000-0000-4000-8000-0000000000a1"),
          displayName: "Bob",
        },
      },
    ],
    openBalances: [
      {
        group: group("00000000-0000-4000-8000-000000000002", "Vegas crew"),
        currency: usd,
        amount: MinorUnits.make(-2500),
      },
    ],
    openStakes: [{ group: group("00000000-0000-4000-8000-000000000002", "Vegas crew"), count: 2 }],
    appleLinked: false,
    ...overrides,
  }) satisfies AccountDeletionPreview;

const offline = () =>
  new HttpClientError({
    reason: new TransportError({ request: HttpClientRequest.get("http://api") }),
  });

const mount = async ({
  os = "ios",
  load,
  remove,
  apple = async () => null,
  finished = 3,
}: {
  os?: string;
  load: () => Promise<AccountDeletionPreview>;
  remove?: (code?: string) => Promise<{ status: "pending" | "complete" }>;
  apple?: () => Promise<string | null>;
  finished?: number;
}) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const begin = vi.fn();
  const onClose = vi.fn();
  const removeAccount = vi.fn(remove ?? (async () => ({ status: "complete" as const })));
  const runExport = vi.fn();
  const Plain = ({ children }: { children?: ReactNode }) => createElement("div", null, children);

  vi.doMock("react-native", () => ({ Platform: { OS: os }, View: Plain }));
  vi.doMock("../components/ui/Text", () => ({ Text: Plain }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount }: { amount: number }) => createElement("span", { "data-money": amount }),
  }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: ({ children }: { children?: ReactNode }) =>
      createElement("p", { role: "alert" }, children),
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({
      label,
      variant,
      pending,
      disabled,
      onPress,
    }: {
      label: string;
      variant: string;
      pending?: boolean;
      disabled?: boolean;
      onPress: () => void;
    }) =>
      createElement(
        "button",
        {
          "data-variant": variant,
          "data-busy": String(!!pending),
          disabled: disabled || pending,
          onClick: onPress,
        },
        label,
      ),
  }));
  vi.doMock("../components/ui/Surface", () => ({
    Row: Plain,
    Skeleton: () => createElement("div", { "data-skeleton": "" }),
    SettingsGroup: ({
      title,
      children,
      footer,
    }: {
      title?: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) => createElement("section", { "aria-label": title }, children, footer),
    SettingsRow: ({
      title,
      subtitle,
      value,
      onPress,
    }: {
      title: string;
      subtitle?: string;
      value?: ReactNode;
      onPress?: () => void;
    }) =>
      createElement(
        "div",
        { "data-row": title, onClick: onPress, "data-pressable": String(!!onPress) },
        title,
        " ",
        subtitle,
        " ",
        value,
      ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      title,
      busy,
      footer,
      children,
    }: {
      title: string;
      busy?: boolean;
      footer?: ReactNode;
      children?: ReactNode;
    }) =>
      createElement(
        "article",
        { "aria-label": title, "data-busy": String(!!busy) },
        children,
        footer,
      ),
  }));
  vi.doMock("../lib/account", () => ({
    useAccount: () => ({ available: true, isLoaded: true, isSignedIn: true, userId: "user_alice" }),
  }));
  vi.doMock("../lib/accountDeletion", () => ({
    accountApi: { preview: load, remove: removeAccount },
    askAppleForCode: apple,
    beginAccountWipe: begin,
  }));
  vi.doMock("./useSessionsExport", () => ({
    useSessionsExport: () => ({ count: finished, run: runExport, pending: false, error: null }),
  }));

  const { DeleteAccountSheet } = await import("./DeleteAccountSheet");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(DeleteAccountSheet, { onClose })));

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);

  return {
    container,
    begin,
    onClose,
    removeAccount,
    runExport,
    button,
    text: () => container.textContent ?? "",
    press: (label: string) => act(async () => button(label)?.click()),
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("react-native");
});

it("waits for what deleting changes, and keeps Delete account off until it knows", async () => {
  const { container, button, unmount } = await mount({ load: () => new Promise(() => {}) });

  expect(container.querySelector("[data-skeleton]")).not.toBeNull();
  expect(button("Delete account")?.disabled).toBe(true);
  expect(button("Keep account")?.disabled).toBe(false);

  await unmount();
});

it("offers the export before the consequences, and keeps it when offline", async () => {
  const sheet = await mount({ load: () => Promise.reject(offline()) });

  expect(sheet.container.querySelector("[data-row='Export sessions (CSV)']")).not.toBeNull();
  expect(sheet.text()).toContain("You're offline");
  expect(sheet.text().indexOf("Export sessions")).toBeLessThan(
    sheet.text().indexOf("You're offline"),
  );
  expect(sheet.container.querySelector("[role='alert']")).toBeNull();
  expect(sheet.button("Delete account")?.disabled).toBe(true);

  await act(async () =>
    sheet.container.querySelector<HTMLElement>("[data-row='Export sessions (CSV)']")?.click(),
  );
  expect(sheet.runExport).toHaveBeenCalledTimes(1);

  await sheet.unmount();
});

it("says so when the preview fails, and loads again on Try again", async () => {
  let attempts = 0;

  const sheet = await mount({
    load: async () => {
      attempts += 1;

      if (attempts === 1) throw new Error("500");

      return preview();
    },
  });

  expect(sheet.container.querySelector("[role='alert']")?.textContent).toMatch(
    /Couldn't reach Color Up/,
  );
  expect(sheet.button("Delete account")?.disabled).toBe(true);

  await sheet.press("Try again");

  expect(attempts).toBe(2);
  expect(sheet.container.querySelector("[role='alert']")).toBeNull();
  expect(sheet.button("Delete account")?.disabled).toBe(false);

  await sheet.unmount();
});

it("lists what is deleted, what friends keep, new owners, balances and stakes", async () => {
  const sheet = await mount({ load: async () => preview() });
  const text = sheet.text();

  expect(text).toContain("Everything saved only on this phone");
  expect(text).toContain("Solo notes, and everything in it");
  expect(text).toContain("They stay as a guest");
  expect(sheet.container.querySelector("[data-row='Vegas crew']")?.textContent).toContain(
    "Bob becomes the owner",
  );
  expect(sheet.container.querySelector("[data-money='-2500']")).not.toBeNull();
  expect(text).toContain("You owe");
  expect(text).toContain("2 open stakes");
  expect(text).not.toContain("Apple");
  expect(sheet.button("Delete account")?.dataset.variant).toBe("danger");
  expect(sheet.button("Keep account")?.dataset.variant).toBe("secondary");

  await sheet.press("Keep account");
  expect(sheet.onClose).toHaveBeenCalledTimes(1);

  await sheet.unmount();
});

it("leaves out the sections that have nothing in them", async () => {
  const sheet = await mount({
    load: async () =>
      preview({ soloGroups: [], ownershipMoves: [], openBalances: [], openStakes: [] }),
  });

  expect(sheet.container.querySelector("[aria-label='Groups that change owner']")).toBeNull();
  expect(sheet.container.querySelector("[aria-label='Balances and stakes']")).toBeNull();
  expect(sheet.container.querySelector("[aria-label='Kept for your friends']")).not.toBeNull();

  await sheet.unmount();
});

it("deletes and starts the wipe, holding the sheet open while it runs", async () => {
  let finish: (result: { status: "pending" | "complete" }) => void = () => {};

  const sheet = await mount({
    load: async () => preview(),
    remove: () => new Promise((resolve) => (finish = resolve)),
  });

  await sheet.press("Delete account");

  expect(sheet.button("Delete account")?.dataset.busy).toBe("true");
  expect(sheet.container.querySelector("article")?.dataset.busy).toBe("true");
  expect(sheet.button("Keep account")?.disabled).toBe(true);
  expect(sheet.begin).not.toHaveBeenCalled();

  await act(async () => finish({ status: "pending" }));

  expect(sheet.removeAccount).toHaveBeenCalledWith(undefined);
  expect(sheet.begin).toHaveBeenCalledWith({
    userId: "user_alice",
    status: "pending",
    appleManual: false,
  });

  await sheet.unmount();
});

it("keeps the account and shows why when deleting fails", async () => {
  const sheet = await mount({
    load: async () => preview(),
    remove: () => Promise.reject(offline()),
  });

  await sheet.press("Delete account");

  expect(sheet.begin).not.toHaveBeenCalled();
  expect(sheet.container.querySelector("[role='alert']")?.textContent).toMatch(
    /Couldn't reach Color Up/,
  );
  expect(sheet.button("Delete account")?.disabled).toBe(false);

  await sheet.unmount();
});

it("passes Apple's code to the server when the Apple sheet is completed", async () => {
  const sheet = await mount({
    load: async () => preview({ appleLinked: true }),
    apple: async () => "apple-code",
  });

  expect(sheet.text()).toContain("Apple will ask you to confirm");

  await sheet.press("Delete account");

  expect(sheet.removeAccount).toHaveBeenCalledWith("apple-code");
  expect(sheet.begin).toHaveBeenCalledWith({
    userId: "user_alice",
    status: "complete",
    appleManual: false,
  });

  await sheet.unmount();
});

it("still deletes when the Apple sheet is cancelled, and asks the wipe screen for the manual steps", async () => {
  const sheet = await mount({
    load: async () => preview({ appleLinked: true }),
    apple: async () => null,
  });

  await sheet.press("Delete account");

  expect(sheet.removeAccount).toHaveBeenCalledWith(undefined);
  expect(sheet.begin).toHaveBeenCalledWith({
    userId: "user_alice",
    status: "complete",
    appleManual: true,
  });

  await sheet.unmount();
});

it("says Apple will be left for later on Android, where there is no Apple sheet", async () => {
  const sheet = await mount({
    os: "android",
    load: async () => preview({ appleLinked: true }),
  });

  expect(sheet.text()).toContain("we'll show how to remove Color Up from your Apple Account");

  await sheet.press("Delete account");

  expect(sheet.begin).toHaveBeenCalledWith({
    userId: "user_alice",
    status: "complete",
    appleManual: true,
  });

  await sheet.unmount();
});

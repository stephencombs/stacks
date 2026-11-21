import {
  CurrencyCode,
  GroupId,
  PlayerId,
  TripId,
  UserId,
  type GroupDetail,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

const day = DateTime.makeUnsafe("2026-11-15T12:00:00Z");

const makeGroup = (role: GroupDetail["role"]) => ({
  group: {
    id: GroupId.make(crypto.randomUUID()),
    name: "Vegas crew",
    currency: CurrencyCode.make("USD"),
    createdAt: day,
  },
  role,
  myPlayerId: PlayerId.make(crypto.randomUUID()),
  players: [],
  trips: [
    {
      id: TripId.make(crypto.randomUUID()),
      groupId: GroupId.make(crypto.randomUUID()),
      name: "Vegas",
      startedAt: day,
      endedAt: null,
      createdAt: day,
      createdBy: UserId.make("alex"),
    },
  ],
});

it("shows the Name row for owners and admins, hides it for members, and renames the group", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let detail = makeGroup("owner");

  const runRename = vi.fn(
    async ({ payload }: { params: { groupId: GroupId }; payload: { name: string } }) => {
      detail = { ...detail, group: { ...detail.group, name: payload.name } };

      return detail;
    },
  );

  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  vi.doMock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: vi.fn() }) }));
  vi.doMock("react-native", () => ({
    View: Container,
    Text: Container,
    Platform: { OS: "ios" },
  }));
  vi.doMock("../lib/scope", () => ({ useLinkedScope: () => {} }));
  vi.doMock("../lib/share", () => ({ shareCsv: vi.fn() }));
  vi.doMock("../lib/stacks", () => ({
    useStacks: () => ({
      group: () => "group-query",
      Client: { mutation: (_group: string, name: string) => name },
    }),
    Loaded: ({ children }: { children: (value: GroupDetail) => ReactNode }) => children(detail),
    useAction: (mutation: string) => ({
      run: mutation === "rename" ? runRename : vi.fn(),
      pending: false,
      error: null,
    }),
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: Container,
    TextField: ({
      label,
      value,
      onChangeText,
      error,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      error?: string | null;
    }) => (
      <label>
        {label}
        <input value={value} onChange={(e) => onChangeText(e.target.value)} />
        {error ? <span role="alert">{error}</span> : null}
      </label>
    ),
  }));
  vi.doMock("../components/ui/Screen", () => ({ Screen: Container }));
  vi.doMock("../components/ui/Surface", () => ({ PageTitle: Container }));
  vi.doMock("../components/ui/SettingsLayout", () => ({
    SettingsLayout: ({
      groupName,
      sections,
      children,
    }: {
      groupName: string;
      sections: ReadonlyArray<{
        rows: ReadonlyArray<{ label: string; value?: string; onPress: () => void }>;
      }>;
      children?: ReactNode;
    }) => (
      <main data-group={groupName}>
        {sections.flatMap((section) =>
          section.rows.map((row) => (
            <button key={row.label} onClick={row.onPress}>
              {row.label}
              {row.value ? `: ${row.value}` : ""}
            </button>
          )),
        )}
        {children}
      </main>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      open,
      title,
      footer,
      children,
    }: {
      open: boolean;
      title: string;
      footer?: ReactNode;
      children?: ReactNode;
    }) =>
      open ? (
        <div role="dialog" aria-label={title}>
          {children}
          {footer}
        </div>
      ) : null,
  }));
  vi.doMock("../features/ScreenSkeletons", () => ({ SettingsSkeleton: () => null }));

  const { GroupSettingsScreen } = await import("./GroupSettings");
  const host = document.createElement("div");
  const root = createRoot(host);

  try {
    await act(async () =>
      root.render(<GroupSettingsScreen route={{ params: { groupId: detail.group.id } }} />),
    );

    const nameRow = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Name:"),
    );

    expect(nameRow?.textContent).toBe("Name: Vegas crew");
    await act(async () => nameRow!.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Rename group");

    const input = host.querySelector("input")!;

    const setInput = (next: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => setInput("   "));
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!;
    await act(async () => save.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Give the group a name.");
    expect(runRename).not.toHaveBeenCalled();

    await act(async () => setInput("  Reno crew  "));
    await act(async () => save.click());
    expect(runRename).toHaveBeenCalledWith({
      params: { groupId: detail.group.id },
      payload: { name: "Reno crew" },
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    const hasNameRow = () =>
      [...host.querySelectorAll("button")].some((b) => b.textContent?.startsWith("Name:"));

    for (const [role, shown] of [
      ["admin", true],
      ["member", false],
    ] as const) {
      detail = makeGroup(role);
      await act(async () =>
        root.render(<GroupSettingsScreen route={{ params: { groupId: detail.group.id } }} />),
      );
      expect(hasNameRow()).toBe(shown);
    }
  } finally {
    await act(async () => root.unmount());
  }
});

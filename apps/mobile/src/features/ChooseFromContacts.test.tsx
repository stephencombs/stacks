import type { RecordingInput } from "@stacks/client-runtime/recording";
import { GroupId, PlayerId, TableId, type GroupDetail } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

type GuestRequest = {
  params: { groupId: GroupId };
  payload: { id: PlayerId; displayName: string };
};

const mocks = vi.hoisted(() => {
  const guests: GuestRequest[] = [];
  const recordings: RecordingInput[] = [];

  return {
    os: { current: "ios" },
    pick: { current: () => Promise.resolve<string | null>(null) },
    guests,
    recordings,
  };
});

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os.current;
    },
  },
  Pressable: ({
    accessibilityLabel,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  ActivityIndicator: () => <span role="progressbar" aria-label="Saving" />,
  Switch: () => null,
  Text: Container,
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel?: string;
    value?: string;
    onChangeText?: (next: string) => void;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChangeText?.(event.target.value)}
    />
  ),
  View: Container,
}));

vi.mock("uniwind", () => ({ useCSSVariable: () => "#999999" }));

vi.mock("../../modules/contact-picker/src", () => ({ pickContact: () => mocks.pick.current() }));

vi.mock("@stacks/client-runtime/recordingReact", async (original) => ({
  ...(await original<typeof import("@stacks/client-runtime/recordingReact")>()),
  useRecordingSubmit: () => ({
    pending: false,
    error: null,
    clearError: () => {},
    submit: (command: RecordingInput) => {
      mocks.recordings.push(command);

      return Promise.resolve(null);
    },
  }),
}));

vi.mock("../lib/stacks", () => ({
  useAction: () => ({
    run: (request: GuestRequest) => {
      mocks.guests.push(request);

      return Promise.resolve(true);
    },
    pending: false,
    error: null,
  }),
  useStacks: () => ({ Client: { mutation: () => ({}) } }),
}));

vi.mock("../lib/recording", () => ({ useRecordingState: () => null }));

vi.mock("../components/ui/Button", () => ({
  Button: ({
    label,
    onPress,
    disabled,
    testID,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled} data-testid={testID}>
      {label}
    </button>
  ),
}));

vi.mock("../components/ui/Field", () => ({
  Choice: () => null,
  FormError: ({ children }: { children?: ReactNode }) => <div role="alert">{children}</div>,
  TextField: ({
    label,
    value,
    error,
    onChangeText,
  }: {
    label: string;
    value?: string;
    error?: string | null;
    onChangeText?: (next: string) => void;
  }) => (
    <div>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChangeText?.(event.target.value)}
      />
      {error ? <div role="alert">{error}</div> : null}
    </div>
  ),
}));

vi.mock("../components/ui/Sheet", () => ({
  SheetHost: Container,
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
      <section aria-label={title}>
        {children}
        {footer}
      </section>
    ) : null,
}));

vi.mock("../components/ui/Icon", () => ({ Icon: () => null }));

vi.mock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));

vi.mock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));

vi.mock("../components/ui/ControlSurface", () => ({ ControlSurface: Container }));

vi.mock("../components/ui/Surface", () => ({
  List: Container,
  Row: Container,
  Skeleton: () => null,
  Surface: Container,
}));

vi.mock("../components/Money", () => ({ Money: () => null }));

vi.mock("./AmountKeypad", () => ({ AmountKeypad: () => null }));

vi.mock("./Chip", () => ({ Chip: () => null }));

vi.mock("./VenuePicker", () => ({ CasinoPickerSheet: () => null }));

vi.mock("./TableTrip", () => ({
  TripPickerSheet: () => null,
  TripRow: () => null,
  useTripPickable: () => false,
}));

const groupId = GroupId.make(crypto.randomUUID());
const tableId = TableId.make(crypto.randomUUID());

// SAFETY: AddGuestSheet reads only the group's id from the detail.
const detail = { group: { id: groupId } } as GroupDetail;

const surfaceNames = [
  "AddGuestSheet",
  "AddPlayerSheet on iOS",
  "AddPlayerSheet on Android",
] as const;

const typeInto = (host: HTMLElement, label: string, text: string) => {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const mount = async (name: (typeof surfaceNames)[number]) => {
  const { AddGuestSheet } = await import("./AddGuestSheet");
  const { AddPlayerSheet } = await import("./RecordingForms");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const guest = name === "AddGuestSheet";
  mocks.os.current = name === "AddPlayerSheet on Android" ? "android" : "ios";
  const buyInLabel = mocks.os.current === "android" ? "First buy-in" : "Buy-in";
  const host = document.createElement("div");
  const root = createRoot(host);

  await act(async () =>
    root.render(
      guest ? (
        <AddGuestSheet detail={detail} open onClose={() => {}} />
      ) : (
        <AddPlayerSheet tableId={tableId} saved={[]} onClose={() => {}} onAdded={() => {}} />
      ),
    ),
  );

  const submit = () =>
    host.querySelector<HTMLButtonElement>('[data-testid="sheet-submit"]') ??
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Add guest")!;

  return {
    emptyError: guest ? "Enter their name." : "Enter the player's name.",
    nameValue: () => host.querySelector<HTMLInputElement>('input[aria-label="Name"]')!.value,
    typeName: (text: string) => act(async () => typeInto(host, "Name", text)),
    chooseFromContacts: () =>
      act(async () =>
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === "Choose from Contacts")!
          .click(),
      ),
    submit: async () => {
      if (!guest) await act(async () => typeInto(host, buyInLabel, "20"));
      await act(async () => submit().click());
    },
    requested: () => (guest ? mocks.guests[0] : mocks.recordings[0]),
    shows: (text: string) => host.textContent.includes(text),
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  mocks.pick.current = () => Promise.resolve(null);
  mocks.guests.length = 0;
  mocks.recordings.length = 0;
  vi.unstubAllGlobals();
});

it.each(surfaceNames)("%s: a pick fills the name and clears its error", async (name) => {
  mocks.pick.current = () => Promise.resolve("  Ada Lovelace ");
  const view = await mount(name);

  try {
    await view.submit();
    expect(view.shows(view.emptyError)).toBe(true);

    await view.chooseFromContacts();
    expect(view.nameValue()).toBe("Ada Lovelace");
    expect(view.shows(view.emptyError)).toBe(false);
  } finally {
    await view.unmount();
  }
});

it.each(surfaceNames)("%s: cancelling leaves the name and its error alone", async (name) => {
  mocks.pick.current = () => Promise.resolve(null);
  const view = await mount(name);

  try {
    await view.typeName("Grace");
    await view.chooseFromContacts();
    expect(view.nameValue()).toBe("Grace");

    await view.typeName("");
    await view.submit();
    await view.chooseFromContacts();
    expect(view.nameValue()).toBe("");
    expect(view.shows(view.emptyError)).toBe(true);
  } finally {
    await view.unmount();
  }
});

it.each(surfaceNames)("%s: a contact with no usable name fills nothing", async (name) => {
  mocks.pick.current = () => Promise.resolve("   ");
  const view = await mount(name);

  try {
    await view.typeName("Grace");
    await view.chooseFromContacts();
    expect(view.nameValue()).toBe("Grace");
  } finally {
    await view.unmount();
  }
});

it.each(surfaceNames)("%s: a failure shows an error and keeps what was typed", async (name) => {
  mocks.pick.current = () => Promise.reject(new Error("no picker"));
  const view = await mount(name);

  try {
    await view.typeName("Grace");
    await view.chooseFromContacts();
    expect(view.nameValue()).toBe("Grace");
    expect(view.shows("Couldn't open Contacts. Type their name instead.")).toBe(true);
  } finally {
    await view.unmount();
  }
});

it.each(surfaceNames)("%s: only the display name comes from the contact", async (name) => {
  mocks.pick.current = () => Promise.resolve("Ada Lovelace");
  const view = await mount(name);

  try {
    await view.chooseFromContacts();
    await view.submit();

    expect(view.requested()).toEqual(
      name === "AddGuestSheet"
        ? {
            params: { groupId },
            payload: { id: expect.any(String), displayName: "Ada Lovelace" },
          }
        : { type: "join_table", tableId, displayName: "Ada Lovelace", buyIn: 2000 },
    );
  } finally {
    await view.unmount();
  }
});

import { PlayerId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { PickedContact } from "../../modules/contact-picker/src";

const mocks = vi.hoisted(() => {
  // SAFETY: the box starts empty and each test assigns the photo it needs.
  const photo = { current: null as string | null };
  const linked: Array<readonly [string, string]> = [];
  const removed: string[] = [];

  return {
    photo,
    available: { current: true },
    os: { current: "ios" },
    pick: { current: () => Promise.resolve<PickedContact | null>(null) },
    linked,
    removed,
    unavailable: { count: 0 },
  };
});

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os.current;
    },
  },
  Image: () => null,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/ui/Text", () => ({
  Text: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

vi.mock("../components/ui/Button", () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));

vi.mock("./PlayerAvatar", () => ({ PlayerAvatar: () => <i data-chip /> }));

vi.mock("../../modules/contact-picker/src", async (original) => ({
  ...(await original<typeof import("../../modules/contact-picker/src")>()),
  pickContact: () => mocks.pick.current(),
}));

vi.mock("../lib/contactPhotos", () => ({
  linkContactPhoto: (playerId: string, uri: string) => mocks.linked.push([playerId, uri] as const),
  removeContactPhoto: (playerId: string) => mocks.removed.push(playerId),
  discardContactPick: () => {},
  markContactPhotosUnavailable: () => {
    mocks.unavailable.count++;
    mocks.available.current = false;
  },
  useContactPhoto: () => mocks.photo.current,
  useContactPhotosAvailable: () => mocks.available.current,
}));

const player = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");

const mount = async () => {
  const { ContactPhotoControls } = await import("./ContactPhoto");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);

  const render = () =>
    act(async () => root.render(<ContactPhotoControls playerId={player} name="Ada" />));

  await render();

  const labels = () => [...host.querySelectorAll("button")].map((button) => button.textContent);

  return {
    render,
    labels,
    text: () => host.textContent,
    press: (label: string) =>
      act(async () =>
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === label)!
          .click(),
      ),
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  mocks.photo.current = null;
  mocks.available.current = true;
  mocks.pick.current = () => Promise.resolve(null);
  mocks.linked.length = 0;
  mocks.removed.length = 0;
  mocks.unavailable.count = 0;
  vi.unstubAllGlobals();
});

it("offers to link a photo, and says it stays on this phone", async () => {
  const view = await mount();

  try {
    expect(view.labels()).toEqual(["Link contact photo"]);
    expect(view.text()).toContain("Only on this phone.");
  } finally {
    await view.unmount();
  }
});

it("links the picked contact's photo to the player, and ignores their name", async () => {
  mocks.pick.current = () =>
    Promise.resolve({ name: "Someone Else", photo: { uri: "file:///cache/contact-picks/a.jpg" } });

  const view = await mount();

  try {
    await view.press("Link contact photo");
    expect(mocks.linked).toEqual([[player, "file:///cache/contact-picks/a.jpg"]]);
  } finally {
    await view.unmount();
  }
});

it("offers Change and Remove once a photo is linked, and Remove drops it", async () => {
  mocks.photo.current = "file:///photos/a.jpg";
  const view = await mount();

  try {
    expect(view.labels()).toEqual(["Change", "Remove"]);
    await view.press("Remove");
    expect(mocks.removed).toEqual([player]);
  } finally {
    await view.unmount();
  }
});

it("leaves things alone when the user cancels", async () => {
  const view = await mount();

  try {
    await view.press("Link contact photo");
    expect(mocks.linked).toEqual([]);
    expect(view.text()).not.toContain("no photo");
  } finally {
    await view.unmount();
  }
});

it("says when the contact has no photo", async () => {
  mocks.pick.current = () => Promise.resolve({ name: "Ada", photo: "none" });
  const view = await mount();

  try {
    await view.press("Link contact photo");
    expect(view.text()).toContain("This contact has no photo");
    expect(mocks.linked).toEqual([]);
  } finally {
    await view.unmount();
  }
});

it("hides the controls once a phone won't share photos, but still lets one be removed", async () => {
  mocks.pick.current = () => Promise.resolve({ name: "Ada", photo: "unavailable" });
  const view = await mount();

  try {
    await view.press("Link contact photo");
    expect(mocks.unavailable.count).toBe(1);
    expect(view.labels()).toEqual([]);
    expect(view.text()).toBe("");

    mocks.photo.current = "file:///photos/a.jpg";
    await view.render();
    expect(view.labels()).toEqual(["Remove"]);
  } finally {
    await view.unmount();
  }
});

it("never offers to link a photo on Android, whose Contacts app won't share one", async () => {
  mocks.os.current = "android";
  mocks.photo.current = null;
  const view = await mount();

  try {
    expect(view.labels()).toEqual([]);
  } finally {
    mocks.os.current = "ios";
    await view.unmount();
  }
});

it("shows a try-again message when Contacts won't open", async () => {
  mocks.pick.current = () => Promise.reject(new Error("no picker"));
  const view = await mount();

  try {
    await view.press("Link contact photo");
    expect(view.text()).toContain("Couldn't open Contacts");
  } finally {
    await view.unmount();
  }
});

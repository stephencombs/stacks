import { PlayerId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const player = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");

const renderSeat = async (props: { you: boolean }, photo: string | null = null, name = "You") => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  vi.doMock("@clerk/expo", () => ({
    useUser: () => {
      throw new Error("useUser needs a ClerkProvider");
    },
  }));

  vi.doMock("../lib/account", () => ({ useAccount: () => ({ available: false }) }));
  vi.doMock("../lib/contactPhotos", () => ({ useContactPhoto: () => photo }));
  vi.doMock("react-native", () => ({
    Platform: { OS: "android" },
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Image: ({ source }: { source: { readonly uri: string } }) => <img src={source.uri} alt="" />,
  }));

  vi.doMock("./AvatarFace", () => ({
    AvatarFace: ({ name }: { name: string }) => <span data-face={name} />,
  }));

  const { PlayerAvatar } = await import("./PlayerAvatar");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<PlayerAvatar playerId={player} name={name} {...props} />));

  return {
    face: () => container.querySelector("[data-face]")?.getAttribute("data-face") ?? null,
    image: () => container.querySelector("img")?.getAttribute("src") ?? null,
    unmount: () => act(async () => root.unmount()),
  };
};

it("draws your own seat without a Clerk provider, as the name it was given", async () => {
  const view = await renderSeat({ you: true });

  try {
    expect(view.face()).toBe("You");
  } finally {
    await view.unmount();
  }
});

it("still shows a photo linked to your seat when there is no Clerk", async () => {
  const view = await renderSeat({ you: true }, "file:///photos/me.jpg");

  try {
    expect(view.image()).toBe("file:///photos/me.jpg");
  } finally {
    await view.unmount();
  }
});

it("draws someone else's seat from their name", async () => {
  const view = await renderSeat({ you: false }, null, "Ada");

  try {
    expect(view.face()).toBe("Ada");
  } finally {
    await view.unmount();
  }
});

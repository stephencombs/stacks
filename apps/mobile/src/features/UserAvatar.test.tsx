import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type Account =
  | { readonly available: false }
  | { readonly available: true; readonly userId: string | null };

const renderAvatar = async (
  user: {
    readonly hasImage?: boolean;
    readonly imageUrl?: string;
    readonly firstName?: string | null;
    readonly fullName?: string | null;
  } | null,
  props: { contactPhoto?: string | null } = {},
  account: Account = { available: true, userId: "user_1" },
) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let triggerError: (() => void) | undefined;

  vi.doMock("@clerk/expo", () => ({
    useUser: () => {
      if (!account.available) throw new Error("useUser needs a ClerkProvider");

      return { user };
    },
  }));

  vi.doMock("../lib/account", () => ({ useAccount: () => account }));
  vi.doMock("./AvatarFace", () => ({
    AvatarFace: ({ name, playerId, size }: { name: string; playerId: string; size: number }) => (
      <span data-face={name} data-key={playerId} data-size={size} />
    ),
  }));

  vi.doMock("react-native", () => ({
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Image: ({ source, onError }: { source: { readonly uri: string }; onError?: () => void }) => {
      triggerError = onError;

      return <img src={source.uri} alt="" />;
    },
  }));

  const { UserAvatar } = await import("./UserAvatar");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<UserAvatar size={36} {...props} />));

  return {
    container,
    face: () => container.querySelector("[data-face]")?.getAttribute("data-face") ?? null,
    key: () => container.querySelector("[data-face]")?.getAttribute("data-key") ?? null,
    triggerError: () => act(async () => triggerError?.()),
    unmount: () => act(async () => root.unmount()),
  };
};

it("shows the Clerk profile photo when present and falls back to their name on error", async () => {
  const view = await renderAvatar({
    hasImage: true,
    imageUrl: "https://img.clerk.com/avatar.png",
    fullName: "Stephen Combs",
  });

  try {
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.clerk.com/avatar.png",
    );
    expect(view.face()).toBeNull();

    await view.triggerError();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.face()).toBe("Stephen Combs");
  } finally {
    await view.unmount();
  }
});

it("uses their own name instead of the word You when Clerk has no uploaded photo", async () => {
  const view = await renderAvatar({
    hasImage: false,
    imageUrl: "https://img.clerk.com/default.png",
    firstName: "Stephen",
    fullName: "Stephen Combs",
  });

  try {
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.face()).toBe("Stephen Combs");
  } finally {
    await view.unmount();
  }
});

it("prefers a photo linked on this phone, and falls back to the Clerk photo when it won't load", async () => {
  const view = await renderAvatar(
    { hasImage: true, imageUrl: "https://img.clerk.com/avatar.png", fullName: "Stephen Combs" },
    { contactPhoto: "file:///photos/me.jpg" },
  );

  try {
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe("file:///photos/me.jpg");

    await view.triggerError();
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.clerk.com/avatar.png",
    );

    await view.triggerError();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.face()).toBe("Stephen Combs");
  } finally {
    await view.unmount();
  }
});

it("keys their Android tile by their Clerk user ID, the same everywhere", async () => {
  const view = await renderAvatar({ hasImage: false, fullName: "Stephen Combs" });

  try {
    expect(view.key()).toBe("user_1");
  } finally {
    await view.unmount();
  }
});

it("keeps the name it was given, without touching Clerk, when the build has no Clerk", async () => {
  const view = await renderAvatar(null, {}, { available: false });

  try {
    expect(view.face()).toBe("You");
    expect(view.key()).toBe("you");
  } finally {
    await view.unmount();
  }
});

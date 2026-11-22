import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const renderAvatar = async (
  user: {
    readonly hasImage?: boolean;
    readonly imageUrl?: string;
    readonly firstName?: string | null;
    readonly fullName?: string | null;
  } | null,
) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let triggerError: (() => void) | undefined;

  vi.doMock("@clerk/expo", () => ({ useUser: () => ({ user }) }));
  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Image: ({ source, onError }: { source: { readonly uri: string }; onError?: () => void }) => {
      triggerError = onError;

      return <img src={source.uri} alt="" />;
    },
  }));
  vi.doMock("./Chip", () => ({
    Chip: ({ name, size }: { name: string; size?: number }) => (
      <span data-chip={name} data-size={size} />
    ),
  }));

  const { UserAvatar } = await import("./UserAvatar");
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<UserAvatar size={36} />));

  return {
    container,
    triggerError: () => act(async () => triggerError?.()),
    unmount: () => act(async () => root.unmount()),
  };
};

it("shows the Clerk profile photo when present and falls back to Chip on error", async () => {
  const view = await renderAvatar({
    hasImage: true,
    imageUrl: "https://img.clerk.com/avatar.png",
    firstName: "Stephen",
  });

  try {
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.clerk.com/avatar.png",
    );
    expect(view.container.querySelector("[data-chip]")).toBeNull();

    await view.triggerError();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("[data-chip]")?.getAttribute("data-chip")).toBe("Stephen");
  } finally {
    await view.unmount();
  }
});

it("falls back to Chip when Clerk has no uploaded photo", async () => {
  const view = await renderAvatar({
    hasImage: false,
    imageUrl: "https://img.clerk.com/default.png",
    firstName: "Stephen",
  });

  try {
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("[data-chip]")?.getAttribute("data-chip")).toBe("Stephen");
  } finally {
    await view.unmount();
  }
});

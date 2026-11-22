import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type SheetFlags = {
  readonly large?: boolean;
  readonly back?: boolean;
  readonly floatingFooter?: boolean;
  readonly busy?: boolean;
};

it("pins a native search bar in the footer of a full-height sheet and swaps the skeleton for rows", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  let flags: SheetFlags = {};
  const typed = vi.fn();

  vi.doMock("react-native", () => ({
    View: ({
      accessibilityLabel,
      children,
    }: {
      accessibilityLabel?: string;
      children?: ReactNode;
    }) => <div aria-label={accessibilityLabel}>{children}</div>,
  }));
  vi.doMock("./GlassSurface", () => ({ GlassSurface: Container }));
  vi.doMock("./Field", () => ({
    FormError: ({ children }: { children?: ReactNode }) => <p role="alert">{children}</p>,
  }));
  vi.doMock("./Surface", () => ({ List: Container, Row: Container, Skeleton: () => null }));
  vi.doMock("./Sheet", () => ({
    Sheet: ({
      footer,
      children,
      ...rest
    }: SheetFlags & { footer?: ReactNode; children?: ReactNode }) => {
      flags = rest;

      return (
        <section>
          {children}
          <footer>{footer}</footer>
        </section>
      );
    },
  }));
  vi.doMock("../../../modules/native-search-bar/src", () => ({
    NativeSearchBar: ({
      text,
      placeholder,
      onChangeText,
    }: {
      text: string;
      placeholder: string;
      onChangeText: (event: { nativeEvent: { text: string } }) => void;
    }) => (
      <input
        data-native-search
        placeholder={placeholder}
        value={text}
        onChange={(event) => onChangeText({ nativeEvent: { text: event.target.value } })}
      />
    ),
  }));

  const { SearchablePickerSheet } = await import("./SearchablePickerSheet.ios");
  const host = document.createElement("div");
  const root = createRoot(host);

  const render = (props: { loading?: boolean; error?: string | null }) =>
    act(async () =>
      root.render(
        <SearchablePickerSheet
          open
          title="Casino"
          placeholder="Search casinos"
          query="bel"
          onQueryChange={typed}
          onClose={() => {}}
          {...props}
        >
          <p>Rows</p>
        </SearchablePickerSheet>,
      ),
    );

  try {
    await render({ loading: true });
    const input = host.querySelector<HTMLInputElement>("input[data-native-search]")!;

    expect(flags).toMatchObject({ large: true, back: true, floatingFooter: true });
    expect(input.value).toBe("bel");
    expect(input.placeholder).toBe("Search casinos");
    expect(host.querySelector('[aria-label="Loading"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Rows");

    await render({ loading: false, error: "Couldn't save that casino right now." });
    expect(host.querySelector('[aria-label="Loading"]')).toBeNull();
    expect(host.textContent).toContain("Rows");

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

    await act(async () => {
      setValue.call(input, "bell");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(typed).toHaveBeenCalledWith("bell");
    expect(host.querySelector("footer")!.textContent).toContain("Couldn't save that casino");
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

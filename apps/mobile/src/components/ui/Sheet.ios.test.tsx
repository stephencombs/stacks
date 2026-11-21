import * as Predicate from "effect/Predicate";
import { act, use, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type HeaderBarItem = {
  readonly type: string;
  readonly icon?: { readonly type: string; readonly name: string };
  readonly accessibilityLabel?: string;
  readonly identifier?: string;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
};

type HeaderConfigSnapshot = {
  readonly title?: string;
  readonly backgroundColor?: unknown;
  readonly translucent?: boolean;
  readonly headerLeftBarButtonItems?: ReadonlyArray<HeaderBarItem>;
  readonly headerRightBarButtonItems?: ReadonlyArray<HeaderBarItem>;
};

type FormSheetSnapshot = {
  readonly isOpen: boolean;
  readonly nativeContainerStyle?: { readonly backgroundColor?: unknown };
  readonly onDismiss?: () => void;
  readonly onNativeDismiss?: () => void;
};

const setupSheetTest = async (themeMode: "light" | "dark" = "light") => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const formSheetTransitions: boolean[] = [];
  let latestFormSheet: FormSheetSnapshot | null = null;
  let latestHeader: HeaderConfigSnapshot | null = null;

  const cssVars = new Map([
    ["--color-canvas", "#f4f4f6"],
    ["--color-surface", "#323236"],
    ["--color-ink", "#fafafa"],
  ]);

  vi.doMock("react-native", () => ({
    Animated: {
      Value: class {
        setValue() {}
        stopAnimation() {}
      },
      View: Container,
    },
    Keyboard: { addListener: () => ({ remove: () => {} }) },
    ScrollView: Container,
    Text: Container,
    TextInput: { State: { currentlyFocusedInput: () => null } },
    View: Container,
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  }));
  vi.doMock("./motion", () => ({
    animate: () => {},
    duration: { menuIn: 200 },
    ease: { enter: () => 0 },
    useReducedMotion: () => false,
  }));
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 44, right: 0, bottom: 34, left: 0 }),
  }));
  vi.doMock("react-native-screens", () => ({
    Screen: Container,
    ScreenStack: Container,
    ScreenStackHeaderConfig: (props: HeaderConfigSnapshot) => {
      latestHeader = props;

      return null;
    },
  }));
  vi.doMock("react-native-screens/experimental", () => ({
    FormSheet: ({
      isOpen,
      nativeContainerStyle,
      onDismiss,
      onNativeDismiss,
      children,
    }: FormSheetSnapshot & { children?: ReactNode }) => {
      formSheetTransitions.push(isOpen);
      latestFormSheet = { isOpen, nativeContainerStyle, onDismiss, onNativeDismiss };

      return <div data-open={String(isOpen)}>{children}</div>;
    },
  }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: themeMode }),
    useCSSVariable: (names: ReadonlyArray<string> | string) =>
      Predicate.isString(names) ? cssVars.get(names) : names.map((name) => cssVars.get(name)),
  }));

  const mod = await import("./Sheet.ios");
  const { InSheet } = await import("./sheetContext");

  return {
    ...mod,
    InSheet,
    formSheetTransitions,
    getLatestFormSheet: () => latestFormSheet,
    getLatestHeader: () => latestHeader,
  };
};

it("keeps the FormSheet open across same-tick child sheet swaps and shows a back button", async () => {
  const { Sheet, SheetHost, formSheetTransitions, getLatestHeader, getLatestFormSheet } =
    await setupSheetTest();

  function ActiveSheet({
    open,
    onOpenChange,
  }: {
    open: "edit" | "buy_in" | null;
    onOpenChange: (next: "edit" | "buy_in" | null) => void;
  }) {
    if (open === "edit") {
      return (
        <Sheet open title="Edit my session" onClose={() => onOpenChange(null)}>
          <button onClick={() => onOpenChange("buy_in")}>Edit buy-in</button>
        </Sheet>
      );
    }

    if (open === "buy_in") {
      return (
        <Sheet open back title="Buy-in" onClose={() => onOpenChange("edit")}>
          <div>Buy-in form</div>
        </Sheet>
      );
    }

    return null;
  }

  function Flow() {
    const [open, setOpen] = useState<"edit" | "buy_in" | null>("edit");

    return (
      <SheetHost>
        <ActiveSheet open={open} onOpenChange={setOpen} />
      </SheetHost>
    );
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<Flow />));
  expect(formSheetTransitions.every(Boolean)).toBe(true);
  expect(getLatestHeader()?.title).toBe("Edit my session");
  expect(getLatestHeader()?.headerRightBarButtonItems?.[0]?.icon?.name).toBe("xmark");
  expect(getLatestHeader()?.headerLeftBarButtonItems).toEqual([]);

  const countBeforeSwap = formSheetTransitions.length;
  const openChild = container.querySelector("button")!;

  await act(async () => openChild.click());

  expect(formSheetTransitions.slice(countBeforeSwap).every(Boolean)).toBe(true);
  expect(getLatestHeader()?.title).toBe("Buy-in");
  expect(getLatestHeader()?.headerLeftBarButtonItems?.[0]?.icon?.name).toBe("chevron.backward");
  expect(getLatestHeader()?.headerRightBarButtonItems).toEqual([]);

  const countBeforeBack = formSheetTransitions.length;

  await act(async () => getLatestHeader()?.headerLeftBarButtonItems?.[0]?.onPress?.());

  expect(formSheetTransitions.slice(countBeforeBack).every(Boolean)).toBe(true);
  expect(getLatestHeader()?.title).toBe("Edit my session");

  await act(async () => getLatestHeader()?.headerRightBarButtonItems?.[0]?.onPress?.());
  expect(getLatestFormSheet()?.isOpen).toBe(false);
  await act(async () => root.unmount());
});

it("keeps FormSheet open across always-mounted sheet swaps regardless of order", async () => {
  const { Sheet, SheetHost, formSheetTransitions, getLatestHeader } = await setupSheetTest();

  function Swapper() {
    const [step, setStep] = useState<"second" | "first">("first");

    return (
      <SheetHost>
        <Sheet open={step === "second"} back title="Second" onClose={() => setStep("first")} />
        <Sheet open={step === "first"} title="First" onClose={() => {}}>
          <button onClick={() => setStep("second")}>Next</button>
        </Sheet>
      </SheetHost>
    );
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<Swapper />));
  expect(getLatestHeader()?.title).toBe("First");

  const mark = formSheetTransitions.length;
  await act(async () => container.querySelector("button")!.click());

  expect(getLatestHeader()?.title).toBe("Second");
  expect(formSheetTransitions.slice(mark).every(Boolean)).toBe(true);
  await act(async () => root.unmount());
});

it("applies dark surface elevation, opaque header, and InSheet context inside sheets", async () => {
  const { Sheet, SheetHost, InSheet, getLatestFormSheet, getLatestHeader } =
    await setupSheetTest("dark");

  function Probe() {
    const inSheet = use(InSheet);

    return <div data-in-sheet={String(inSheet)}>Inside</div>;
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () =>
    root.render(
      <SheetHost>
        <Sheet open title="Settings" onClose={() => {}}>
          <Probe />
        </Sheet>
      </SheetHost>,
    ),
  );

  expect(container.querySelector("[data-in-sheet]")?.getAttribute("data-in-sheet")).toBe("true");
  expect(getLatestFormSheet()?.nativeContainerStyle?.backgroundColor).toBe("#323236");
  expect(getLatestHeader()?.backgroundColor).toBe("#323236");
  expect(getLatestHeader()?.translucent).toBe(false);
  await act(async () => root.unmount());
});

it("resets native presentation state on swipe down so parent sheets re-open cleanly", async () => {
  const { Sheet, SheetHost, formSheetTransitions, getLatestFormSheet, getLatestHeader } =
    await setupSheetTest();

  function ActiveSheet({
    open,
    onOpenChange,
  }: {
    open: "edit" | "venue" | null;
    onOpenChange: (next: "edit" | "venue" | null) => void;
  }) {
    if (open === "edit")
      return <Sheet open title="Edit my session" onClose={() => onOpenChange(null)} />;

    if (open === "venue")
      return <Sheet open back title="Casino" onClose={() => onOpenChange("edit")} />;

    return null;
  }

  function Flow() {
    const [open, setOpen] = useState<"edit" | "venue" | null>("venue");

    return (
      <SheetHost>
        <ActiveSheet open={open} onOpenChange={setOpen} />
      </SheetHost>
    );
  }

  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<Flow />));
  const mark = formSheetTransitions.length;

  await act(async () => getLatestFormSheet()?.onNativeDismiss?.());

  expect(formSheetTransitions.slice(mark)).toContain(false);
  expect(getLatestFormSheet()?.isOpen).toBe(true);
  expect(getLatestHeader()?.title).toBe("Edit my session");
  await act(async () => root.unmount());
});

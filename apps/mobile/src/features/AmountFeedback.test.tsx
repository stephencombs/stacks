import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { AmountFeedback } from "./AmountFeedback";

vi.mock("react-native", () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <div data-class={className}>{children}</div>
  ),
}));

vi.mock("../components/ui/Icon", () => ({ Icon: () => null }));

vi.mock("../components/ui/Text", () => ({
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

const render = async (node: ReactNode) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(node));

  return { container, root };
};

const reserved = (container: HTMLElement) =>
  container.firstElementChild?.getAttribute("data-class");

it("reserves the same one-line slot empty, with a hint and with an error", async () => {
  const empty = await render(<AmountFeedback error={null} />);
  const hinted = await render(<AmountFeedback error={null} hint="Your buy-in becomes $2,005" />);
  const failed = await render(<AmountFeedback error="Enter an amount." hint="Ignored" />);

  expect(reserved(empty.container)).toContain("min-h-5");
  expect(empty.container.textContent).toBe("");
  expect(reserved(hinted.container)).toBe(reserved(empty.container));
  expect(hinted.container.textContent).toBe("Your buy-in becomes $2,005");
  expect(reserved(failed.container)).toBe(reserved(empty.container));
  expect(failed.container.textContent).toBe("Enter an amount.");
});

it("reserves two lines for a breakdown that wraps", async () => {
  const { container } = await render(<AmountFeedback error={null} lines={2} />);

  expect(reserved(container)).toContain("min-h-10");
});

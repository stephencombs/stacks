import "~/index.css";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import { Current } from "./Current";
import { Ledger } from "./Ledger";
import { Rail } from "./Rail";
import { Workspace } from "./Workspace";

const variants: Array<[string, ComponentType]> = [
  ["Current", Current],
  ["Rail", Rail],
  ["Ledger", Ledger],
  ["Workspace", Workspace],
];

function Harness() {
  const [current, setCurrent] = useState(
    () => Math.min(variants.length, Math.max(1, Number(new URLSearchParams(location.search).get("v")) || 1)) - 1,
  );
  const picker = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const set = (i: number) => {
    if (i < 0 || i >= variants.length) return;
    setCurrent(i);
    const url = new URL(location.href);
    url.searchParams.set("v", String(i + 1));
    history.replaceState(null, "", url);
  };
  useLayoutEffect(() => {
    const move = () => {
      const el = items.current[current];
      if (!el || !highlight.current) return;
      highlight.current.style.width = `${el.offsetWidth}px`;
      highlight.current.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, [current]);
  useLayoutEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => picker.current?.setAttribute("data-ready", "")));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= variants.length) set(n - 1);
      else if (e.key === "ArrowRight") setCurrent((c) => { const i = (c + 1) % variants.length; set(i); return i; });
      else if (e.key === "ArrowLeft") setCurrent((c) => { const i = (c - 1 + variants.length) % variants.length; set(i); return i; });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const Variant = variants[current]![1];
  return (
    <>
      <Variant key={current} />
      <nav ref={picker} className="proto-picker" aria-label="Prototype variants">
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {variants.map(([name], i) => (
          <button
            key={name}
            ref={(el) => { items.current[i] = el; }}
            className="proto-picker-item"
            data-active={i === current ? "" : undefined}
            aria-current={i === current ? "true" : undefined}
            onClick={() => set(i)}
          >
            {name}
          </button>
        ))}
      </nav>
    </>
  );
}

const router = createRouter({
  routeTree: createRootRoute({ component: Harness }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useVisualViewport } from "~/lib/useVisualViewport";
import { cn } from "./cn";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  const viewport = useVisualViewport();
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden className="shrink-0 lg:hidden" style={{ height }} />
      <div
        ref={bar}
        data-page-actions
        style={{
          bottom: `calc(3.5rem + env(safe-area-inset-bottom) + ${viewport?.bottom ?? 0}px)`,
        }}
        className={cn(
          "fixed inset-x-0 z-10 border-t border-line bg-canvas lg:static lg:border-0",
          className,
        )}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-3 lg:max-w-none lg:p-0">
          {children}
        </div>
      </div>
    </>
  );
}

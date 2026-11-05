import { useEffect, useState } from "react";
import { visualKeyboardOverlap } from "./keyboardOverlap";

export function useVisualViewport(enabled = true) {
  const [frame, setFrame] = useState<{ height: number; bottom: number }>();
  useEffect(() => {
    if (!enabled) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const height = viewport.height;
      const bottom = visualKeyboardOverlap(window.innerHeight, height, viewport.offsetTop);
      setFrame((current) =>
        current?.height === height && current.bottom === bottom ? current : { height, bottom },
      );
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return frame;
}

import { useLayoutEffect, useRef, useState } from "react";

/** An element's width as it lays out, for charts drawn to fit it. 0 until it has one. */
export const useWidth = <E extends HTMLElement>() => {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current!;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/**
 * Color Up's motion, for both clients. Mobile animates with these directly; web mirrors them as CSS
 * variables in `apps/web/src/index.css`, and `apps/web/src/design/motion.test.ts` holds the two
 * together.
 */

/** Cubic-bezier control points. Enter on `enter`, leave on `exit`, and press down on `press`. */
export const easing = {
  enter: [0.32, 0.72, 0, 1],
  exit: [0.4, 0, 1, 1],
  press: [0.2, 0, 0, 1],
} as const;

/** Milliseconds. An exit is always faster than its enter. */
export const duration = {
  menuIn: 200,
  menuOut: 150,
  sheetIn: 340,
  sheetOut: 240,
  roll: 220,
  toastIn: 250,
  toastOut: 160,
  pressDown: 100,
  pressUp: 150,
} as const;

/** How far a pressed control shrinks. */
export const pressScale = 0.96;

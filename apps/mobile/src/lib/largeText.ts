const LARGE_TEXT_SCALE = 1.3;

/** Whether the system font is big enough that side-by-side rows should stack instead of squeezing. */
export const isLargeText = (fontScale: number) => fontScale >= LARGE_TEXT_SCALE;

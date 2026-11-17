/** Material's segmented button pads 12 each side, and a selected segment adds an 18 check and 8 gap. */
const SEGMENT_CHROME = 12 * 2 + 18 + 8;
const LABEL_SIZE = 14;

/** Width of a character in em for Roboto Medium, by shape class: close enough to pick a control. */
function em(char: string) {
  if (char === " ") return 0.26;
  if ("ijlt.,'!|fIr".includes(char)) return 0.3;
  if ("mwMW".includes(char)) return 0.85;
  if (/[A-Z0-9$]/.test(char)) return 0.62;
  return 0.56;
}

/** The width in dp a segment needs to show its whole label at the system's font scale. */
function segmentWidth(label: string, fontScale: number) {
  let ems = 0;
  for (const char of label) ems += em(char);
  return ems * LABEL_SIZE * fontScale + SEGMENT_CHROME;
}

/**
 * Whether the options fit as a segmented control, which Material limits to a few short labels,
 * in a row `rowWidth` dp wide. Otherwise they belong in a dropdown.
 */
export function fitsSegments(labels: ReadonlyArray<string>, rowWidth: number, fontScale: number) {
  if (labels.length < 2 || labels.length > 3) return false;
  const each = rowWidth / labels.length;
  return labels.every((label) => segmentWidth(label, fontScale) <= each);
}

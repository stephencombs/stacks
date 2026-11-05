/**
 * Screen Y of a sheet's bottom edge.
 *
 * `measureInWindow` on a page sheet sometimes starts at the screen (`y` is the gap
 * above the sheet) and sometimes at the sheet itself (`y` is 0). A phone sheet
 * still ends at the bottom of the screen, so a zero origin means the screen bottom.
 */
export function sheetBottomEdge(
  screenHeight: number,
  frame: { readonly y: number; readonly height: number },
) {
  if (frame.y <= 1) return screenHeight;
  return Math.round(frame.y + frame.height);
}

/**
 * How much of a view's bottom a keyboard covers.
 *
 * Keyboard frames are in screen coordinates. A page sheet's own layout starts at
 * 0, so comparing the two — what KeyboardAvoidingView does — stops short by the
 * gap above the sheet and leaves the footer under the keyboard.
 */
export function keyboardOverlap(
  viewBottom: number,
  keyboard: { readonly screenY: number; readonly height: number },
) {
  if (keyboard.height <= 0 || viewBottom <= 0) return 0;
  // A missing origin still means a docked keyboard; its height is the overlap.
  if (keyboard.screenY <= 0) return Math.max(0, Math.round(keyboard.height));
  return Math.max(0, Math.round(Math.min(keyboard.height, viewBottom - keyboard.screenY)));
}

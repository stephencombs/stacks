import type { ReactNode } from "react";

import { toolbarParts, type ToolbarPlacement } from "./toolbarParts";

export type ToolbarProps = { placement: ToolbarPlacement; children?: ReactNode };

/** The native navigation bar's items on iOS; Android keeps its own header controls. */
export const Toolbar = Object.assign((_props: ToolbarProps) => null, toolbarParts);

import type { EntryId } from "@stacks/contracts";
import type { TableAction, TableSeat } from "@stacks/client-runtime/liveTable";

export type OpenSheet =
  | {
      readonly type:
        | "trip"
        | "edit"
        | "history"
        | "rebuy"
        | "cash_out"
        | "reopen"
        | "return"
        | "buy_in"
        | "start_time"
        | "game"
        | "venue";
    }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit" | "delete_table"> }
  | { readonly type: "seat"; readonly seat: TableSeat };

/** What each field of Edit opens, so closing or saving one lands back in Edit. */
const editChildren: ReadonlySet<OpenSheet["type"]> = new Set([
  "buy_in",
  "start_time",
  "game",
  "venue",
  "trip",
  "history",
]);

/** The sheet to show once the open one closes or saves: Edit for its fields, else none. */
export const afterClosing = (open: OpenSheet | null): OpenSheet | null =>
  open && editChildren.has(open.type) ? { type: "edit" } : null;

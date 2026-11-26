import type { EntryId, SeatingId } from "@stacks/contracts";
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
        | "seat"
        | "start_time"
        | "game"
        | "venue";
    }
  | { readonly type: "inspect" | "correct" | "void"; readonly entryId: EntryId }
  | { readonly type: "inspect_seating" | "void_seating"; readonly seatingId: SeatingId }
  | { readonly type: "action"; readonly action: Exclude<TableAction, "edit" | "delete_table"> }
  | { readonly type: "player_seat"; readonly seat: TableSeat };

const editChildren: ReadonlySet<OpenSheet["type"]> = new Set([
  "buy_in",
  "seat",
  "start_time",
  "game",
  "venue",
  "trip",
  "history",
]);

/** The sheet to show once the open one closes or saves: Edit for its fields, else none. */
export const afterClosing: (open: OpenSheet | null) => OpenSheet | null = (open) =>
  open && editChildren.has(open.type) ? { type: "edit" } : null;

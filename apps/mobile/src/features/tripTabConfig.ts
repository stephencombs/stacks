import type { SFSymbol } from "expo-symbols";

export type TripTab = "table" | "board" | "money";

export const tripTabs = {
  table: { route: "Table", label: "Table", symbol: "suit.club.fill" },
  board: { route: "Board", label: "Board", symbol: "list.number" },
  money: { route: "Money", label: "Money", symbol: "dollarsign.circle" },
} as const satisfies Record<TripTab, { route: string; label: string; symbol: SFSymbol }>;

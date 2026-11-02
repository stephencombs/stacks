import type { SFSymbol } from "expo-symbols";

export type TripTab = "table" | "board" | "money";

export const tripTabs = {
  table: { route: "Sessions", label: "Sessions", symbol: "suit.club.fill" },
  board: { route: "Results", label: "Results", symbol: "list.number" },
  money: { route: "SettleUp", label: "Settle up", symbol: "dollarsign.circle" },
} as const satisfies Record<TripTab, { route: string; label: string; symbol: SFSymbol }>;

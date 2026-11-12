import { createContext, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";

import type { ShowsTable } from "../features/LiveBar";

const hasNativeLiveAccessory =
  Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;

export const LiveAccessoryContext = createContext<{
  shows: ShowsTable | undefined;
  setShows: (shows: ShowsTable | undefined) => void;
} | null>(null);

export function LiveAccessoryProvider({ children }: { children: ReactNode }) {
  const [shows, setShows] = useState<ShowsTable>();
  const value = useMemo(() => (hasNativeLiveAccessory ? { shows, setShows } : null), [shows]);
  return <LiveAccessoryContext value={value}>{children}</LiveAccessoryContext>;
}

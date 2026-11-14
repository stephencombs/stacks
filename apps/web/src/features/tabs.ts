export type Tab = "play" | "stats" | "map" | "crew";

/** Which tab a page belongs to. Groups, trips and their sessions are pushed onto Crew. */
export const tabOf = (pathname: string): Tab =>
  pathname.startsWith("/stats")
    ? "stats"
    : pathname.startsWith("/map")
      ? "map"
      : /^\/(crew|groups|trips|sessions)(\/|$)/.test(pathname)
        ? "crew"
        : "play";

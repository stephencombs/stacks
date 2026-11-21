/**
 * A trip's Board and Results and a group's Stats moved into the Stats tab, with the trip or group
 * picked. Links to the old addresses still land there.
 */
export const oldAddress = (path: string) => {
  const [, kind, id, page] =
    /^\/?(trips|groups)\/([^/?#]+)\/(board|results|stats)(?:[?#].*)?$/.exec(path) ?? [];

  if (kind === "trips" && (page === "board" || page === "results")) return `stats?tripId=${id}`;

  if (kind === "groups" && page === "stats") return `stats?groupId=${id}`;

  return path;
};
